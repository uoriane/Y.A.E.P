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

type TrainerAssignmentRow = {
  id: string
  student_id: string
  trainer_id: string
  assigned_at: string
  note: string | null
}

type AuditLogRow = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
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

  if (message.includes("Could not find the table 'public.trainer_student_assignments'")) {
    return 'Database setup is incomplete. Trainer assignments table is missing. Run supabase/schema.sql and reload.'
  }

  if (message.includes("Could not find the table 'public.admin_audit_logs'")) {
    return 'Database setup is incomplete. Admin audit logs table is missing. Run supabase/schema.sql and reload.'
  }

  if (message.includes('assign_student_trainer')) {
    return 'Trainer assignment RPC is missing or outdated. Re-run supabase/schema.sql and reload.'
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
  const [trainerAssignments, setTrainerAssignments] = useState<TrainerAssignmentRow[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const [pendingCount, setPendingCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>('pending')
  const [searchText, setSearchText] = useState('')
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [currentAdminId, setCurrentAdminId] = useState<string>('')
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null)
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastRole, setBroadcastRole] = useState<'all' | 'student' | 'trainer' | 'admin'>('all')
  const [broadcastCategory, setBroadcastCategory] = useState('')
  const [broadcastKind, setBroadcastKind] = useState<'announcement' | 'reminder'>('announcement')
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null)

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

      const { data: ownProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle<{ role: 'student' | 'trainer' | 'admin' }>()

      const roleValue = ownProfile?.role ?? user.user_metadata?.role
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

      const { data: assignmentRows, error: assignmentErr } = await supabase
        .from('trainer_student_assignments')
        .select('id, student_id, trainer_id, assigned_at, note')
        .order('assigned_at', { ascending: false })

      if (assignmentErr) {
        setErrorMessage(normalizeErrorMessage(assignmentErr.message))
      } else {
        setTrainerAssignments((assignmentRows ?? []) as TrainerAssignmentRow[])
      }

      const { data: logRows, error: logsErr } = await supabase
        .from('admin_audit_logs')
        .select('id, action, entity_type, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (logsErr) {
        setErrorMessage(normalizeErrorMessage(logsErr.message))
      } else {
        setAuditLogs((logRows ?? []) as AuditLogRow[])
      }

      setLastUpdatedAt(new Date())

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
    setLastUpdatedAt(new Date())
  }

  async function refreshProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, role, category, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    setProfiles((data ?? []) as ProfileRow[])
    setLastUpdatedAt(new Date())
  }

  async function refreshTrainerAssignments() {
    const { data, error } = await supabase
      .from('trainer_student_assignments')
      .select('id, student_id, trainer_id, assigned_at, note')
      .order('assigned_at', { ascending: false })

    if (error) throw error
    setTrainerAssignments((data ?? []) as TrainerAssignmentRow[])
    setLastUpdatedAt(new Date())
  }

  async function refreshAuditLogs() {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('id, action, entity_type, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error
    setAuditLogs((data ?? []) as AuditLogRow[])
    setLastUpdatedAt(new Date())
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

      await supabase.rpc('log_admin_action', {
        p_action: `application_${nextStatus}`,
        p_entity_type: 'applications',
        p_entity_id: userId,
        p_details: { status: nextStatus },
      })

      await refreshApplications()
      await refreshAuditLogs()
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

      await supabase.rpc('log_admin_action', {
        p_action: 'update_role',
        p_entity_type: 'profiles',
        p_entity_id: userId,
        p_details: { role },
      })

      await refreshProfiles()
      await refreshAuditLogs()
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

      await supabase.rpc('log_admin_action', {
        p_action: 'update_category',
        p_entity_type: 'profiles',
        p_entity_id: profile.user_id,
        p_details: { category: normalizedCategory },
      })

      await Promise.all([refreshProfiles(), refreshApplications()])
      await refreshAuditLogs()
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Unable to update category.'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function assignTrainer(studentId: string, trainerId: string) {
    setErrorMessage(null)
    setAssigningStudentId(studentId)

    try {
      const { error } = await supabase.rpc('assign_student_trainer', {
        p_student_id: studentId,
        p_trainer_id: trainerId,
        p_note: null,
      })

      if (error) throw error

      await Promise.all([refreshTrainerAssignments(), refreshAuditLogs()])
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Unable to assign trainer.'))
    } finally {
      setAssigningStudentId(null)
    }
  }

  async function sendBroadcast() {
    if (!broadcastSubject.trim() || !broadcastBody.trim()) {
      setBroadcastMessage('Subject and message body are required.')
      return
    }

    setBroadcastMessage(null)

    try {
      const { data, error } = await supabase.rpc('create_broadcast_notification', {
        p_subject: broadcastSubject.trim(),
        p_body: broadcastBody.trim(),
        p_kind: broadcastKind,
        p_target_role: broadcastRole === 'all' ? null : broadcastRole,
        p_target_category: broadcastCategory || null,
      })

      if (error) throw error

      setBroadcastSubject('')
      setBroadcastBody('')
      setBroadcastMessage(`Broadcast queued for ${Number(data ?? 0)} recipient(s).`)
      await refreshAuditLogs()
    } catch (err: any) {
      setBroadcastMessage(normalizeErrorMessage(err?.message ?? 'Unable to send broadcast.'))
    }
  }

  const trainers = profiles.filter((profile) => profile.role === 'trainer')
  const approvedStudents = applications.filter((app) => app.status === 'approved')

  function currentTrainerForStudent(studentId: string): string {
    return trainerAssignments.find((row) => row.student_id === studentId)?.trainer_id ?? ''
  }

  return (
    <SiteLayout>
      <section className="section dashboard-section admin-dashboard">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Administrator Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Review applications and approve selected participants for training.
          </p>

          <div className="mini-meta" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleString() : '—'}
          </div>

          <div className="dashboard-grid">
            <div className="card card-surface card-admin">
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
              <div className="card card-surface card-demo-readiness">
                <div className="card-title">Demo Readiness</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Role: Admin
                </div>
                <div className="mini-meta">Applications pending: {pendingCount}</div>
                <div className="mini-meta">Approved students: {approvedCount}</div>
                <div className="mini-meta">Trainer assignments: {trainerAssignments.length}</div>
                <div className="mini-meta">Recent audit logs: {auditLogs.length}</div>
              </div>

              <div className="card card-surface card-admin">
                <div className="card-title">Program Snapshot</div>
                <div className="metric-grid">
                  <div className="metric-tile pending">
                    <span className="metric-value">{pendingCount}</span>
                    <span className="metric-label">Pending</span>
                  </div>
                  <div className="metric-tile approved">
                    <span className="metric-value">{approvedCount}</span>
                    <span className="metric-label">Approved</span>
                  </div>
                  <div className="metric-tile rejected">
                    <span className="metric-value">{rejectedCount}</span>
                    <span className="metric-label">Rejected</span>
                  </div>
                </div>
              </div>

              <div className="card card-surface">
                <div className="card-title">User Accounts</div>
                <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                  Student: {roleStats.student} • Trainer: {roleStats.trainer} • Admin: {roleStats.admin}
                </div>

                <div style={{ marginTop: '0.75rem' }}>
                  {profiles.length === 0 ? (
                    <div className="mini-meta">No user accounts available yet.</div>
                  ) : (
                    profiles.slice(0, 8).map((profile) => {
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
                    })
                  )}
                </div>
              </div>

              <div className="card card-surface card-admin card-create-assignment">
                <div className="card-title">Trainer Assignment</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Assign each approved student to a specific trainer.
                </div>

                <div style={{ marginTop: '0.75rem' }}>
                  {approvedStudents.length === 0 ? (
                    <div className="mini-meta">No approved students yet.</div>
                  ) : (
                    approvedStudents.slice(0, 10).map((studentApp) => {
                      const studentCategory = studentApp.category
                      const matchingTrainers = trainers.filter(
                        (trainer) => trainer.category === studentCategory,
                      )

                      const currentTrainerId = currentTrainerForStudent(studentApp.user_id)

                      return (
                        <div key={studentApp.user_id} className="assignment-item" style={{ borderBottom: 0 }}>
                          <div className="assignment-title-row">
                            <div className="assignment-title">
                              {studentApp.profiles?.[0]?.full_name ?? 'Student'}
                            </div>
                            <div className="mini-meta">{formatCategory(studentCategory)}</div>
                          </div>

                          <div style={{ marginTop: '0.45rem' }}>
                            <select
                              aria-label="Assign trainer"
                              value={currentTrainerId}
                              disabled={assigningStudentId === studentApp.user_id || matchingTrainers.length === 0}
                              onChange={(event) => {
                                if (!event.target.value) return
                                assignTrainer(studentApp.user_id, event.target.value)
                              }}
                              style={{
                                width: '100%',
                                borderRadius: '0.45rem',
                                border: '1px solid #d1d5db',
                                padding: '0.35rem 0.45rem',
                                font: 'inherit',
                              }}
                            >
                              <option value="">Select trainer</option>
                              {matchingTrainers.map((trainer) => (
                                <option key={trainer.user_id} value={trainer.user_id}>
                                  {trainer.full_name ?? 'Unnamed trainer'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="card card-surface card-broadcast">
                <div className="card-title">Broadcast Notification</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Queue announcement or reminder emails for selected users.
                </div>

                <div className="form-field" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="broadcastKind">Type</label>
                  <select
                    id="broadcastKind"
                    value={broadcastKind}
                    onChange={(event) => setBroadcastKind(event.target.value as 'announcement' | 'reminder')}
                  >
                    <option value="announcement">Announcement</option>
                    <option value="reminder">Reminder</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-field">
                    <label htmlFor="broadcastRole">Target role</label>
                    <select
                      id="broadcastRole"
                      value={broadcastRole}
                      onChange={(event) =>
                        setBroadcastRole(event.target.value as 'all' | 'student' | 'trainer' | 'admin')
                      }
                    >
                      <option value="all">All users</option>
                      <option value="student">Students</option>
                      <option value="trainer">Trainers</option>
                      <option value="admin">Admins</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="broadcastCategory">Target category</label>
                    <select
                      id="broadcastCategory"
                      value={broadcastCategory}
                      onChange={(event) => setBroadcastCategory(event.target.value)}
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>
                          {option.value ? option.label : 'All categories'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="broadcastSubject">Subject</label>
                  <input
                    id="broadcastSubject"
                    value={broadcastSubject}
                    onChange={(event) => setBroadcastSubject(event.target.value)}
                    placeholder="e.g. Weekly studio reminder"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="broadcastBody">Message</label>
                  <textarea
                    id="broadcastBody"
                    rows={4}
                    value={broadcastBody}
                    onChange={(event) => setBroadcastBody(event.target.value)}
                    style={{
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      padding: '0.6rem 0.75rem',
                      font: 'inherit',
                      width: '100%',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <button type="button" className="primary-button" onClick={sendBroadcast}>
                  Send Broadcast
                </button>

                {broadcastMessage && (
                  <div
                    className="mini-meta"
                    style={{
                      marginTop: '0.65rem',
                      color: broadcastMessage.includes('queued') ? '#166534' : '#b91c1c',
                    }}
                  >
                    {broadcastMessage}
                  </div>
                )}
              </div>

              <div className="card card-surface card-notifications">
                <div className="card-title">Recent Admin Logs</div>
                {auditLogs.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                    No audit logs yet.
                  </div>
                ) : (
                  <div style={{ marginTop: '0.75rem' }}>
                    {auditLogs.map((log) => (
                      <div key={log.id} className="assignment-item" style={{ borderBottom: 0 }}>
                        <div className="assignment-title-row">
                          <div className="assignment-title">{log.action}</div>
                          <div className="mini-meta">{new Date(log.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="mini-meta">
                          {log.entity_type}{log.entity_id ? ` • ${log.entity_id}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

