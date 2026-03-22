import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type ApplicationRow = {
  user_id: string
  category: string | null
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  decision_at?: string | null
  profiles?: {
    full_name: string | null
    role?: string | null
  }[]
}

type ProfileRow = {
  user_id: string
  full_name: string | null
  role: 'student' | 'trainer' | 'admin'
  category: string | null
  created_at: string
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const CATEGORY_OPTIONS = [
  { value: '', label: 'No category' },
  { value: 'visual-arts', label: 'Visual Arts' },
  { value: 'music', label: 'Music' },
  { value: 'dance', label: 'Dance' },
  { value: 'design', label: 'Design' },
  { value: 'theater', label: 'Theater' },
]

function normalizeErrorMessage(message: string): string {
  if (message.includes("Could not find the table 'public.applications'")) {
    return 'Database setup is incomplete. The applications table is missing. Run supabase/schema.sql in Supabase SQL Editor, then reload the app.'
  }

  if (message.includes('infinite recursion detected in policy for relation "profiles"')) {
    return 'Your database policies are outdated. Re-run supabase/schema.sql to apply the fixed RLS policies.'
  }

  return message
}

function formatCategory(value: string | null): string {
  if (!value) return '—'

  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function AdminDashboardPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [pendingCount, setPendingCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>('pending')
  const [searchText, setSearchText] = useState('')
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [currentAdminId, setCurrentAdminId] = useState<string>('')

  const visibleApplications = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return applications.filter((application) => {
      const statusMatch =
        activeStatusFilter === 'all' || application.status === activeStatusFilter

      if (!statusMatch) return false

      if (!query) return true

      const fullName = application.profiles?.[0]?.full_name?.toLowerCase() ?? ''
      const category = (application.category ?? '').toLowerCase()
      return fullName.includes(query) || category.includes(query)
    })
  }, [applications, activeStatusFilter, searchText])

  const roleStats = useMemo(() => {
    const counts = { student: 0, trainer: 0, admin: 0 }

    for (const profile of profiles) {
      if (profile.role === 'student') counts.student += 1
      else if (profile.role === 'trainer') counts.trainer += 1
      else counts.admin += 1
    }

    return counts
  }, [profiles])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErrorMessage(null)

      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) {
        setErrorMessage(authErr.message)
        setLoading(false)
        return
      }

      const user = authData.user
      if (!user) {
        setErrorMessage('Please sign in to access the admin dashboard.')
        setLoading(false)
        return
      }

      const roleValue = user.user_metadata?.role
      const role = typeof roleValue === 'string' ? roleValue : ''
      if (role !== 'admin') {
        setErrorMessage('This dashboard is for administrator accounts only.')
        setLoading(false)
        return
      }

      setCurrentAdminId(user.id)

      const { data: applicationRows, error: applicationsErr } = await supabase
        .from('applications')
        .select('user_id, category, status, submitted_at, decision_at, profiles(full_name, role)')
        .order('submitted_at', { ascending: false })

      if (applicationsErr) {
        setErrorMessage(normalizeErrorMessage(applicationsErr.message))
        setLoading(false)
        return
      }

      const apps = (applicationRows ?? []) as ApplicationRow[]
      setApplications(apps)

      const p = apps.filter((application) => application.status === 'pending').length
      const ap = apps.filter((application) => application.status === 'approved').length
      const r = apps.filter((application) => application.status === 'rejected').length
      setPendingCount(p)
      setApprovedCount(ap)
      setRejectedCount(r)

      const { data: profileRows, error: profileErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, role, category, created_at')
        .order('created_at', { ascending: false })

      if (profileErr) {
        setErrorMessage(normalizeErrorMessage(profileErr.message))
      } else {
        setProfiles((profileRows ?? []) as ProfileRow[])
      }

      setLoading(false)
    })()
  }, [])

  async function refreshApplications() {
    const { data, error } = await supabase
      .from('applications')
      .select('user_id, category, status, submitted_at, decision_at, profiles(full_name, role)')
      .order('submitted_at', { ascending: false })

    if (error) throw error

    const apps = (data ?? []) as ApplicationRow[]
    setApplications(apps)
    setPendingCount(apps.filter((application) => application.status === 'pending').length)
    setApprovedCount(apps.filter((application) => application.status === 'approved').length)
    setRejectedCount(apps.filter((application) => application.status === 'rejected').length)
  }

  async function refreshProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, role, category, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    setProfiles((data ?? []) as ProfileRow[])
  }

  async function decide(userId: string, nextStatus: 'approved' | 'rejected') {
    setErrorMessage(null)
    setUpdatingUserId(userId)

    try {
      const { error } = await supabase
        .from('applications')
        .update({
          status: nextStatus,
          decision_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      if (error) throw error

      await refreshApplications()
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Unable to update application.'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function updateRole(userId: string, role: ProfileRow['role']) {
    setErrorMessage(null)
    setUpdatingUserId(userId)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('user_id', userId)

      if (error) throw error

      await refreshProfiles()
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Unable to update user role.'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function updateCategory(profile: ProfileRow, category: string) {
    setErrorMessage(null)
    setUpdatingUserId(profile.user_id)

    try {
      const normalizedCategory = category || null

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ category: normalizedCategory })
        .eq('user_id', profile.user_id)

      if (profileErr) throw profileErr

      if (profile.role === 'student') {
        const { error: appErr } = await supabase
          .from('applications')
          .update({ category: normalizedCategory })
          .eq('user_id', profile.user_id)

        if (appErr) throw appErr
      }

      await Promise.all([refreshProfiles(), refreshApplications()])
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Unable to update category.'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Administrator Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Review applications and approve selected participants for training.
          </p>

          <div className="dashboard-grid">
            <div className="card">
              <h3 className="card-title">Application Review</h3>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <select
                  aria-label="Application status filter"
                  value={activeStatusFilter}
                  onChange={(event) => setActiveStatusFilter(event.target.value as StatusFilter)}
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    padding: '0.35rem 0.5rem',
                    font: 'inherit',
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>

                <input
                  aria-label="Search applications"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search applicant or category"
                  style={{
                    flex: 1,
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    padding: '0.35rem 0.5rem',
                    font: 'inherit',
                  }}
                />
              </div>

              {loading ? (
                <div className="mini-meta" style={{ marginTop: '1rem' }}>
                  Loading...
                </div>
              ) : errorMessage ? (
                <div
                  className="mini-meta"
                  style={{ marginTop: '1rem', color: '#b91c1c' }}
                >
                  {errorMessage}
                </div>
              ) : visibleApplications.length === 0 ? (
                <div className="mini-meta" style={{ marginTop: '1rem' }}>
                  No applications match your current filters.
                </div>
              ) : (
                <div>
                  {visibleApplications.map((app) => {
                    const name = app.profiles?.[0]?.full_name ?? 'Student'
                    const isPending = app.status === 'pending'
                    return (
                      <div
                        key={app.user_id}
                        className="assignment-item"
                        style={{ alignItems: 'stretch' }}
                      >
                        <div className="assignment-title-row">
                          <div className="assignment-title">{name}</div>
                          <div className="mini-meta">
                            {formatCategory(app.category)}
                          </div>
                        </div>
                        <div className="mini-meta">
                          Status: {app.status} • Submitted:{' '}
                          {new Date(app.submitted_at).toLocaleDateString()}
                        </div>

                        {isPending && (
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                              type="button"
                              className="primary-button"
                              style={{ padding: '0.45rem 1.1rem' }}
                              disabled={updatingUserId === app.user_id}
                              onClick={() => decide(app.user_id, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              style={{
                                border: '1px solid #e5e7eb',
                                padding: '0.45rem 1.1rem',
                              }}
                              disabled={updatingUserId === app.user_id}
                              onClick={() => decide(app.user_id, 'rejected')}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="dashboard-side">
              <div className="card">
                <div className="card-title">Program Snapshot</div>
                <div
                  style={{
                    marginTop: '0.75rem',
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  <div className="mini-meta">
                    <strong style={{ color: '#111827' }}>{pendingCount}</strong> —{' '}
                    Pending
                  </div>
                  <div className="mini-meta">
                    <strong style={{ color: '#111827' }}>{approvedCount}</strong> —{' '}
                    Approved
                  </div>
                  <div className="mini-meta">
                    <strong style={{ color: '#111827' }}>{rejectedCount}</strong> —{' '}
                    Rejected
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-title">User Accounts</div>
                <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                  Student: {roleStats.student} • Trainer: {roleStats.trainer} • Admin: {roleStats.admin}
                </div>

                <div style={{ marginTop: '0.75rem' }}>
                  {profiles.slice(0, 8).map((profile) => {
                    const isSelf = profile.user_id === currentAdminId
                    return (
                      <div key={profile.user_id} className="assignment-item" style={{ borderBottom: 0 }}>
                        <div className="assignment-title-row">
                          <div className="assignment-title">{profile.full_name ?? 'Unnamed user'}</div>
                          <div className="mini-meta">{formatCategory(profile.category)}</div>
                        </div>

                        <div style={{ marginTop: '0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <select
                              aria-label="User role"
                              value={profile.role}
                              disabled={isSelf || updatingUserId === profile.user_id}
                              onChange={(event) =>
                                updateRole(
                                  profile.user_id,
                                  event.target.value as ProfileRow['role'],
                                )
                              }
                              style={{
                                borderRadius: '0.45rem',
                                border: '1px solid #d1d5db',
                                padding: '0.3rem 0.45rem',
                                font: 'inherit',
                              }}
                            >
                              <option value="student">student</option>
                              <option value="trainer">trainer</option>
                              <option value="admin">admin</option>
                            </select>

                            <select
                              aria-label="User category"
                              value={profile.category ?? ''}
                              disabled={updatingUserId === profile.user_id}
                              onChange={(event) => updateCategory(profile, event.target.value)}
                              style={{
                                borderRadius: '0.45rem',
                                border: '1px solid #d1d5db',
                                padding: '0.3rem 0.45rem',
                                font: 'inherit',
                              }}
                            >
                              {CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value || 'none'} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card assist-card">
                <div className="card-title">Admin Help</div>
                <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
                  1. Review pending applications and approve eligible participants.
                </div>
                <div className="mini-meta">2. Keep user roles accurate from the User Accounts panel.</div>
                <div className="mini-meta">3. Monitor snapshots to track training pipeline health.</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}

