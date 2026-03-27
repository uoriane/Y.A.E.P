import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'

const SUBMISSIONS_BUCKET = 'acdr-submissions'

type Submission = {
  id: string
  student_id: string
  trainer_id: string | null
  category: string
  assignment_id: string
  assignment_title: string
  student_name: string
  file_path: string
  submitted_at: string
  status: 'submitted' | 'graded'
  grade: string | null
  feedback: string | null
  graded_at: string | null
}

type AssignmentRow = {
  id: string
  title: string
  due_date: string | null
  created_at: string
}

type TrainerProfileRow = {
  role: 'student' | 'trainer' | 'admin'
  category: string | null
}

type TrainingSession = {
  id: string
  title: string
  session_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
}

type NotificationRow = {
  id: string
  kind: 'registration' | 'selection-result' | 'announcement' | 'reminder' | 'general'
  subject: string
  body: string
  created_at: string
  read_at: string | null
}

type SubmissionFilter = 'submitted' | 'graded' | 'all'

function formatCategory(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeErrorMessage(message: string): string {
  if (message.includes('infinite recursion detected in policy for relation "profiles"')) {
    return 'Your database policies are outdated. Re-run supabase/schema.sql to apply the fixed RLS policies.'
  }

  if (message.includes("Could not find the table 'public.submissions'")) {
    return 'Database setup is incomplete. The submissions table is missing. Run supabase/schema.sql in Supabase SQL Editor, then reload the app.'
  }

  if (message.includes("Could not find the table 'public.training_sessions'")) {
    return 'Database setup is incomplete. The training sessions table is missing. Run supabase/schema.sql and reload.'
  }

  if (message.includes("Could not find the table 'public.notifications'")) {
    return 'Database setup is incomplete. The notifications table is missing. Run supabase/schema.sql and reload.'
  }

  if (message.includes("Could not find the table 'public.trainer_student_assignments'")) {
    return 'Database setup is incomplete. Trainer-student assignments table is missing. Run supabase/schema.sql and reload.'
  }

  return message
}

export function TrainerDashboardPage() {
  const [trainerCategory, setTrainerCategory] = useState<string>('')
  const [trainerUserId, setTrainerUserId] = useState<string>('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('')
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('submitted')
  const [searchText, setSearchText] = useState('')

  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('')
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState('')
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [newSessionDate, setNewSessionDate] = useState('')
  const [newSessionStart, setNewSessionStart] = useState('')
  const [newSessionEnd, setNewSessionEnd] = useState('')
  const [newSessionLocation, setNewSessionLocation] = useState('')
  const [newSessionDescription, setNewSessionDescription] = useState('')
  const [creatingAssignment, setCreatingAssignment] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  async function loadSubmissions(userId: string, category: string) {
    let query = supabase
      .from('submissions')
      .select(
        'id, student_id, trainer_id, category, assignment_id, assignment_title, student_name, file_path, submitted_at, status, grade, feedback, graded_at',
      )
      .order('submitted_at', { ascending: false })

    query = query.or(`trainer_id.eq.${userId},category.eq.${category}`)

    const { data, error } = await query

    if (error) throw error

    const rows = (data ?? []) as Submission[]
    setSubmissions(rows)
    setSelectedSubmissionId((currentId) => {
      if (currentId && rows.some((submission) => submission.id === currentId)) {
        return currentId
      }
      return rows[0]?.id ?? ''
    })
  }

  async function loadAssignments(category: string) {
    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, due_date, created_at')
      .eq('category', category)
      .order('created_at', { ascending: false })

    if (error) throw error
    setAssignments((data ?? []) as AssignmentRow[])
  }

  async function refreshTrainerData(options?: { includeAssignments?: boolean }) {
    const includeAssignments = options?.includeAssignments ?? false
    if (!trainerCategory || !trainerUserId) return

    await loadSubmissions(trainerUserId, trainerCategory)

    if (includeAssignments) {
      await loadAssignments(trainerCategory)
    }

    setLastUpdatedAt(new Date())
  }

  async function loadSessions(category: string) {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('id, title, session_date, start_time, end_time, location, description')
      .eq('category', category)
      .gte('session_date', new Date().toISOString().slice(0, 10))
      .order('session_date', { ascending: true })
      .limit(8)

    if (error) throw error
    setSessions((data ?? []) as TrainingSession[])
  }

  async function loadNotifications(userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, kind, subject, body, created_at, read_at')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error
    setNotifications((data ?? []) as NotificationRow[])
  }

  const filteredSubmissions = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return submissions.filter((submission) => {
      const statusMatch =
        submissionFilter === 'all' || submission.status === submissionFilter

      const textMatch =
        !query ||
        submission.student_name.toLowerCase().includes(query) ||
        submission.assignment_title.toLowerCase().includes(query)

      return statusMatch && textMatch
    })
  }, [submissions, submissionFilter, searchText])

  const pendingCount = submissions.filter((submission) => submission.status === 'submitted').length
  const gradedCount = submissions.filter((submission) => submission.status === 'graded').length

  const selectedSubmission = filteredSubmissions.find(
    (submission) => submission.id === selectedSubmissionId,
  )

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
        setErrorMessage('Please sign in to access the trainer dashboard.')
        setLoading(false)
        return
      }

      setTrainerUserId(user.id)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, category')
        .eq('user_id', user.id)
        .maybeSingle<TrainerProfileRow>()

      const roleValue = profileData?.role ?? user.user_metadata?.role
      const role = typeof roleValue === 'string' ? roleValue : ''
      if (role !== 'trainer') {
        setErrorMessage('This dashboard is for trainer accounts only.')
        setLoading(false)
        return
      }

      const categoryValue = profileData?.category ?? user.user_metadata?.category
      const categoryString = typeof categoryValue === 'string' ? categoryValue : ''
      setTrainerCategory(categoryString)

      try {
        await loadNotifications(user.id)
      } catch (err: any) {
        setErrorMessage(normalizeErrorMessage(err?.message ?? 'Failed to load notifications.'))
      }

      if (!categoryString) {
        setErrorMessage('Trainer category is missing. Ask an administrator to assign your category.')
        setLoading(false)
        return
      }

      try {
        await loadSubmissions(user.id, categoryString)
        await loadAssignments(categoryString)
        await loadSessions(categoryString)
        setLastUpdatedAt(new Date())
      } catch (err: any) {
        setErrorMessage(normalizeErrorMessage(err?.message ?? 'Failed to load trainer data.'))
      }

      setLoading(false)
    })()
  }, [])

  async function refreshAssignments() {
    if (!trainerCategory) return

    await loadAssignments(trainerCategory)
    setLastUpdatedAt(new Date())
  }

  async function refreshSessions() {
    if (!trainerCategory) return
    await loadSessions(trainerCategory)
    setLastUpdatedAt(new Date())
  }

  async function handleMarkNotificationAsRead(notificationId: string) {
    const target = notifications.find((row) => row.id === notificationId)
    if (!target || target.read_at) return

    const readAtIso = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAtIso })
      .eq('id', notificationId)

    if (error) {
      setErrorMessage(normalizeErrorMessage(error.message))
      return
    }

    setNotifications((current) =>
      current.map((row) =>
        row.id === notificationId ? { ...row, read_at: readAtIso } : row,
      ),
    )
    setLastUpdatedAt(new Date())
  }

  useEffect(() => {
    if (!trainerCategory || !trainerUserId) return

    const timer = window.setInterval(() => {
      refreshTrainerData().catch(() => {
        // Silent polling failure to avoid noisy UX; manual actions still report errors.
      })
    }, 15000)

    return () => window.clearInterval(timer)
  }, [trainerCategory, trainerUserId])

  useEffect(() => {
    const selected = filteredSubmissions.find((s) => s.id === selectedSubmissionId)
    if (selected) {
      setGrade(selected.grade ?? '')
      setFeedback(selected.feedback ?? '')
    } else {
      setGrade('')
      setFeedback('')
    }
  }, [selectedSubmissionId, filteredSubmissions])

  useEffect(() => {
    if (!selectedSubmissionId && filteredSubmissions.length > 0) {
      setSelectedSubmissionId(filteredSubmissions[0].id)
      return
    }

    if (
      selectedSubmissionId &&
      !filteredSubmissions.some((submission) => submission.id === selectedSubmissionId)
    ) {
      setSelectedSubmissionId(filteredSubmissions[0]?.id ?? '')
    }
  }, [filteredSubmissions, selectedSubmissionId])

  async function handleSaveReview(e: FormEvent) {
    e.preventDefault()
    if (!selectedSubmission) return
    if (selectedSubmission.status !== 'submitted') {
      setErrorMessage('Only pending submissions can be graded.')
      return
    }

    setErrorMessage(null)

    try {
      const { error: authErr } = await supabase.auth.getUser().then((res) => {
        return { error: res.error }
      })

      if (authErr) throw authErr

      const { data: authData } = await supabase.auth.getUser()
      const trainerId = authData.user?.id
      if (!trainerId) throw new Error('Please sign in again.')

      const { error: updateErr } = await supabase
        .from('submissions')
        .update({
          status: 'graded',
          grade: grade || null,
          feedback: feedback || null,
          trainer_id: trainerId,
          graded_at: new Date().toISOString(),
        })
        .eq('id', selectedSubmission.id)

      if (updateErr) throw updateErr

      await refreshTrainerData()
      setGrade('')
      setFeedback('')
    } catch (err: any) {
      setErrorMessage(normalizeErrorMessage(err?.message ?? 'Failed to save review.'))
    }
  }

  async function handleCreateAssignment(event: FormEvent) {
    event.preventDefault()

    if (!newAssignmentTitle.trim()) {
      setAssignmentMessage('Assignment title is required.')
      return
    }

    if (!trainerCategory) {
      setAssignmentMessage('Trainer category is missing.')
      return
    }

    setAssignmentMessage(null)
    setCreatingAssignment(true)

    try {
      const { error } = await supabase
        .from('assignments')
        .insert({
          title: newAssignmentTitle.trim(),
          category: trainerCategory,
          due_date: newAssignmentDueDate || null,
          created_by: trainerUserId || null,
        })

      if (error) throw error

      setNewAssignmentTitle('')
      setNewAssignmentDueDate('')
      setAssignmentMessage('Assignment created successfully.')
      await refreshAssignments()
    } catch (err: any) {
      setAssignmentMessage(normalizeErrorMessage(err?.message ?? 'Could not create assignment.'))
    } finally {
      setCreatingAssignment(false)
    }
  }

  async function handleCreateSession(event: FormEvent) {
    event.preventDefault()

    if (!newSessionTitle.trim() || !newSessionDate) {
      setSessionMessage('Session title and date are required.')
      return
    }

    if (!trainerCategory || !trainerUserId) {
      setSessionMessage('Trainer category or account is missing.')
      return
    }

    setCreatingSession(true)
    setSessionMessage(null)

    try {
      const { error } = await supabase.from('training_sessions').insert({
        category: trainerCategory,
        trainer_id: trainerUserId,
        title: newSessionTitle.trim(),
        session_date: newSessionDate,
        start_time: newSessionStart || null,
        end_time: newSessionEnd || null,
        location: newSessionLocation || null,
        description: newSessionDescription || null,
      })

      if (error) throw error

      setNewSessionTitle('')
      setNewSessionDate('')
      setNewSessionStart('')
      setNewSessionEnd('')
      setNewSessionLocation('')
      setNewSessionDescription('')
      setSessionMessage('Training session added successfully.')
      await refreshSessions()
    } catch (err: any) {
      setSessionMessage(normalizeErrorMessage(err?.message ?? 'Unable to create session.'))
    } finally {
      setCreatingSession(false)
    }
  }

  return (
    <SiteLayout>
      <section className="section dashboard-section trainer-dashboard">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Trainer Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Review student progress and add feedback.
          </p>

          <div className="mini-meta" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleString() : '—'}
          </div>

          <div className="dashboard-grid">
            <div className="card card-surface card-trainer">
              <h3 className="card-title">Pending Submissions</h3>

              <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                Focus: {trainerCategory ? formatCategory(trainerCategory) : '—'}
              </div>

              <button
                type="button"
                className="text-button"
                style={{ marginTop: '0.55rem', border: '1px solid #e5e7eb' }}
                onClick={() => {
                  setErrorMessage(null)
                  refreshTrainerData({ includeAssignments: true }).catch((err: any) => {
                    setErrorMessage(
                      normalizeErrorMessage(err?.message ?? 'Unable to refresh trainer data.'),
                    )
                  })
                }}
              >
                Refresh submissions
              </button>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <select
                  aria-label="Submission status filter"
                  value={submissionFilter}
                  onChange={(event) => setSubmissionFilter(event.target.value as SubmissionFilter)}
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    padding: '0.35rem 0.5rem',
                    font: 'inherit',
                  }}
                >
                  <option value="submitted">Pending only</option>
                  <option value="graded">Reviewed only</option>
                  <option value="all">All</option>
                </select>

                <input
                  aria-label="Search submissions"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search student or assignment"
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
              ) : filteredSubmissions.length === 0 ? (
                <div className="mini-meta" style={{ marginTop: '1rem' }}>
                  No submissions match your current filters.
                </div>
              ) : (
                <div style={{ marginTop: '0.75rem' }}>
                  {filteredSubmissions.map((s) => {
                    const isActive = s.id === selectedSubmissionId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSubmissionId(s.id)}
                        style={{
                          textAlign: 'left',
                          background: isActive ? '#f3f4f6' : 'transparent',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                          width: '100%',
                        }}
                      >
                        <div className="assignment-item" style={{ borderBottom: 0 }}>
                          <div className="assignment-title-row">
                            <div className="assignment-title">{s.student_name}</div>
                            <span className={`status-chip ${s.status}`}>
                              {s.status === 'graded' ? 'Reviewed' : 'Pending'}
                            </span>
                          </div>
                          <div className="mini-meta">
                            {s.assignment_title}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="dashboard-side">
              <div className="card card-surface card-demo-readiness">
                <div className="card-title">Demo Readiness</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Role: Trainer
                </div>
                <div className="mini-meta">
                  Category: {trainerCategory ? formatCategory(trainerCategory) : 'Not set'}
                </div>
                <div className="mini-meta">Pending reviews: {pendingCount}</div>
                <div className="mini-meta">Reviewed submissions: {gradedCount}</div>
                <div className="mini-meta">Upcoming sessions: {sessions.length}</div>
              </div>

              <div className="card card-surface card-create-assignment">
                <div className="card-title">Create Assignment</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Create assignments for {trainerCategory ? formatCategory(trainerCategory) : 'your category'}.
                </div>

                <form onSubmit={handleCreateAssignment} style={{ marginTop: '0.9rem' }}>
                  <div className="form-field">
                    <label htmlFor="assignmentTitle">Title</label>
                    <input
                      id="assignmentTitle"
                      value={newAssignmentTitle}
                      onChange={(event) => setNewAssignmentTitle(event.target.value)}
                      placeholder="e.g. Live Rhythm Practice"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="assignmentDueDate">Due date</label>
                    <input
                      id="assignmentDueDate"
                      type="date"
                      value={newAssignmentDueDate}
                      onChange={(event) => setNewAssignmentDueDate(event.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    style={{ width: '100%' }}
                    disabled={creatingAssignment || !trainerCategory}
                  >
                    {creatingAssignment ? 'Creating assignment...' : 'Create Assignment'}
                  </button>
                </form>

                {assignmentMessage && (
                  <div
                    className="mini-meta"
                    style={{
                      marginTop: '0.65rem',
                      color: assignmentMessage.includes('successfully') ? '#166534' : '#b91c1c',
                    }}
                  >
                    {assignmentMessage}
                  </div>
                )}

                <div style={{ marginTop: '1rem' }}>
                  <div className="mini-meta" style={{ color: '#111827', fontWeight: 600 }}>
                    Your Recent Assignments
                  </div>

                  {assignments.length === 0 ? (
                    <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                      No assignments yet.
                    </div>
                  ) : (
                    <div style={{ marginTop: '0.45rem' }}>
                      {assignments.slice(0, 5).map((assignment) => (
                        <div key={assignment.id} className="assignment-item" style={{ borderBottom: 0 }}>
                          <div className="assignment-title-row">
                            <div className="assignment-title">{assignment.title}</div>
                            <div className="mini-meta">
                              {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'No due date'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card card-surface card-review">
                <div className="card-title">Review & Grade</div>

                {selectedSubmission ? (
                  <>
                    <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                      Student: <strong>{selectedSubmission.student_name}</strong>
                    </div>
                    <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                      Assignment: <strong>{selectedSubmission.assignment_title}</strong>
                    </div>
                    <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                      Submitted: {new Date(selectedSubmission.submitted_at).toLocaleDateString()}
                    </div>

                    <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                      Status:{' '}
                      <span className={`status-chip ${selectedSubmission.status}`}>
                        {selectedSubmission.status}
                      </span>
                    </div>

                    {selectedSubmission.status === 'graded' && (
                      <div className="grade-box">
                        <div className="mini-meta">
                          Current Grade:{' '}
                          <span className="grade-score">{selectedSubmission.grade ?? '-'}</span>
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                          Feedback: {selectedSubmission.feedback ?? '—'}
                        </div>
                      </div>
                    )}

                    <a
                      className="text-button"
                      href={supabase.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(selectedSubmission.file_path).data.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: '0.75rem' }}
                    >
                      Open student file
                    </a>

                    <form onSubmit={handleSaveReview} style={{ marginTop: '1rem' }}>
                      <div className="form-field">
                        <label htmlFor="grade">Grade</label>
                        <input
                          id="grade"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          placeholder="e.g., A-, B+"
                          disabled={selectedSubmission.status !== 'submitted'}
                        />
                      </div>

                      <div className="form-field">
                        <label htmlFor="feedback">Feedback</label>
                        <textarea
                          id="feedback"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={4}
                          disabled={selectedSubmission.status !== 'submitted'}
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

                      <button
                        type="submit"
                        className="primary-button large"
                        style={{ width: '100%' }}
                        disabled={selectedSubmission.status !== 'submitted'}
                      >
                        {selectedSubmission.status === 'submitted' ? 'Save Review' : 'Already Reviewed'}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                    Select a submission to review.
                  </div>
                )}
              </div>

              <div className="card card-surface card-trainer">
                <div className="card-title">Activity Snapshot</div>
                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <div className="metric-tile pending">
                    <span className="metric-value">{pendingCount}</span>
                    <span className="metric-label">Pending reviews</span>
                  </div>
                  <div className="metric-tile graded">
                    <span className="metric-value">{gradedCount}</span>
                    <span className="metric-label">Reviewed submissions</span>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <div className="mini-meta">
                    Grade and feedback updates are reflected immediately on student dashboards.
                  </div>
                </div>
              </div>

              <div className="card card-surface card-training-schedule">
                <div className="card-title">Training Schedule</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Add session dates for your category.
                </div>

                <form onSubmit={handleCreateSession} style={{ marginTop: '0.85rem' }}>
                  <div className="form-field">
                    <label htmlFor="sessionTitle">Session title</label>
                    <input
                      id="sessionTitle"
                      value={newSessionTitle}
                      onChange={(event) => setNewSessionTitle(event.target.value)}
                      placeholder="e.g. Studio Composition Workshop"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sessionDate">Session date</label>
                    <input
                      id="sessionDate"
                      type="date"
                      value={newSessionDate}
                      onChange={(event) => setNewSessionDate(event.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-field">
                      <label htmlFor="sessionStart">Start time</label>
                      <input
                        id="sessionStart"
                        type="time"
                        value={newSessionStart}
                        onChange={(event) => setNewSessionStart(event.target.value)}
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="sessionEnd">End time</label>
                      <input
                        id="sessionEnd"
                        type="time"
                        value={newSessionEnd}
                        onChange={(event) => setNewSessionEnd(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="sessionLocation">Location</label>
                    <input
                      id="sessionLocation"
                      value={newSessionLocation}
                      onChange={(event) => setNewSessionLocation(event.target.value)}
                      placeholder="e.g. Kigali Creative Hub"
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sessionDescription">Description</label>
                    <textarea
                      id="sessionDescription"
                      rows={3}
                      value={newSessionDescription}
                      onChange={(event) => setNewSessionDescription(event.target.value)}
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

                  <button type="submit" className="primary-button" style={{ width: '100%' }} disabled={creatingSession}>
                    {creatingSession ? 'Saving session...' : 'Add Session'}
                  </button>
                </form>

                {sessionMessage && (
                  <div
                    className="mini-meta"
                    style={{
                      marginTop: '0.65rem',
                      color: sessionMessage.includes('successfully') ? '#166534' : '#b91c1c',
                    }}
                  >
                    {sessionMessage}
                  </div>
                )}

                <div style={{ marginTop: '1rem' }}>
                  {sessions.length === 0 ? (
                    <div className="mini-meta">No upcoming sessions yet.</div>
                  ) : (
                    sessions.map((session) => (
                      <div key={session.id} className="assignment-item" style={{ borderBottom: 0 }}>
                        <div className="assignment-title-row">
                          <div className="assignment-title">{session.title}</div>
                          <div className="mini-meta">{new Date(session.session_date).toLocaleDateString()}</div>
                        </div>
                        <div className="mini-meta">
                          {session.start_time ? session.start_time.slice(0, 5) : 'Time TBA'}
                          {session.end_time ? ` - ${session.end_time.slice(0, 5)}` : ''}
                          {session.location ? ` • ${session.location}` : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card card-surface card-notifications">
                <div className="card-title">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                    No notifications yet.
                  </div>
                ) : (
                  <div style={{ marginTop: '0.75rem' }}>
                    {notifications.map((notification) => (
                      <div key={notification.id} className="assignment-item" style={{ borderBottom: 0 }}>
                        <div className="assignment-title-row">
                          <div className="assignment-title">{notification.subject}</div>
                          <div className="notification-actions">
                            <span className={`status-chip ${notification.read_at ? 'graded' : 'submitted'}`}>
                              {notification.read_at ? 'Read' : 'New'}
                            </span>
                            {!notification.read_at && (
                              <button
                                type="button"
                                className="text-button"
                                style={{ border: '1px solid #e5e7eb', padding: '0.2rem 0.6rem' }}
                                onClick={() => handleMarkNotificationAsRead(notification.id)}
                              >
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.25rem' }}>
                          {notification.body}
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.25rem' }}>
                          {new Date(notification.created_at).toLocaleDateString()} • {notification.kind}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card assist-card">
                <div className="card-title">Quick Review Guide</div>
                <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
                  1. Select a pending submission.
                </div>
                <div className="mini-meta">2. Open file, grade, and write concise feedback.</div>
                <div className="mini-meta">3. Save review so student sees results instantly.</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}

