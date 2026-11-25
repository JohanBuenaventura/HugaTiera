import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Link2, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { profileApi } from '../services/profiles'
import Modal from './Modal'
import TransientSuccess from './TransientSuccess'

const emptyCreateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  notes: '',
}

export default function GardenerClerksPanel() {
  const [clerks, setClerks] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [mode, setMode] = useState('create')
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [assignForm, setAssignForm] = useState({ email: '', notes: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revokeTarget, setRevokeTarget] = useState(null)

  const loadClerks = useCallback(async () => {
    try {
      const res = await profileApi.listMyClerks()
      setClerks(res?.clerks || [])
    } catch (loadErr) {
      setError(loadErr.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    profileApi.listMyClerks()
      .then((res) => { if (active) setClerks(res?.clerks || []) })
      .catch((loadErr) => { if (active) setError(loadErr.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!revokeTarget) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setRevokeTarget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revokeTarget])

  async function handleCreateClerk(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await profileApi.createMyClerk(createForm)
      setCreateForm(emptyCreateForm)
      setFormOpen(false)
      setNotice(`Staff account created for ${res.clerk?.clerk_name || createForm.email}. They can now sign in at /login to help manage your schedule, services, and payment checks.`)
      await loadClerks()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAssignExisting(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await profileApi.assignExistingClerk(assignForm)
      setAssignForm({ email: '', notes: '' })
      setFormOpen(false)
      setNotice(`Added ${res.clerk?.clerk_name || assignForm.email} to your team.`)
      await loadClerks()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return
    setBusy(true); setError(''); setNotice('')
    try {
      await profileApi.revokeMyClerk(revokeTarget.assignment_id)
      setNotice(`Revoked clerk access for ${revokeTarget.clerk_name}.`)
      setRevokeTarget(null)
      await loadClerks()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-panel" aria-label="Manage assigned staff">
      <div className="activity-heading">
        <div>
          <h2>Your staff ({clerks.length})</h2>
          <p className="field-note" style={{ margin: '4px 0 0' }}>
            Staff members (clerks) can update your schedule, manage service listings, and check client payment proofs. They cannot delete your account or change your password.
          </p>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => { setFormOpen((open) => !open); setError('') }}
        >
          {formOpen ? <><X size={16} /> Close form</> : <><Plus size={16} /> Add staff member</>}
        </button>
      </div>

      {error && <div className="form-error" role="alert" style={{ marginBottom: '14px' }}>{error}</div>}
      {notice && <TransientSuccess key={notice} message={notice} onDismiss={() => setNotice('')} style={{ marginBottom: '14px' }} />}

      {formOpen && (
        <div className="managed-form-drawer" style={{ marginBottom: '20px' }}>
          <div className="payment-channel-tabs" role="tablist" aria-label="Add staff method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={`payment-channel-tab${mode === 'create' ? ' is-active' : ''}`}
              onClick={() => { setMode('create'); setError('') }}
            >
              <UserPlus size={15} /> Create new staff login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'assign'}
              className={`payment-channel-tab${mode === 'assign' ? ' is-active' : ''}`}
              onClick={() => { setMode('assign'); setError('') }}
            >
              <Link2 size={15} /> Add existing clerk account
            </button>
          </div>

          {mode === 'create' ? (
            <form className="profile-form" onSubmit={handleCreateClerk}>
              <div className="form-row">
                <label>
                  First name
                  <input
                    required
                    maxLength="100"
                    placeholder="e.g., Carlo"
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                  />
                </label>
                <label>
                  Last name
                  <input
                    required
                    maxLength="100"
                    placeholder="e.g., Santos"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Email address
                  <input
                    type="email"
                    required
                    maxLength="255"
                    placeholder="helper@yourgarden.ph"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </label>
                <label>
                  Mobile number <span className="label-note">(Optional)</span>
                  <input
                    type="tel"
                    maxLength="30"
                    placeholder="0917 123 4567"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Starting password <span className="label-note">(8–72 characters)</span>
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength="8"
                    maxLength="72"
                    placeholder="Create a password to share with your helper"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label>
                What do they help with? <span className="label-note">(Optional)</span>
                <input
                  maxLength="255"
                  placeholder="e.g., Manages weekday schedules and checks GCash receipts"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </label>
              <div className="inline-actions">
                <button className="button" type="submit" disabled={busy}>
                  <UserPlus size={15} /> {busy ? 'Creating...' : 'Create staff login'}
                </button>
                <button className="button button-outline" type="button" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="profile-form" onSubmit={handleAssignExisting}>
              <label>
                Existing clerk email address
                <input
                  type="email"
                  required
                  maxLength="255"
                  placeholder="existing.clerk@example.com"
                  value={assignForm.email}
                  onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })}
                />
                <span className="field-note">Only active accounts already registered as a Clerk can be added here.</span>
              </label>
              <label>
                What do they help with? <span className="label-note">(Optional)</span>
                <input
                  maxLength="255"
                  placeholder="e.g., Weekend schedule & payment checks"
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                />
              </label>
              <div className="inline-actions">
                <button className="button" type="submit" disabled={busy}>
                  <Link2 size={15} /> {busy ? 'Adding...' : 'Add to my team'}
                </button>
                <button className="button button-outline" type="button" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <div className="skeleton-stack" aria-busy="true">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      ) : clerks.length === 0 ? (
        <div className="empty-state managed-empty-state">
          <Users size={28} aria-hidden="true" />
          <strong>No staff members added yet</strong>
          <p>Need someone to help manage your bookings, dates, or payment checks while you&apos;re in the field? Add a trusted helper anytime.</p>
          {!formOpen && (
            <button type="button" className="button" onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Add your first staff member
            </button>
          )}
        </div>
      ) : (
        <div className="managed-list" style={{ marginTop: '14px' }}>
          {clerks.map((clerk) => (
            <div className="managed-item" key={clerk.assignment_id}>
              <div>
                <strong>{clerk.clerk_name}</strong>
                <span>{clerk.email}{clerk.phone ? ` · ${clerk.phone}` : ''}</span>
                <span>
                  <ShieldCheck size={13} style={{ verticalAlign: 'text-bottom' }} />
                  {' '}
                  {clerk.notes || 'Can manage schedule, services, and payment checks.'}
                </span>
              </div>
              <button
                type="button"
                className="table-action table-action-danger"
                disabled={busy}
                onClick={() => setRevokeTarget(clerk)}
              >
                <Trash2 size={14} /> Remove access
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => { if (!busy) setRevokeTarget(null) }}
        closeDisabled={busy}
        eyebrow="Confirm removal"
        title="Remove staff access?"
      >
        {revokeTarget && (
          <>
            <p className="field-note">
              <strong>{revokeTarget.clerk_name}</strong> ({revokeTarget.email}) will immediately stop having access to your schedule, services, and payment checks.
            </p>
            <div className="gateway-demo-actions">
              <button type="button" className="button button-danger" disabled={busy} onClick={confirmRevoke}>
                {busy ? 'Removing...' : 'Yes, remove access'}
              </button>
              <button type="button" className="table-action" disabled={busy} onClick={() => setRevokeTarget(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  )
}
