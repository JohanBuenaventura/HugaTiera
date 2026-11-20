const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')
const { computeConductScore, computeLocationProximity } = require('../utils/smartMatching')

let server
let baseUrl
let clientCookie
let otherClientCookie
let gardenerTopCookie
let gardenerFarCookie
let clientId
let gardenerTopId
let gardenerFarId
let categoryId
const createdUserIds = []
const createdServiceIds = []
const createdInquiryIds = []
const createdReportIds = []

async function api(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  const setCookie = response.headers.get('set-cookie')
  return {
    status: response.status,
    cookie: setCookie ? setCookie.split(';')[0] : null,
    data,
  }
}

describe('Smart AI Filtering & Recommendations (Nearby Barangay Proximity, High Reviews & Good Conduct)', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const hash = await bcrypt.hash('Password123!', 10)
    for (const u of [
      { key: 'client', role: 'client', first: 'SmartClient', area: 'Tetuan' },
      { key: 'other', role: 'client', first: 'OtherSmartClient', area: 'Guiwan' },
      { key: 'top', role: 'gardener', first: 'TopGardener', area: 'Tetuan, Zamboanga City', biz: `Tetuan Elite Gardens ${runId}` },
      { key: 'far', role: 'gardener', first: 'FarGardener', area: 'Labuan, Zamboanga City', biz: `Labuan Yard Crew ${runId}` },
    ]) {
      const email = `smart.${u.key}.${runId}@hugatiera.test`
      const [ins] = await pool.execute(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, "Test", "09171234567", "1992-06-06")',
        [email, hash, u.role, u.first],
      )
      createdUserIds.push(ins.insertId)
      if (u.role === 'client') {
        if (u.key === 'client') clientId = ins.insertId
        await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, ?, "Zamboanga City")', [ins.insertId, u.area])
      } else {
        if (u.key === 'top') gardenerTopId = ins.insertId
        if (u.key === 'far') gardenerFarId = ins.insertId
        await pool.execute(
          'INSERT INTO gardener_profiles (user_id, business_name, service_area, years_of_experience, is_approved) VALUES (?, ?, ?, ?, TRUE)',
          [ins.insertId, u.biz, u.area, u.key === 'top' ? 6 : 2],
        )
      }
      const login = await api('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } })
      assert.equal(login.status, 200)
      if (u.key === 'client') clientCookie = login.cookie
      if (u.key === 'other') otherClientCookie = login.cookie
      if (u.key === 'top') gardenerTopCookie = login.cookie
      if (u.key === 'far') gardenerFarCookie = login.cookie
    }

    const [cats] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    categoryId = cats[0].id

    // Create services for both gardeners with unique runId keyword
    const [svcTop] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, ?, 'Eco lawn care and pruning', 1200.00, 'per visit', 'Tetuan, Zamboanga City')`,
      [gardenerTopId, categoryId, `SmartMatch Lawn Care ${runId}`],
    )
    createdServiceIds.push(svcTop.insertId)

    const [svcFar] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, ?, 'Basic lawn cutting', 1000.00, 'per visit', 'Labuan, Zamboanga City')`,
      [gardenerFarId, categoryId, `SmartMatch Lawn Care ${runId}`],
    )
    createdServiceIds.push(svcFar.insertId)

    // Give TopGardener a verified closed booking + 5-star review + 1 typhoon cancellation (should NOT hurt conduct!)
    const [bkClosed] = await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, service_id, scheduled_start, scheduled_end, location, status, booking_stage, payment_status, amount_paid, transaction_status, transaction_closed_at)
       VALUES (?, ?, ?, '2026-10-01 08:00:00', '2026-10-01 12:00:00', 'Tetuan, Zamboanga City', 'completed', 'booked', 'fully_paid', 1200.00, 'closed', NOW())`,
      [clientId, gardenerTopId, svcTop.insertId],
    )
    await pool.execute(
      'INSERT INTO reviews (booking_id, client_id, gardener_id, rating, review_text) VALUES (?, ?, ?, 5, "Punctual, clean work, very respectful!")',
      [bkClosed.insertId, clientId, gardenerTopId],
    )
    await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, service_id, scheduled_start, scheduled_end, location, status, cancellation_reason_type, cancellation_reason, cancelled_by, cancelled_at)
       VALUES (?, ?, ?, '2026-10-05 08:00:00', '2026-10-05 12:00:00', 'Tetuan, Zamboanga City', 'cancelled', 'typhoon_weather', 'Signal #2 typhoon', ?, NOW())`,
      [clientId, gardenerTopId, svcTop.insertId, gardenerTopId],
    )

    // Give FarGardener 1 resolved misconduct report -> should lower conduct & fail goodConductOnly
    const [rep] = await pool.execute(
      `INSERT INTO reports (reporter_id, reported_user_id, reason, status)
       VALUES (?, ?, 'Unprofessional conduct during site visit', 'resolved')`,
      [clientId, gardenerFarId],
    )
    createdReportIds.push(rep.insertId)
  })

  after(async () => {
    try {
      if (createdReportIds.length > 0) {
        await pool.query('DELETE FROM reports WHERE id IN (?)', [createdReportIds])
      }
      if (createdInquiryIds.length > 0) {
        await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM quotations WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM request_events WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM inquiries WHERE id IN (?)', [createdInquiryIds])
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM reviews WHERE client_id IN (?) OR gardener_id IN (?)', [createdUserIds, createdUserIds])
        await pool.query('DELETE FROM bookings WHERE client_id IN (?) OR gardener_id IN (?)', [createdUserIds, createdUserIds])
      }
      if (createdServiceIds.length > 0) {
        await pool.query('DELETE FROM services WHERE id IN (?)', [createdServiceIds])
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  it('scores Zamboanga City barangay proximity and conduct fairly without penalizing typhoon cancellations', () => {
    const exact = computeLocationProximity('Tetuan, Zamboanga City', 'Tetuan, Zamboanga City')
    assert.equal(exact.score, 100)
    assert.equal(exact.isNearby, true)

    const sameDistrict = computeLocationProximity('Tetuan, Zamboanga City', 'Guiwan, Zamboanga City')
    assert.equal(sameDistrict.tier, 'same_district')
    assert.equal(sameDistrict.isNearby, true)

    const diffDistrict = computeLocationProximity('Tetuan, Zamboanga City', 'Labuan, Zamboanga City')
    assert.equal(diffDistrict.isNearby, false)
    assert.ok(exact.score > sameDistrict.score && sameDistrict.score > diffDistrict.score)

    const goodConduct = computeConductScore({
      averageRating: 5,
      reviewCount: 2,
      completedJobs: 2,
      closedJobs: 2,
      avoidableCancellations: 0,
      substantiatedReports: 0,
    })
    assert.equal(goodConduct.cleanConduct, true)
    assert.equal(goodConduct.tierLabel, 'Top-Rated & Reliable')

    const poorConduct = computeConductScore({
      averageRating: 2.5,
      reviewCount: 2,
      avoidableCancellations: 2,
      totalBookings: 4,
      substantiatedReports: 1,
    })
    assert.equal(poorConduct.cleanConduct, false)
    assert.ok(goodConduct.conductScore > poorConduct.conductScore)
  })

  it('ranks and filters services for clients by nearby barangay, high review score, and good conduct of service', async () => {
    const res = await api(`/ai/recommendations?mode=services&keyword=${runId}&location=Tetuan,%20Zamboanga%20City`, {
      headers: { Cookie: clientCookie },
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.recommendations.length, 2)
    assert.equal(res.data.recommendations[0].gardener_id, gardenerTopId)
    assert.equal(res.data.recommendations[0].ai_match.conduct.cleanConduct, true)
    assert.equal(res.data.recommendations[0].ai_match.proximity.isNearby, true)
    assert.equal(res.data.recommendations[1].gardener_id, gardenerFarId)
    assert.equal(res.data.recommendations[1].ai_match.conduct.cleanConduct, false)

    // nearbyOnly + goodConductOnly + minRating=4 keeps only TopGardener
    const filtered = await api(`/ai/recommendations?mode=services&keyword=${runId}&location=Tetuan&nearbyOnly=true&goodConductOnly=true&minRating=4`, {
      headers: { Cookie: clientCookie },
    })
    assert.equal(filtered.status, 200)
    assert.equal(filtered.data.recommendations.length, 1)
    assert.equal(filtered.data.recommendations[0].gardener_id, gardenerTopId)
  })

  it('filters & ranks received offers on a client inquiry and open nearby leads for approved gardeners', async () => {
    // Client posts a general request in Tetuan
    const createInq = await api('/inquiries', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        requestType: 'general',
        categoryId,
        subject: `Tetuan Backyard Trimming ${runId}`,
        description: 'Overgrown yard needing trim and cleanup.',
        location: 'Tetuan, Zamboanga City',
        areaSqm: 20,
      },
    })
    assert.equal(createInq.status, 201)
    const inquiryId = createInq.data.id
    createdInquiryIds.push(inquiryId)

    // Gardener (Tetuan) queries nearby open leads -> finds the Tetuan request with high proximity score
    const leadsRes = await api(`/ai/recommendations?mode=leads&keyword=${runId}&nearbyOnly=true`, {
      headers: { Cookie: gardenerTopCookie },
    })
    assert.equal(leadsRes.status, 200)
    assert.equal(leadsRes.data.recommendations.length, 1)
    assert.equal(leadsRes.data.recommendations[0].id, inquiryId)
    assert.equal(leadsRes.data.recommendations[0].ai_match.proximity.score, 100)

    // Client cannot access gardener leads mode -> 403
    const clientLeads = await api('/ai/recommendations?mode=leads', { headers: { Cookie: clientCookie } })
    assert.equal(clientLeads.status, 403)

    // Both gardeners send offers on the inquiry
    const qTop = await api(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      headers: { Cookie: gardenerTopCookie },
      body: { amount: 1500, details: 'Full trim and haul away from Tetuan team.' },
    })
    assert.equal(qTop.status, 201)
    const qFar = await api(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      headers: { Cookie: gardenerFarCookie },
      body: { amount: 1300, details: 'Basic trim from Labuan.' },
    })
    assert.equal(qFar.status, 201)

    // Other client cannot filter offers on someone else's inquiry -> 403
    const otherOffers = await api(`/ai/recommendations?mode=offers&inquiryId=${inquiryId}`, {
      headers: { Cookie: otherClientCookie },
    })
    assert.equal(otherOffers.status, 403)

    // Owning client filters offers: AI Smart Match ranks TopGardener #1; goodConductOnly filters out FarGardener
    const smartOffers = await api(`/ai/recommendations?mode=offers&inquiryId=${inquiryId}&sortBy=smart_ai`, {
      headers: { Cookie: clientCookie },
    })
    assert.equal(smartOffers.status, 200)
    assert.equal(smartOffers.data.recommendations.length, 2)
    assert.equal(smartOffers.data.recommendations[0].gardener_id, gardenerTopId)

    const cleanOffers = await api(`/ai/recommendations?mode=offers&inquiryId=${inquiryId}&goodConductOnly=true`, {
      headers: { Cookie: clientCookie },
    })
    assert.equal(cleanOffers.status, 200)
    assert.equal(cleanOffers.data.recommendations.length, 1)
    assert.equal(cleanOffers.data.recommendations[0].gardener_id, gardenerTopId)

    // On-demand advisory summary endpoint works cleanly
    const summaryRes = await api('/ai/recommendations/summary', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        mode: 'offers',
        referenceLocation: 'Tetuan, Zamboanga City',
        items: smartOffers.data.recommendations.map((o) => ({
          gardenerName: o.business_name || o.gardener_name,
          matchScore: o.ai_match.matchScore,
          price: o.amount,
          reasons: o.ai_match.reasons,
        })),
      },
    })
    assert.equal(summaryRes.status, 200)
    assert.ok(summaryRes.data.summary.length > 20)
  })
})
