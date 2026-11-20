const { formatDateOnly } = require('./userProfile')

const ALL_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_FROM_JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
const WEEKDAY_SHORT = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

function parseWorkingDays(raw, { fallbackToAll = false } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (fallbackToAll) return { days: [...ALL_WEEKDAYS], serialized: ALL_WEEKDAYS.join(',') }
    return { error: 'Select at least one working day.' }
  }
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : []

  const normalizedSet = new Set()
  for (const item of list) {
    const code = String(item || '').trim().toLowerCase().slice(0, 3)
    if (!code) continue
    if (!ALL_WEEKDAYS.includes(code)) {
      return { error: `Invalid working day "${item}". Use mon, tue, wed, thu, fri, sat, or sun.` }
    }
    normalizedSet.add(code)
  }

  const ordered = ALL_WEEKDAYS.filter((d) => normalizedSet.has(d))
  if (ordered.length === 0) {
    return { error: 'Select at least one working day.' }
  }
  return { days: ordered, serialized: ordered.join(',') }
}

function normalizeTimeOfDay(raw, fallback = null) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (fallback) return normalizeTimeOfDay(fallback)
    return { error: 'A valid time in HH:MM format is required.' }
  }
  const str = String(raw).trim()
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str)
  if (!match) {
    return { error: 'Time must use HH:MM format (e.g. 08:00).' }
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] ? Number(match[3]) : 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return { error: 'Time must be a valid 24-hour clock value.' }
  }
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  const ss = String(second).padStart(2, '0')
  return {
    sqlTime: `${hh}:${mm}:${ss}`,
    hhmm: `${hh}:${mm}`,
    minutes: hour * 60 + minute,
  }
}

function parseSqlDateTimeParts(value) {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = value.getMonth() + 1
    const day = value.getDate()
    const hour = value.getHours()
    const minute = value.getMinutes()
    return {
      year,
      month,
      day,
      hour,
      minute,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      minutesOfDay: hour * 60 + minute,
      weekday: WEEKDAY_FROM_JS_DAY[value.getDay()],
      ms: value.getTime(),
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = match[6] ? Number(match[6]) : 0
    const d = new Date(year, month - 1, day, hour, minute, second, 0)
    if (
      Number.isNaN(d.getTime())
      || d.getFullYear() !== year
      || d.getMonth() !== month - 1
      || d.getDate() !== day
    ) {
      return null
    }
    return {
      year,
      month,
      day,
      hour,
      minute,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      minutesOfDay: hour * 60 + minute,
      weekday: WEEKDAY_FROM_JS_DAY[d.getDay()],
      ms: d.getTime(),
    }
  }
  return null
}

function estimateWorkDuration({ areaSqm, workComplexity = 'moderate', materialsOption = 'client_provides' } = {}) {
  const area = Number(areaSqm)
  if (!Number.isFinite(area) || area <= 0) return null

  const sqmPerHour = workComplexity === 'light' ? 15 : workComplexity === 'heavy' ? 5 : 10
  const materialsMultiplier = materialsOption === 'gardener_provides' ? 1.15 : 1.0
  const rawHours = (area / sqmPerHour) * materialsMultiplier
  const estimatedHours = Math.max(2, Math.round(rawHours * 2) / 2)
  const estimatedWorkingDays = Math.max(0.5, Math.round((estimatedHours / 8) * 2) / 2)

  return {
    estimatedHours,
    estimatedWorkingDays,
  }
}

function computePeakConcurrentBookings(bookings, proposedStartMs, proposedEndMs) {
  const events = []
  for (const row of bookings) {
    const bStart = parseSqlDateTimeParts(row.scheduled_start)
    const bEnd = parseSqlDateTimeParts(row.scheduled_end)
    if (!bStart || !bEnd) continue
    const clampedStart = Math.max(bStart.ms, proposedStartMs)
    const clampedEnd = Math.min(bEnd.ms, proposedEndMs)
    if (clampedEnd > clampedStart) {
      events.push({ t: clampedStart, delta: 1 })
      events.push({ t: clampedEnd, delta: -1 })
    }
  }
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.delta - b.delta))

  let current = 0
  let peak = 0
  for (const ev of events) {
    current += ev.delta
    if (current > peak) peak = current
  }
  return peak
}

function computePeakWorkers(bookings, proposedStartMs, proposedEndMs) {
  const events = []
  for (const row of bookings) {
    const bStart = parseSqlDateTimeParts(row.scheduled_start)
    const bEnd = parseSqlDateTimeParts(row.scheduled_end)
    if (!bStart || !bEnd) continue
    const workers = Math.max(1, Number(row.workers_required) || 1)
    const clampedStart = Math.max(bStart.ms, proposedStartMs)
    const clampedEnd = Math.min(bEnd.ms, proposedEndMs)
    if (clampedEnd > clampedStart) {
      events.push({ t: clampedStart, delta: workers })
      events.push({ t: clampedEnd, delta: -workers })
    }
  }
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.delta - b.delta))

  let current = 0
  let peak = 0
  for (const ev of events) {
    current += ev.delta
    if (current > peak) peak = current
  }
  return peak
}

function computeFullyBookedDates({
  busyRows = [],
  workStartMinutes = 480,
  workEndMinutes = 1020,
  maxConcurrentJobs = 1,
  crewSize = 1,
}) {
  const effectiveCrew = Math.max(1, Number(crewSize) || 1, Number(maxConcurrentJobs) || 1)
  const effectiveJobs = Math.max(1, Number(maxConcurrentJobs) || 1)
  const dateCandidates = new Set()

  for (const row of busyRows) {
    const s = parseSqlDateTimeParts(row.scheduled_start)
    const e = parseSqlDateTimeParts(row.scheduled_end)
    if (!s || !e) continue
    const cursor = new Date(s.year, s.month - 1, s.day)
    const endDate = new Date(e.year, e.month - 1, e.day)
    let guard = 0
    while (cursor <= endDate && guard < 90) {
      const y = cursor.getFullYear()
      const m = String(cursor.getMonth() + 1).padStart(2, '0')
      const d = String(cursor.getDate()).padStart(2, '0')
      dateCandidates.add(`${y}-${m}-${d}`)
      cursor.setDate(cursor.getDate() + 1)
      guard += 1
    }
  }

  const fullyBooked = []
  for (const dateKey of [...dateCandidates].sort()) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const dayStartMs = new Date(y, m - 1, d, Math.floor(workStartMinutes / 60), workStartMinutes % 60, 0, 0).getTime()
    const dayEndMs = new Date(y, m - 1, d, Math.floor(workEndMinutes / 60), workEndMinutes % 60, 0, 0).getTime()
    if (dayEndMs <= dayStartMs) continue

    const points = new Set([dayStartMs, dayEndMs])
    const intervals = []
    for (const row of busyRows) {
      const s = parseSqlDateTimeParts(row.scheduled_start)
      const e = parseSqlDateTimeParts(row.scheduled_end)
      if (!s || !e) continue
      const cs = Math.max(s.ms, dayStartMs)
      const ce = Math.min(e.ms, dayEndMs)
      if (ce > cs) {
        points.add(cs)
        points.add(ce)
        intervals.push({ start: cs, end: ce, workers: Math.max(1, Number(row.workers_required) || 1) })
      }
    }

    const sortedPoints = [...points].sort((a, b) => a - b)
    let hasOpenWindow = false
    for (let i = 0; i < sortedPoints.length - 1; i += 1) {
      const mid = (sortedPoints[i] + sortedPoints[i + 1]) / 2
      let jobs = 0
      let workers = 0
      for (const iv of intervals) {
        if (iv.start <= mid && iv.end > mid) {
          jobs += 1
          workers += iv.workers
        }
      }
      if (jobs < effectiveJobs && workers < effectiveCrew) {
        hasOpenWindow = true
        break
      }
    }
    if (!hasOpenWindow) {
      fullyBooked.push(dateKey)
    }
  }

  return fullyBooked
}

function formatWorkingDaysSummary(days) {
  if (!Array.isArray(days) || days.length === 0) return 'Not set'
  if (days.length === 7) return 'Daily (Mon–Sun)'
  return days.map((d) => WEEKDAY_SHORT[d] || d).join(', ')
}

async function validateGardenerSchedule(connection, {
  gardenerId,
  scheduledStart,
  scheduledEnd,
  serviceId = null,
  workersRequired = null,
  excludeBookingId = null,
  lockRows = true,
}) {
  const start = parseSqlDateTimeParts(scheduledStart)
  const end = parseSqlDateTimeParts(scheduledEnd)
  if (!start || !end || end.ms <= start.ms) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SCHEDULE',
      message: 'Scheduled end date and time must be after the start date and time.',
    }
  }

  const [profileRows] = await connection.execute(
    `SELECT working_days, work_start_time, work_end_time, max_concurrent_jobs, crew_size, availability_notes
     FROM gardener_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [gardenerId],
  )
  const profile = profileRows[0] || {}
  const parsedDays = parseWorkingDays(profile.working_days, { fallbackToAll: true })
  const workingDays = parsedDays.days || [...ALL_WEEKDAYS]
  const workStart = normalizeTimeOfDay(profile.work_start_time, '08:00:00')
  const workEnd = normalizeTimeOfDay(profile.work_end_time, '17:00:00')
  const maxConcurrentJobs = Math.max(1, Number(profile.max_concurrent_jobs) || 1)
  const crewSize = Math.max(1, Number(profile.crew_size) || 1, maxConcurrentJobs)

  let requestedWorkers = Math.max(1, Number(workersRequired) || 0)
  if (!workersRequired && serviceId) {
    const [svcRows] = await connection.execute(
      'SELECT workers_required FROM services WHERE id = ? LIMIT 1',
      [Number(serviceId)],
    )
    if (svcRows[0]?.workers_required) {
      requestedWorkers = Math.max(1, Number(svcRows[0].workers_required))
    }
  }
  if (!Number.isFinite(requestedWorkers) || requestedWorkers < 1) requestedWorkers = 1

  // 1. Validate working days (start day and end day must be working days)
  if (!workingDays.includes(start.weekday)) {
    return {
      ok: false,
      status: 409,
      code: 'OUTSIDE_WORKING_DAYS',
      message: `The gardener does not work on ${WEEKDAY_LABELS[start.weekday]}s. Working days: ${formatWorkingDaysSummary(workingDays)}.`,
    }
  }
  if (!workingDays.includes(end.weekday)) {
    return {
      ok: false,
      status: 409,
      code: 'OUTSIDE_WORKING_DAYS',
      message: `The estimated end date falls on a ${WEEKDAY_LABELS[end.weekday]}, which is not a working day for this gardener. Working days: ${formatWorkingDaysSummary(workingDays)}.`,
    }
  }

  // 2. Validate working hours
  if (
    start.minutesOfDay < workStart.minutes
    || start.minutesOfDay >= workEnd.minutes
    || end.minutesOfDay <= workStart.minutes
    || end.minutesOfDay > workEnd.minutes
  ) {
    return {
      ok: false,
      status: 409,
      code: 'OUTSIDE_WORKING_HOURS',
      message: `The scheduled time must fall within the gardener's working hours (${workStart.hhmm}–${workEnd.hhmm}).`,
    }
  }

  // 3. Validate blocked / unavailable date ranges
  const [blockedRows] = await connection.execute(
    `SELECT id, start_date, end_date, reason
     FROM gardener_unavailable_dates
     WHERE gardener_id = ?
       AND start_date <= ?
       AND end_date >= ?
     ORDER BY start_date ASC
     LIMIT 1`,
    [gardenerId, end.dateStr, start.dateStr],
  )
  if (blockedRows[0]) {
    const blockStart = formatDateOnly(blockedRows[0].start_date)
    const blockEnd = formatDateOnly(blockedRows[0].end_date)
    const rangeLabel = blockStart === blockEnd ? blockStart : `${blockStart} to ${blockEnd}`
    const reasonSuffix = blockedRows[0].reason ? ` (${blockedRows[0].reason})` : ''
    return {
      ok: false,
      status: 409,
      code: 'GARDENER_UNAVAILABLE',
      message: `The gardener is unavailable on ${rangeLabel}${reasonSuffix}. Please choose another date.`,
    }
  }

  // 4. Validate simultaneous-job capacity using exact peak overlap
  const sqlStart = `${start.dateStr} ${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}:00`
  const sqlEnd = `${end.dateStr} ${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}:00`
  const params = [gardenerId, sqlEnd, sqlStart]
  let excludeClause = ''
  if (excludeBookingId) {
    excludeClause = ' AND b.id <> ?'
    params.push(excludeBookingId)
  }

  const [overlapping] = await connection.execute(
    `SELECT b.id, b.scheduled_start, b.scheduled_end, COALESCE(s.workers_required, 1) AS workers_required
     FROM bookings b
     LEFT JOIN services s ON s.id = b.service_id
     WHERE b.gardener_id = ?
       AND b.status IN ('pending', 'accepted', 'in_progress')
       AND b.scheduled_start < ?
       AND b.scheduled_end > ?${excludeClause}${lockRows ? ' FOR UPDATE' : ''}`,
    params,
  )

  const peakConcurrent = computePeakConcurrentBookings(overlapping, start.ms, end.ms)
  const peakWorkers = computePeakWorkers(overlapping, start.ms, end.ms)
  if (peakConcurrent + 1 > maxConcurrentJobs) {
    const message = maxConcurrentJobs === 1
      ? 'The gardener already has an accepted booking during that scheduled time.'
      : `Fully booked — the gardener has reached their maximum simultaneous job capacity (${maxConcurrentJobs}) during that scheduled time.`
    return {
      ok: false,
      status: 409,
      code: 'SCHEDULE_CONFLICT',
      message,
      peakConcurrent,
      maxConcurrentJobs,
      remainingSlots: 0,
      crewSize,
      peakWorkers,
      remainingWorkers: Math.max(0, crewSize - peakWorkers),
      requestedWorkers,
    }
  }
  if (peakWorkers + requestedWorkers > crewSize) {
    const availWorkers = Math.max(0, crewSize - peakWorkers)
    const message = availWorkers === 0
      ? `Fully booked — all ${crewSize} worker(s) are already assigned during that scheduled time. No service is available in that slot.`
      : `Not enough crew available — this service requires ${requestedWorkers} worker(s), but only ${availWorkers} of ${crewSize} worker(s) are free during that time.`
    return {
      ok: false,
      status: 409,
      code: 'CREW_CAPACITY_EXCEEDED',
      message,
      peakConcurrent,
      maxConcurrentJobs,
      remainingSlots: Math.max(0, maxConcurrentJobs - peakConcurrent),
      crewSize,
      peakWorkers,
      remainingWorkers: availWorkers,
      requestedWorkers,
    }
  }

  return {
    ok: true,
    peakConcurrent,
    maxConcurrentJobs,
    remainingSlots: maxConcurrentJobs - peakConcurrent,
    crewSize,
    peakWorkers,
    remainingWorkers: crewSize - peakWorkers,
    requestedWorkers,
    workingDays,
    workStartTime: workStart.hhmm,
    workEndTime: workEnd.hhmm,
    availabilityNotes: profile.availability_notes || null,
  }
}

module.exports = {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  computeFullyBookedDates,
  computePeakConcurrentBookings,
  computePeakWorkers,
  estimateWorkDuration,
  formatWorkingDaysSummary,
  normalizeTimeOfDay,
  parseSqlDateTimeParts,
  parseWorkingDays,
  validateGardenerSchedule,
}
