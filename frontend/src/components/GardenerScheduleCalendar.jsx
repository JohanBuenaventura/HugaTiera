import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BellRing,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  MapPin,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { bookingsApi, formatStatusLabel, getStatusBadgeClass } from '../services/bookings'
import { formatWorkingDaysLabel, parseWorkingDaysArray, profileApi } from '../services/profiles'
import TransientSuccess from './TransientSuccess'

const WEEKDAY_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const JS_DAY_TO_CODE = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseBookingDateKey(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return toLocalDateKey(parsed)
}

function formatReadableDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTimeRange(startVal, endVal) {
  if (!startVal) return 'Time TBD'
  const s = new Date(startVal)
  if (Number.isNaN(s.getTime())) return 'Time TBD'
  const sStr = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (!endVal) return sStr
  const e = new Date(endVal)
  if (Number.isNaN(e.getTime())) return sStr
  const eStr = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = toLocalDateKey(s) === toLocalDateKey(e)
  return sameDay ? `${sStr} – ${eStr}` : `${sStr} (${s.toLocaleDateString()}) – ${eStr} (${e.toLocaleDateString()})`
}

export default function GardenerScheduleCalendar({ profileForm, onUnavailableDatesChange, standalone = false }) {
  const todayKey = useMemo(() => toLocalDateKey(new Date()), [])
  const [isOpen, setIsOpen] = useState(standalone)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [blockReason, setBlockReason] = useState('')
  const [blockBusy, setBlockBusy] = useState(false)
  const [localUnavailable, setLocalUnavailable] = useState(null)

  const workingDays = useMemo(() => parseWorkingDaysArray(profileForm?.workingDays), [profileForm])
  const workStartTime = profileForm?.workStartTime || '08:00'
  const workEndTime = profileForm?.workEndTime || '17:00'
  const maxConcurrentJobs = Math.max(1, Number(profileForm?.maxConcurrentJobs) || 1)
  const crewSize = Math.max(1, Number(profileForm?.crewSize) || 1, maxConcurrentJobs)
  const unavailableDates = useMemo(
    () => (localUnavailable !== null ? localUnavailable : (Array.isArray(profileForm?.unavailableDates) ? profileForm.unavailableDates : [])),
    [localUnavailable, profileForm],
  )

  useEffect(() => {
    let active = true
    bookingsApi.list()
      .then((res) => {
        if (active) setBookings(Array.isArray(res?.bookings) ? res.bookings : [])
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  // Index active/completed bookings by each calendar date they span
  const bookingsByDate = useMemo(() => {
    const map = new Map()
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'declined') continue
      const startKey = parseBookingDateKey(b.scheduled_start)
      if (!startKey) continue
      const endKey = parseBookingDateKey(b.scheduled_end) || startKey
      const [sy, sm, sd] = startKey.split('-').map(Number)
      const [ey, em, ed] = endKey.split('-').map(Number)
      const cursor = new Date(sy, sm - 1, sd)
      const endDate = new Date(ey, em - 1, ed)
      let guard = 0
      while (cursor <= endDate && guard < 90) {
        const key = toLocalDateKey(cursor)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(b)
        cursor.setDate(cursor.getDate() + 1)
        guard += 1
      }
    }
    return map
  }, [bookings])

  const urgencySummary = useMemo(() => {
    const overdue = []
    const urgentToday = []
    const dueTomorrow = []
    const actionNeeded = []
    const todoSoon = []
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'declined') continue
      if (b.schedule_urgency === 'overdue') overdue.push(b)
      else if (b.schedule_urgency === 'urgent_today') urgentToday.push(b)
      else if (b.schedule_urgency === 'due_tomorrow') dueTomorrow.push(b)
      else if (b.schedule_urgency === 'action_payment' || b.schedule_urgency === 'action_closing') actionNeeded.push(b)
      else if (b.schedule_urgency === 'todo_upcoming') todoSoon.push(b)
    }
    return {
      overdue,
      urgentToday,
      dueTomorrow,
      actionNeeded,
      todoSoon,
      priorityQueue: [...overdue, ...urgentToday, ...dueTomorrow, ...actionNeeded].slice(0, 5),
    }
  }, [bookings])

  const upcomingCount = useMemo(() => bookings.filter((b) => {
    if (!['pending', 'accepted', 'in_progress'].includes(b.status)) return false
    const endKey = parseBookingDateKey(b.scheduled_end) || parseBookingDateKey(b.scheduled_start)
    return !endKey || endKey >= todayKey
  }).length, [bookings, todayKey])

  const upcomingBookings = useMemo(() => bookings
    .filter((b) => {
      if (!['pending', 'accepted', 'in_progress'].includes(b.status)) return false
      const endKey = parseBookingDateKey(b.scheduled_end) || parseBookingDateKey(b.scheduled_start)
      return endKey && endKey >= todayKey
    })
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
    .slice(0, 5), [bookings, todayKey])

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1)
    const startWeekday = firstOfMonth.getDay()
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push(null)
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dt = new Date(viewMonth.year, viewMonth.month, day)
      const dateKey = toLocalDateKey(dt)
      const weekdayCode = JS_DAY_TO_CODE[dt.getDay()]
      const isWorkingDay = workingDays.includes(weekdayCode)
      const dayBlocks = unavailableDates.filter((u) => u.start_date <= dateKey && u.end_date >= dateKey)
      const dayBookings = bookingsByDate.get(dateKey) || []
      const activeDayBookings = dayBookings.filter((b) => ['pending', 'accepted', 'in_progress'].includes(b.status))
      const confirmedPaidCount = activeDayBookings.filter((b) => b.booking_stage === 'booked').length
      const reservedUnpaidCount = activeDayBookings.filter((b) => b.booking_stage !== 'booked').length
      const completedCount = dayBookings.filter((b) => b.status === 'completed').length
      const workersUsed = activeDayBookings.reduce((sum, b) => sum + Math.max(1, Number(b.workers_required) || 1), 0)
      cells.push({
        day,
        dateKey,
        isToday: dateKey === todayKey,
        isWorkingDay,
        isBlocked: dayBlocks.length > 0,
        dayBlocks,
        dayBookings,
        activeCount: activeDayBookings.length,
        confirmedPaidCount,
        reservedUnpaidCount,
        completedCount,
        workersUsed,
        isAtCapacity: activeDayBookings.length >= maxConcurrentJobs || workersUsed >= crewSize,
      })
    }
    return cells
  }, [viewMonth, workingDays, unavailableDates, bookingsByDate, todayKey, maxConcurrentJobs, crewSize])

  const selectedDayInfo = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const weekdayCode = JS_DAY_TO_CODE[dt.getDay()]
    const isWorkingDay = workingDays.includes(weekdayCode)
    const dayBlocks = unavailableDates.filter((u) => u.start_date <= selectedDate && u.end_date >= selectedDate)
    const dayBookings = bookingsByDate.get(selectedDate) || []
    const activeDayBookings = dayBookings.filter((b) => ['pending', 'accepted', 'in_progress'].includes(b.status))
    const activeCount = activeDayBookings.length
    const workersUsed = activeDayBookings.reduce((sum, b) => sum + Math.max(1, Number(b.workers_required) || 1), 0)
    return {
      dateKey: selectedDate,
      readableDate: formatReadableDate(selectedDate),
      isWorkingDay,
      dayBlocks,
      dayBookings,
      activeCount,
      workersUsed,
      isFullyBooked: activeCount >= maxConcurrentJobs || workersUsed >= crewSize,
    }
  }, [selectedDate, workingDays, unavailableDates, bookingsByDate, maxConcurrentJobs, crewSize])

  function shiftMonth(delta) {
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function jumpToToday() {
    const now = new Date()
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedDate(todayKey)
  }

  async function handleQuickBlockDate(event) {
    event.preventDefault()
    setBlockBusy(true); setError(''); setNotice('')
    try {
      const res = await profileApi.addUnavailableDate({
        startDate: selectedDate,
        endDate: selectedDate,
        reason: blockReason.trim() || 'Blocked from schedule calendar',
      })
      if (res?.unavailableDate) {
        const nextList = [...unavailableDates, res.unavailableDate].sort((a, b) => a.start_date.localeCompare(b.start_date))
        setLocalUnavailable(nextList)
        onUnavailableDatesChange?.(nextList)
        setBlockReason('')
        setNotice(`Marked ${selectedDate} as unavailable. Clients cannot book this date.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBlockBusy(false)
    }
  }

  async function handleRemoveBlock(blockId) {
    setBlockBusy(true); setError(''); setNotice('')
    try {
      await profileApi.deleteUnavailableDate(blockId)
      const nextList = unavailableDates.filter((item) => item.id !== blockId)
      setLocalUnavailable(nextList)
      onUnavailableDatesChange?.(nextList)
      setNotice('Unavailable date block removed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBlockBusy(false)
    }
  }

  return (
    <section className={`dashboard-panel schedule-calendar-dropdown${standalone ? ' is-standalone' : ''}`} id="gardener-calendar">
      {!standalone && (
        <button
          type="button"
          className="calendar-dropdown-trigger"
          aria-expanded={isOpen}
          aria-controls="gardener-calendar-body"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <div className="calendar-trigger-left">
            <span className="calendar-trigger-icon" aria-hidden="true">
              <CalendarDays size={20} />
            </span>
            <div>
              <p className="eyebrow" style={{ margin: '0 0 2px' }}>Gardener schedule planner</p>
              <strong>Schedule &amp; Availability Calendar</strong>
              <div className="calendar-trigger-meta">
                <span>{upcomingCount} upcoming job{upcomingCount === 1 ? '' : 's'}</span>
                <span>· {unavailableDates.length} blocked</span>
                <span>· {formatWorkingDaysLabel(workingDays)} ({workStartTime}–{workEndTime})</span>
                <span>· <Users size={13} style={{ verticalAlign: 'text-bottom' }} /> Crew: {crewSize} worker{crewSize === 1 ? '' : 's'}/day (max {maxConcurrentJobs} simultaneous)</span>
              </div>
              {(urgencySummary.overdue.length > 0 || urgencySummary.urgentToday.length > 0 || urgencySummary.dueTomorrow.length > 0 || urgencySummary.actionNeeded.length > 0) && (
                <div className="calendar-trigger-urgency-row">
                  {urgencySummary.overdue.length > 0 && (
                    <span className="urgency-pill urgency-overdue"><AlertTriangle size={12} /> {urgencySummary.overdue.length} Overdue</span>
                  )}
                  {urgencySummary.urgentToday.length > 0 && (
                    <span className="urgency-pill urgency-today"><BellRing size={12} /> {urgencySummary.urgentToday.length} Urgent Today</span>
                  )}
                  {urgencySummary.dueTomorrow.length > 0 && (
                    <span className="urgency-pill urgency-tomorrow"><Clock size={12} /> {urgencySummary.dueTomorrow.length} Due Tomorrow</span>
                  )}
                  {urgencySummary.actionNeeded.length > 0 && (
                    <span className="urgency-pill urgency-action">{urgencySummary.actionNeeded.length} To Do / Action</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <span className="calendar-trigger-toggle">
            {isOpen ? 'Hide calendar' : 'Open calendar'}
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </button>
      )}

      {isOpen && (
        <div className="calendar-dropdown-body" id="gardener-calendar-body">
          {notice && <TransientSuccess key={notice} message={notice} onDismiss={() => setNotice('')} />}
          {error && <div className="form-error" role="alert">{error}</div>}

          {urgencySummary.priorityQueue.length > 0 && (
            <div className="calendar-urgency-strip" role="region" aria-label="Urgent and upcoming schedule reminders">
              <div className="calendar-urgency-strip-head">
                <strong><BellRing size={15} /> Urgent &amp; To-Do Schedule Alerts</strong>
                <span className="field-note" style={{ margin: 0 }}>Click any alert to inspect or manage the booking</span>
              </div>
              <div className="calendar-urgency-items">
                {urgencySummary.priorityQueue.map((item) => (
                  <Link className="calendar-urgency-item" to={`/bookings/${item.id}`} key={item.id}>
                    <span className={`urgency-pill urgency-${item.schedule_urgency === 'overdue' ? 'overdue' : item.schedule_urgency === 'urgent_today' ? 'today' : item.schedule_urgency === 'due_tomorrow' ? 'tomorrow' : 'action'}`}>
                      {item.schedule_urgency_label}
                    </span>
                    <strong>{item.service_title || 'Gardening service'}</strong>
                    <small>{item.client_name} · {item.scheduled_start ? new Date(item.scheduled_start).toLocaleString() : 'TBD'}</small>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="calendar-workspace-grid">
            <div className="calendar-grid-card">
              <div className="calendar-toolbar">
                <div className="calendar-month-nav">
                  <button type="button" className="table-action" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                    <ChevronLeft size={16} />
                  </button>
                  <h3>{MONTH_NAMES[viewMonth.month]} {viewMonth.year}</h3>
                  <button type="button" className="table-action" aria-label="Next month" onClick={() => shiftMonth(1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="inline-actions">
                  <button type="button" className="table-action" onClick={jumpToToday}>Today</button>
                  <Link className="table-action" to="/dashboard?tab=profile">Working hours &amp; capacity</Link>
                </div>
              </div>

              <div className="calendar-legend" aria-label="Calendar legend">
                <span><i className="legend-dot dot-booked" /> Confirmed Booking (Paid)</span>
                <span><i className="legend-dot dot-reserved" /> Reservation (Unpaid)</span>
                <span><i className="legend-dot dot-completed" /> Completed</span>
                <span><i className="legend-dot dot-blocked" /> Blocked / Unavailable</span>
                <span><i className="legend-dot dot-offday" /> Off-Day</span>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {WEEKDAY_HEADER.map((label) => <span key={label}>{label}</span>)}
              </div>

              <div className="calendar-days-grid" role="grid" aria-label={`${MONTH_NAMES[viewMonth.month]} ${viewMonth.year}`}>
                {calendarCells.map((cell, index) => {
                  if (!cell) {
                    return <div className="calendar-day-cell is-empty" key={`empty-${index}`} aria-hidden="true" />
                  }
                  const isSelected = cell.dateKey === selectedDate
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      className={[
                        'calendar-day-cell',
                        cell.isToday ? 'is-today' : '',
                        isSelected ? 'is-selected' : '',
                        !cell.isWorkingDay ? 'is-offday' : '',
                        cell.isBlocked ? 'is-blocked' : '',
                        cell.isAtCapacity ? 'is-full' : '',
                      ].filter(Boolean).join(' ')}
                      aria-pressed={isSelected}
                      aria-label={`${cell.dateKey}: ${cell.activeCount} active job${cell.activeCount === 1 ? '' : 's'}${cell.isBlocked ? ', blocked' : ''}${!cell.isWorkingDay ? ', off-day' : ''}`}
                      onClick={() => setSelectedDate(cell.dateKey)}
                    >
                      <span className="calendar-day-num">{cell.day}</span>
                      <span className="calendar-day-indicators">
                        {cell.isAtCapacity && cell.activeCount > 0 && (
                          <span className="cal-pill cal-pill-full">Full</span>
                        )}
                        {cell.confirmedPaidCount > 0 && (
                          <span className="cal-pill cal-pill-booked">{cell.confirmedPaidCount} paid</span>
                        )}
                        {cell.reservedUnpaidCount > 0 && (
                          <span className="cal-pill cal-pill-reserved">{cell.reservedUnpaidCount} res</span>
                        )}
                        {cell.completedCount > 0 && cell.activeCount === 0 && (
                          <span className="cal-pill cal-pill-done">{cell.completedCount} done</span>
                        )}
                        {cell.isBlocked && (
                          <span className="cal-pill cal-pill-blocked">Blocked</span>
                        )}
                        {!cell.isWorkingDay && !cell.isBlocked && cell.dayBookings.length === 0 && (
                          <span className="cal-off-label">Off</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <aside className="calendar-agenda-panel">
              <div className="calendar-agenda-head">
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>Selected day agenda</p>
                <h3>{selectedDayInfo.readableDate}</h3>
                <div className="calendar-agenda-badges">
                  <span className={`inquiry-status ${selectedDayInfo.isWorkingDay ? 'status-open' : 'status-withdrawn'}`}>
                    {selectedDayInfo.isWorkingDay ? `Working day (${workStartTime}–${workEndTime})` : 'Configured off-day'}
                  </span>
                  <span className={`inquiry-status ${selectedDayInfo.isFullyBooked ? 'status-rejected' : 'status-in_progress'}`}>
                    {selectedDayInfo.isFullyBooked
                      ? 'Fully Booked — No Service Available'
                      : `Crew: ${selectedDayInfo.workersUsed}/${crewSize} workers · Jobs: ${selectedDayInfo.activeCount}/${maxConcurrentJobs}`}
                  </span>
                </div>
              </div>

              {loading ? (
                <p className="field-note">Loading schedule...</p>
              ) : selectedDayInfo.dayBookings.length === 0 ? (
                <p className="field-note" style={{ margin: 0 }}>
                  No bookings or reservations scheduled on this date.
                </p>
              ) : (
                <div className="calendar-agenda-list">
                  {selectedDayInfo.dayBookings.map((b) => (
                    <div className="calendar-agenda-item" key={b.id}>
                      <div className="calendar-agenda-item-top">
                        <strong>{b.service_title || 'Gardening service'}</strong>
                        <span className={getStatusBadgeClass(b.status === 'completed' ? 'completed' : (b.booking_stage || 'reserved'))}>
                          {b.status === 'completed' ? 'Completed' : formatStatusLabel(b.booking_stage)}
                        </span>
                      </div>
                      <small>
                        <Clock size={12} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                        {formatTimeRange(b.scheduled_start, b.scheduled_end)}
                      </small>
                      <small>
                        Client: <strong>{b.client_name}</strong> · {formatStatusLabel(b.payment_status)}
                        {Number(b.pending_reschedule_count) > 0 ? ' · Reschedule Pending' : ''}
                      </small>
                      {b.location && (
                        <small>
                          <MapPin size={12} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                          {b.location}
                        </small>
                      )}
                      <Link className="card-cta" style={{ marginTop: '4px' }} to={`/bookings/${b.id}`}>
                        Open booking <ArrowRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              <div className="calendar-block-box">
                <strong><Ban size={14} style={{ verticalAlign: 'text-bottom', marginRight: '5px' }} />Date availability block</strong>
                {selectedDayInfo.dayBlocks.length > 0 ? (
                  <div className="calendar-block-list">
                    {selectedDayInfo.dayBlocks.map((blk) => (
                      <div className="calendar-block-row" key={blk.id}>
                        <span>
                          <strong>{blk.start_date === blk.end_date ? blk.start_date : `${blk.start_date} to ${blk.end_date}`}</strong>
                          {blk.reason ? ` — ${blk.reason}` : ''}
                        </span>
                        <button
                          type="button"
                          className="table-action table-action-danger"
                          disabled={blockBusy}
                          onClick={() => handleRemoveBlock(blk.id)}
                        >
                          <Trash2 size={13} /> Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <form className="calendar-quick-block-form" onSubmit={handleQuickBlockDate}>
                    <input
                      maxLength="255"
                      placeholder="Optional reason (e.g., Holiday, day off)"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                    />
                    <button type="submit" className="table-action" disabled={blockBusy}>
                      <Plus size={14} /> {blockBusy ? 'Blocking...' : `Block ${selectedDate}`}
                    </button>
                  </form>
                )}
              </div>

              {upcomingBookings.length > 0 && (
                <div className="calendar-upcoming-box">
                  <strong>Next upcoming jobs ({upcomingBookings.length})</strong>
                  <ul>
                    {upcomingBookings.map((b) => {
                      const startKey = parseBookingDateKey(b.scheduled_start)
                      return (
                        <li key={b.id}>
                          <button
                            type="button"
                            className="calendar-upcoming-jump"
                            onClick={() => {
                              if (!startKey) return
                              const [y, m] = startKey.split('-').map(Number)
                              setViewMonth({ year: y, month: m - 1 })
                              setSelectedDate(startKey)
                            }}
                          >
                            <span>{startKey}</span>
                            <strong>{b.service_title || 'Service'}</strong>
                            <small>{b.client_name}</small>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </section>
  )
}
