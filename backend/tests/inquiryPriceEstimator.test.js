const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

let server
let baseUrl
let clientCookie
let gardenerCookie
let clientId
let gardenerId
let serviceId
let landscapingCategoryId
const createdUserIds = []
const createdInquiryIds = []

async function api(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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

describe('Inquiry Per-Sq.m Amount Predictor, Client Price Comment & On-Site Inspection Flag', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const hash = await bcrypt.hash('Password123!', 10)
    const [cRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, "client", "Est", "Client", "09171234567", "1995-05-05")',
      [`est.client.${runId}@hugatiera.test`, hash],
    )
    clientId = cRes.insertId
    createdUserIds.push(clientId)
    await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, "Tetuan", "Zamboanga City")', [clientId])

    const [gRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, "gardener", "Est", "Gardener", "09181234567", "1990-05-05")',
      [`est.gardener.${runId}@hugatiera.test`, hash],
    )
    gardenerId = gRes.insertId
    createdUserIds.push(gardenerId)
    await pool.execute('INSERT INTO gardener_profiles (user_id, business_name, is_approved) VALUES (?, "Est Gardens", TRUE)', [gardenerId])

    const [cats] = await pool.execute("SELECT id FROM service_categories WHERE name = 'Landscaping' LIMIT 1")
    landscapingCategoryId = cats[0].id

    const [svcRes] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, 'Per-Sqm Lawn Trimming', 'Measured lawn service', 100.00, 'per sq.m', 'Zamboanga City')`,
      [gardenerId, landscapingCategoryId],
    )
    serviceId = svcRes.insertId

    const cLogin = await api('/auth/login', { method: 'POST', body: { email: `est.client.${runId}@hugatiera.test`, password: 'Password123!' } })
    clientCookie = cLogin.cookie
    const gLogin = await api('/auth/login', { method: 'POST', body: { email: `est.gardener.${runId}@hugatiera.test`, password: 'Password123!' } })
    gardenerCookie = gLogin.cookie
  })

  after(async () => {
    if (createdInquiryIds.length > 0) {
      await pool.query('DELETE FROM inquiries WHERE id IN (?)', [createdInquiryIds])
    }
    if (serviceId) {
      await pool.query('DELETE FROM services WHERE id = ?', [serviceId])
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
    }
    if (server) await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  it('computes live estimates via POST /api/inquiries/estimate using category and per-sq.m service rates and rejects invalid inputs', async () => {
    const invalidArea = await api('/inquiries/estimate', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { areaSqm: -10, categoryId: landscapingCategoryId },
    })
    assert.equal(invalidArea.status, 400)

    // Landscaping baseline: 250-500/m2, area 20m2, heavy (1.35), gardener_provides (1.35)
    const catEst = await api('/inquiries/estimate', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        areaSqm: 20,
        categoryId: landscapingCategoryId,
        workComplexity: 'heavy',
        materialsOption: 'gardener_provides',
      },
    })
    assert.equal(catEst.status, 200)
    assert.equal(catEst.data.estimate.rateSource, 'category_baseline')
    assert.equal(catEst.data.estimate.estimatedMinAmount, 9110) // 20 * 250 * 1.35 * 1.35 = 9112.5 -> 9110
    assert.equal(catEst.data.estimate.estimatedMaxAmount, 18230) // 20 * 500 * 1.35 * 1.35 = 18225 -> 18230

    // Per-sq.m service rate (100/sq.m -> 90..115/m2), area 30m2, moderate (1.0), labor only (1.0)
    const svcEst = await api('/inquiries/estimate', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        areaSqm: 30,
        serviceId,
        workComplexity: 'moderate',
        materialsOption: 'client_provides',
      },
    })
    assert.equal(svcEst.status, 200)
    assert.equal(svcEst.data.estimate.rateSource, 'service_per_sqm')
    assert.equal(svcEst.data.estimate.estimatedMinAmount, 2700) // 30 * 90
    assert.equal(svcEst.data.estimate.estimatedMaxAmount, 3450) // 30 * 115
  })

  it('persists area, predicted range, client price comment, site-visit preference, and gardener ocular-inspection flag across inquiry & offer revisions', async () => {
    const createRes = await api('/inquiries', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        requestType: 'general',
        categoryId: landscapingCategoryId,
        subject: 'Backyard clearing & landscaping',
        description: 'Need overgrown backyard cleared and replanted.',
        location: 'Tetuan, Zamboanga City',
        areaSqm: 25,
        workComplexity: 'moderate',
        materialsOption: 'client_provides',
        siteVisitRequested: true,
        priceComment: 'Target budget is around PHP 6,000-8,000; open to ocular visit this weekend.',
      },
    })
    assert.equal(createRes.status, 201, `Unexpected create response: ${JSON.stringify(createRes.data)}`)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)
    assert.equal(Number(createRes.data.inquiry.area_sqm), 25)
    assert.equal(createRes.data.inquiry.work_complexity, 'moderate')
    assert.equal(createRes.data.inquiry.materials_option, 'client_provides')
    assert.equal(Boolean(createRes.data.inquiry.site_visit_requested), true)
    assert.equal(Number(createRes.data.inquiry.estimated_min_amount), 6250) // 25 * 250
    assert.equal(Number(createRes.data.inquiry.estimated_max_amount), 12500) // 25 * 500
    assert.match(createRes.data.inquiry.price_comment, /6,000/)

    // Visible on Open Requests Board for approved gardeners
    const boardRes = await api('/inquiries/open', { headers: { Cookie: gardenerCookie } })
    assert.equal(boardRes.status, 200)
    const boardItem = boardRes.data.requests.find((r) => r.id === inquiryId)
    assert.ok(boardItem, 'Inquiry must appear on open requests board')
    assert.equal(Number(boardItem.area_sqm), 25)
    assert.equal(Number(boardItem.estimated_min_amount), 6250)

    // Gardener submits initial offer requesting on-site ocular inspection
    const quoteRes = await api(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: {
        responseType: 'offer',
        amount: 7500,
        details: 'Initial ballpark estimate; would like to visit the site to check soil and slope.',
        requiresSiteVisit: true,
      },
    })
    assert.equal(quoteRes.status, 201)
    const quotationId = quoteRes.data.id
    assert.equal(Boolean(quoteRes.data.quotation.requires_site_visit), true)

    // Gardener revises offer after ocular visit (clearing requiresSiteVisit -> false) and previous version keeps true in history
    const reviseRes = await api(`/inquiries/quotations/${quotationId}`, {
      method: 'PUT',
      headers: { Cookie: gardenerCookie },
      body: {
        responseType: 'offer',
        amount: 7200,
        details: 'Finalized quote after on-site ocular visit.',
        requiresSiteVisit: false,
      },
    })
    assert.equal(reviseRes.status, 200)
    assert.equal(Boolean(reviseRes.data.quotation.requires_site_visit), false)
    assert.equal(Boolean(reviseRes.data.revisions[0].requires_site_visit), true)
  })

  it('supports separate plant/material pricing add-ons, admin pricing management, itemized inquiry persistence, and gardener labor/materials quotation split', async () => {
    // Public pricing-addons catalog returns seeded plants, soil, equipment, and disposal items
    const catalogRes = await api('/services/pricing-addons')
    assert.equal(catalogRes.status, 200)
    assert.ok(catalogRes.data.addons.length >= 6)
    const plantAddon = catalogRes.data.addons.find((a) => a.item_type === 'plant')
    const soilAddon = catalogRes.data.addons.find((a) => a.item_type === 'material')
    assert.ok(plantAddon && soilAddon)

    // Admin creates & updates a custom plant pricing item
    const hash = await bcrypt.hash('Password123!', 10)
    const adminEmail = `est.admin.${runId}@hugatiera.test`
    const [adminIns] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, "administrator", "Est", "Admin", "09170000001", "1990-01-01")',
      [adminEmail, hash],
    )
    createdUserIds.push(adminIns.insertId)
    const adminLogin = await api('/auth/login', { method: 'POST', body: { email: adminEmail, password: 'Password123!' } })
    assert.equal(adminLogin.status, 200)

    const customAddonName = `Bougainvillea Starter ${runId}`
    const createAddon = await api('/admin/pricing-addons', {
      method: 'POST',
      headers: { Cookie: adminLogin.cookie },
      body: {
        name: customAddonName,
        itemType: 'plant',
        unit: 'per plant',
        unitPriceMin: 100,
        unitPriceMax: 200,
        description: 'Local Zamboanga flowering shrub.',
      },
    })
    assert.equal(createAddon.status, 201)
    const customAddonId = createAddon.data.id

    try {
      const updateAddon = await api(`/admin/pricing-addons/${customAddonId}`, {
        method: 'PATCH',
        headers: { Cookie: adminLogin.cookie },
        body: {
          name: customAddonName,
          itemType: 'plant',
          unit: 'per plant',
          unitPriceMin: 120,
          unitPriceMax: 220,
          description: 'Updated price range.',
          isActive: true,
        },
      })
      assert.equal(updateAddon.status, 200)

      // Create inquiry with 10m2 landscaping (250-500/m2 => labor 2500-5000) + 5 custom plants (600-1100) => total 3100-6100
      const inqRes = await api('/inquiries', {
        method: 'POST',
        headers: { Cookie: clientCookie },
        body: {
          requestType: 'general',
          categoryId: landscapingCategoryId,
          subject: 'Front yard with bougainvillea plants',
          description: 'Planting and trimming along front fence.',
          location: 'Pasonanca, Zamboanga City',
          areaSqm: 10,
          workComplexity: 'moderate',
          materialsOption: 'gardener_provides',
          addonItems: [{ addonId: customAddonId, quantity: 5 }],
        },
      })
      assert.equal(inqRes.status, 201, `Unexpected response: ${JSON.stringify(inqRes.data)}`)
      const inquiryId = inqRes.data.id
      createdInquiryIds.push(inquiryId)
      assert.equal(inqRes.data.estimate.materialsMode, 'itemized')
      assert.equal(Number(inqRes.data.inquiry.estimated_labor_min), 2500)
      assert.equal(Number(inqRes.data.inquiry.estimated_labor_max), 5000)
      assert.equal(Number(inqRes.data.inquiry.estimated_materials_min), 600)
      assert.equal(Number(inqRes.data.inquiry.estimated_materials_max), 1100)
      assert.equal(Number(inqRes.data.inquiry.estimated_min_amount), 3100)
      assert.equal(Number(inqRes.data.inquiry.estimated_max_amount), 6100)

      // Detail endpoint returns itemized estimateItems
      const detailRes = await api(`/inquiries/${inquiryId}`, { headers: { Cookie: clientCookie } })
      assert.equal(detailRes.status, 200)
      assert.equal(detailRes.data.estimateItems.length, 1)
      assert.equal(detailRes.data.estimateItems[0].item_name, customAddonName)
      assert.equal(Number(detailRes.data.estimateItems[0].subtotal_min), 600)

      // Gardener submits quotation with separate laborAmount + materialsAmount (auto-summing total amount!)
      const quoteRes = await api(`/inquiries/${inquiryId}/quotations`, {
        method: 'POST',
        headers: { Cookie: gardenerCookie },
        body: {
          responseType: 'offer',
          laborAmount: 3000,
          materialsAmount: 950,
          materialsBreakdown: '5 bougainvillea plants (750) + 2 bags loam soil (200)',
          details: 'Includes planting, watering setup, and cleanup.',
        },
      })
      assert.equal(quoteRes.status, 201)
      assert.equal(Number(quoteRes.data.quotation.labor_amount), 3000)
      assert.equal(Number(quoteRes.data.quotation.materials_amount), 950)
      assert.equal(Number(quoteRes.data.quotation.amount), 3950)
      assert.match(quoteRes.data.quotation.materials_breakdown, /bougainvillea/i)
    } finally {
      await pool.query('DELETE FROM pricing_addons WHERE id = ?', [customAddonId])
    }
  })
})
