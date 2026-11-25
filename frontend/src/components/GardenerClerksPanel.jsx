import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Link2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { profileApi } from '../services/profiles'
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
      setNotice(`Clerk account created for ${res.clerk?.clerk_name || createForm.email}! They can now sign in at /login to manage your schedules, services, and payment verifications.`)
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
      setNotice(`Linked existing clerk ${res.clerk?.clerk_name || assignForm.email} to your gardener account.`)
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
    <section className="dashboard-panel" aria-label="Manage assigned clerks">
      <div className="activity-heading">
        <div>
          <p className="eyebrow">Account managers &amp; staff</p>
          <h2>My Clerks</h2>
        </div>
        <span className="panel-count">{clerks.length} assigned</span>
      </div>
      <p className="field-note" style={{ marginBottom: '16px' }}>
        Add a trusted clerk to help manage your working schedule, daily crew size, blocked dates, service listings, and client payment verifications. Clerks can only manage accounts explicitly assigned to them, and you can revoke access anytime.
      </p>

      {error && <div className="form-error" role="alert" style={{ marginBottom: '14px' }}>{error}</div>}
      {notice && <TransientSuccess key={notice} message={notice} onDismiss={() => setNotice('')} style={{ marginBottom: '14px' }} />}

      <div className="dashboard-grid">
        <div>
          <div className="payment-channel-tabs" role="tablist" aria-label="Add clerk method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={`payment-channel-tab${mode === 'create' ? ' is-active' : ''}`}
              onClick={() => { setMode('create'); setError('') }}
            >
              <UserPlus size={15} /> Create New Clerk Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'assign'}
              className={`payment-channel-tab${mode === 'assign' ? ' is-active' : ''}`}
              onClick={() => { setMode('assign'); setError('') }}
            >
              <Link2 size={15} /> Link Existing Clerk
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
                  Clerk email address
                  <input
                    type="email"
                    required
                    maxLength="255"
                    placeholder="clerk@yourgarden.ph"
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
                Temporary password <span className="label-note">(8–72 characters)</span>
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength="8"
                    maxLength="72"
                    placeholder="Create a secure password for your clerk"
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
                Role note <span className="label-note">(Optional)</span>
                <input
                  maxLength="255"
                  placeholder="e.g., Manages weekday schedules and verifies GCash receipts"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </label>
              <button className="button" type="submit" disabled={busy}>
                <UserPlus size={15} /> {busy ? 'Creating clerk...' : 'Create & assign clerk'}
              </button>
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
                <span className="field-note">Only active accounts already registered with the Clerk role can be linked here.</span>
              </label>
              <label>
                Assignment note <span className="label-note">(Optional)</span>
                <input
                  maxLength="255"
                  placeholder="e.g., Weekend schedule & payment clerk"
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                />
              </label>
              <button className="button" type="submit" disabled={busy}>
                <Link2 size={15} /> {busy ? 'Linking...' : 'Assign existing clerk'}
              </button>
            </form>
          )}
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Active clerks on your account</h3>
          {loading ? (
            <div className="skeleton-stack" aria-busy="true">
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          ) : clerks.length === 0 ? (
            <div className="empty-state">
              <Users size={22} style={{ marginBottom: '6px', color: 'var(--forest)' }} />
              <p style={{ margin: 0 }}>No clerks assigned yet. Create a clerk account on the left to delegate schedule, service, and payment management.</p>
            </div>
          ) : (
            <div className="managed-list">
              {clerks.map((clerk) => (
                <div className="managed-item" key={clerk.assignment_id}>
                  <div>
                    <strong>
                      {clerk.clerk_name} ({clerk.email})
                    </strong>
                    <span>
                      <ShieldCheck size={13} style={{ verticalAlign: 'text-bottom' }} />
                      {' '}
                      {clerk.notes || 'Authorized for schedule, crew size, services, and payment verifications.'}
                      {clerk.phone ? ` · ${clerk.phone}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="table-action table-action-danger"
                    disabled={busy}
                    onClick={() => setRevokeTarget(clerk)}
                  >
                    <Trash2 size={14} /> Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {revokeTarget && (
        <div className="gateway-demo-backdrop" role="dialog" aria-modal="true" aria-labelledby="revoke-clerk-title" onClick={(e) => { if (e.target === e.currentTarget) setRevokeTarget(null) }}>
          <div className="gateway-demo-modal">
            <p className="eyebrow" style={{ marginBottom: '4px' }}>Confirm revocation</p>
            <h2 id="revoke-clerk-title">Revoke clerk access?</h2>
            <p className="field-note">
              <strong>{revokeTarget.clerk_name}</strong> ({revokeTarget.email}) will immediately lose permission to edit your schedules, manage your services, or verify payments on your bookings.
            </p>
            <div className="gateway-demo-actions">
              <button type="button" className="button button-danger" disabled={busy} onClick={confirmRevoke}>
                {busy ? 'Revoking...' : 'Yes, revoke access'}
              </button>
              <button type="button" className="table-action" disabled={busy} onClick={() => setRevokeTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
