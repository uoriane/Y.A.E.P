import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'

const SUBMISSIONS_BUCKET = 'acdr-submissions'

type Assignment = {
  id: string
  category: string
  title: string
  due_date: string | null
}

type Submission = {
  id: string
  student_id: string
  assignment_id: string
  assignment_title: string
  category: string
  file_path: string
  status: 'submitted' | 'graded'
  grade: string | null
  feedback: string | null
  submitted_at: string
  graded_at: string | null
  trainer_id: string | null
}

type SessionUser = {
  id: string
  user_metadata: Record<string, unknown>
}

type ProfileRow = {
  full_name: string | null
  category: string | null
  role: 'student' | 'trainer' | 'admin'
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
  delivery_status: 'queued' | 'sent' | 'failed'
  created_at: string
  read_at: string | null
}

type TrainerAssignmentRow = {
  trainer_id: string
}

type TrainerNameRow = {
  full_name: string | null
}

type AssignmentViewFilter = 'all' | 'not-submitted' | 'submitted' | 'graded'

function formatCategory(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeErrorMessage(message: string): string {
  if (message.includes("Could not find the table 'public.applications'")) {
    return 'Database setup is incomplete. The applications table is missing. Run supabase/schema.sql in Supabase SQL Editor, then reload the app.'
  }

  if (message.includes('infinite recursion detected in policy for relation "profiles"')) {
    return 'Your database policies are outdated. Re-run supabase/schema.sql to apply the fixed RLS policies.'
  }

  if (message.toLowerCase().includes('storage') || message.toLowerCase().includes('bucket')) {
    return 'Upload failed due to storage permissions. Re-run supabase/schema.sql and try again.'
  }

  if (message.includes('No trainer assigned to this student yet')) {
    return 'Your trainer has not been assigned yet. Ask the administrator to assign a trainer before submitting.'
  }

  return message
}

export function DashboardPage() {
  const [studentCategory, setStudentCategory] = useState('')
  const [studentName, setStudentName] = useState('')
  const [applicationStatus, setApplicationStatus] = useState<
    'pending' | 'approved' | 'rejected' | ''
  >('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([])
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [activeAssignmentId, setActiveAssignmentId] = useState('')

  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentViewFilter>('all')
  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [assignedTrainerName, setAssignedTrainerName] = useState<string>('Not assigned')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const activeAssignment = assignments.find(
    (assignment) => assignment.id === activeAssignmentId,
  )

  const activeSubmission = submissions.find(
    (submission) => submission.assignment_id === activeAssignmentId,
  )

  const assignmentStatusMap = useMemo(() => {
    const map = new Map<string, 'not-submitted' | 'submitted' | 'graded'>()

    for (const assignment of assignments) {
      map.set(assignment.id, 'not-submitted')
    }

    for (const submission of submissions) {
      if (submission.status === 'graded') {
        map.set(submission.assignment_id, 'graded')
      } else if (
        !map.has(submission.assignment_id) ||
        map.get(submission.assignment_id) === 'not-submitted'
      ) {
        map.set(submission.assignment_id, 'submitted')
      }
    }

    return map
  }, [assignments, submissions])

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (assignmentFilter === 'all') return true
      return assignmentStatusMap.get(assignment.id) === assignmentFilter
    })
  }, [assignments, assignmentFilter, assignmentStatusMap])

  const submittedCount = submissions.length
  const gradedCount = submissions.filter((submission) => submission.status === 'graded').length
  const progressPercent =
    assignments.length > 0 ? Math.round((submittedCount / assignments.length) * 100) : 0

  useEffect(() => {
    ;(async () => {
      setPageLoading(true)
      setErrorMessage(null)

      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) {
        setErrorMessage(authErr.message)
        setPageLoading(false)
        return
      }

      const user = authData.user as SessionUser | null
      if (!user) {
        setErrorMessage('Please sign in to access your dashboard.')
        setPageLoading(false)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, category, role')
        .eq('user_id', user.id)
        .maybeSingle<ProfileRow>()

      const categoryValue = profileData?.category ?? user.user_metadata?.category
      const fullName = profileData?.full_name ?? user.user_metadata?.full_name
      const categoryString = typeof categoryValue === 'string' ? categoryValue : ''

      setStudentCategory(categoryString)
      setStudentName(typeof fullName === 'string' && fullName ? fullName : 'Student')

      const roleValue = profileData?.role ?? user.user_metadata?.role
      const role = typeof roleValue === 'string' ? roleValue : 'student'
      if (role !== 'student') {
        setErrorMessage('This dashboard is for student accounts only.')
        setPageLoading(false)
        return
      }

      const { data: notificationRows } = await supabase
        .from('notifications')
        .select('id, kind, subject, body, delivery_status, created_at, read_at')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6)

      setNotifications((notificationRows ?? []) as NotificationRow[])

      const { data: applicationRow, error: appErr } = await supabase
        .from('applications')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()

      if (appErr) {
        setErrorMessage(normalizeErrorMessage(appErr.message))
        setPageLoading(false)
        return
      }

      const status =
        (applicationRow?.status as
          | 'pending'
          | 'approved'
          | 'rejected'
          | undefined) ?? 'pending'

      setApplicationStatus(status)

      const { data: trainerAssignment } = await supabase
        .from('trainer_student_assignments')
        .select('trainer_id')
        .eq('student_id', user.id)
        .maybeSingle<TrainerAssignmentRow>()

      if (trainerAssignment?.trainer_id) {
        const { data: trainerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', trainerAssignment.trainer_id)
          .maybeSingle<TrainerNameRow>()

        setAssignedTrainerName(trainerProfile?.full_name || 'Assigned trainer')
      } else {
        setAssignedTrainerName('Not assigned')
      }

      if (status !== 'approved') {
        setAssignments([])
        setSubmissions([])
        setTrainingSessions([])
        setActiveAssignmentId('')
        setLastUpdatedAt(new Date())
        setPageLoading(false)
        return
      }

      const { data: assignmentData, error: assignmentsErr } = await supabase
        .from('assignments')
        .select('id, category, title, due_date')
        .eq('category', categoryString)
        .order('due_date', { ascending: true })

      if (assignmentsErr) {
        setErrorMessage(normalizeErrorMessage(assignmentsErr.message))
        setAssignments([])
        setSubmissions([])
        setPageLoading(false)
        return
      }

      setAssignments(assignmentData ?? [])
      setActiveAssignmentId(assignmentData?.[0]?.id ?? '')

      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, assignment_id, assignment_title, category, file_path, status, grade, feedback, submitted_at, graded_at, trainer_id',
        )
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false })

      if (submissionsErr) {
        setErrorMessage(normalizeErrorMessage(submissionsErr.message))
      } else {
        setSubmissions(submissionData ?? [])
      }

      const { data: sessionRows, error: sessionsErr } = await supabase
        .from('training_sessions')
        .select('id, title, session_date, start_time, end_time, location, description')
        .eq('category', categoryString)
        .gte('session_date', new Date().toISOString().slice(0, 10))
        .order('session_date', { ascending: true })
        .limit(8)

      if (sessionsErr) {
        setErrorMessage(normalizeErrorMessage(sessionsErr.message))
      } else {
        setTrainingSessions((sessionRows ?? []) as TrainingSession[])
      }

      setLastUpdatedAt(new Date())

      setPageLoading(false)
    })()
  }, [])

  async function handleSubmitWork(event: FormEvent) {
    event.preventDefault()

    if (!activeAssignment) return

    if (applicationStatus !== 'approved') {
      setErrorMessage(
        'Your application has not been approved yet. Please wait for the administrator decision.',
      )
      return
    }

    if (!fileToUpload) {
      setErrorMessage('Please choose a file to upload.')
      return
    }

    if (!studentCategory) {
      setErrorMessage('Your profile category is missing.')
      return
    }

    setErrorMessage(null)
    setUploading(true)

    try {
      const user = await supabase.auth.getUser()
      const userId = user.data.user?.id
      if (!userId) throw new Error('Please sign in again.')

      const filePath = `${userId}/${activeAssignment.id}/${Date.now()}_${fileToUpload.name}`
      const { error: uploadErr } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(filePath, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
          contentType: fileToUpload.type,
        })

      if (uploadErr) throw uploadErr

      if (activeSubmission) {
        if (activeSubmission.status === 'graded') {
          setErrorMessage(
            'This assignment is already graded. You can submit other assignments instead.',
          )
          setUploading(false)
          return
        }

        const { error: updateErr } = await supabase
          .from('submissions')
          .update({
            file_path: filePath,
            status: 'submitted',
            grade: null,
            feedback: null,
            graded_at: null,
          })
          .eq('id', activeSubmission.id)

        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('submissions').insert({
          student_id: userId,
          category: studentCategory,
          assignment_id: activeAssignment.id,
          assignment_title: activeAssignment.title,
          student_name: studentName || 'Student',
          file_path: filePath,
          status: 'submitted',
          grade: null,
          feedback: null,
        })

        if (insertErr) throw insertErr
      }

      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, assignment_id, assignment_title, category, file_path, status, grade, feedback, submitted_at, graded_at, trainer_id',
        )
        .eq('student_id', userId)
        .order('submitted_at', { ascending: false })

      if (submissionsErr) throw submissionsErr
      setSubmissions(submissionData ?? [])
      setFileToUpload(null)
      setLastUpdatedAt(new Date())
    } catch (err: unknown) {
      const fallback = 'Upload failed. Please try again.'
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? fallback)
          : fallback
      setErrorMessage(normalizeErrorMessage(message))
    } finally {
      setUploading(false)
    }
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

  return (
    <SiteLayout>
      <section className="section dashboard-section student-dashboard">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Student Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            View your assignments, track progress, and review feedback.
          </p>

          <div className="mini-meta" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleString() : '—'}
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-side">
              <div className="card card-surface card-demo-readiness">
                <div className="card-title">Demo Readiness</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Role: Student
                </div>
                <div className="mini-meta">Application status: {applicationStatus || 'pending'}</div>
                <div className="mini-meta">Assigned trainer: {assignedTrainerName}</div>
                <div className="mini-meta">Upcoming sessions: {trainingSessions.length}</div>
                <div className="mini-meta">
                  Submissions: {submittedCount} submitted • {gradedCount} graded
                </div>
              </div>

              <div className="card card-surface card-student">
                <div className="assignment-title-row">
                  <h3 className="card-title">Your Assignments</h3>
                  <select
                    aria-label="Assignment filter"
                    value={assignmentFilter}
                    onChange={(event) =>
                      setAssignmentFilter(event.target.value as AssignmentViewFilter)
                    }
                    style={{
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      padding: '0.35rem 0.5rem',
                      font: 'inherit',
                    }}
                  >
                    <option value="all">All</option>
                    <option value="not-submitted">Not submitted</option>
                    <option value="submitted">Submitted</option>
                    <option value="graded">Graded</option>
                  </select>
                </div>

                {pageLoading ? (
                  <div className="mini-meta" style={{ marginTop: '1rem' }}>
                    Loading...
                  </div>
                ) : errorMessage ? (
                  <div className="mini-meta" style={{ marginTop: '1rem', color: '#b91c1c' }}>
                    {errorMessage}
                  </div>
                ) : applicationStatus && applicationStatus !== 'approved' ? (
                  <div className="mini-meta" style={{ marginTop: '1rem' }}>
                    {applicationStatus === 'pending'
                      ? 'Your application is pending administrator approval. You will be able to view assignments and submit work once approved.'
                      : 'Your application was not approved. Contact the program administrator for more information.'}
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '1rem' }}>
                    No assignments found for your category yet.
                  </div>
                ) : filteredAssignments.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '1rem' }}>
                    No assignments match the selected filter.
                  </div>
                ) : (
                  <div style={{ marginTop: '0.75rem' }}>
                    {filteredAssignments.map((assignment) => {
                      const submission = submissions.find(
                        (row) => row.assignment_id === assignment.id,
                      )
                      const isActive = assignment.id === activeAssignmentId

                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          onClick={() => {
                            setActiveAssignmentId(assignment.id)
                            setFileToUpload(null)
                          }}
                          style={{
                            textAlign: 'left',
                            background: isActive ? '#f3f4f6' : 'transparent',
                            border: 0,
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          <div className="assignment-item" style={{ borderBottom: 0 }}>
                            <div className="assignment-title-row">
                              <div className="assignment-title">{assignment.title}</div>
                              <div className="mini-meta">
                                {submission?.status === 'graded'
                                  ? `Graded (${submission.grade ?? '-'})`
                                  : submission?.status === 'submitted'
                                    ? 'Submitted'
                                    : 'Not submitted'}
                              </div>
                            </div>
                            <div className="mini-meta">Due: {assignment.due_date ?? '—'}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="card card-surface">
                <div className="card-title">Upload Your Work</div>
                <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                  Select the assignment and upload your file for trainer review.
                </div>

                {applicationStatus !== 'approved' ? (
                  <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                    Uploading is available only after your application is approved.
                  </div>
                ) : (
                  <form onSubmit={handleSubmitWork} style={{ marginTop: '1rem' }}>
                    <div className="form-field">
                      <label htmlFor="activeAssignment">Assignment</label>
                      <select
                        id="activeAssignment"
                        required
                        value={activeAssignmentId}
                        onChange={(event) => {
                          setActiveAssignmentId(event.target.value)
                          setFileToUpload(null)
                        }}
                        disabled={assignments.length === 0}
                      >
                        {assignments.map((assignment) => (
                          <option key={assignment.id} value={assignment.id}>
                            {assignment.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label htmlFor="fileInput">Choose file</label>
                      <input
                        id="fileInput"
                        type="file"
                        required
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          setFileToUpload(file)
                        }}
                      />
                    </div>

                    {activeSubmission?.status === 'graded' && (
                      <div className="form-error" style={{ marginTop: 0 }}>
                        This assignment was already graded. Uploading a new file is disabled.
                      </div>
                    )}

                    <button
                      type="submit"
                      className="primary-button large"
                      disabled={
                        uploading ||
                        !activeAssignment ||
                        activeSubmission?.status === 'graded'
                      }
                    >
                      {uploading ? 'Uploading...' : 'Submit Work'}
                    </button>
                  </form>
                )}

                {activeSubmission && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="mini-meta">
                      Status:{' '}
                      <span className={`status-chip ${activeSubmission.status}`}>
                        {activeSubmission.status}
                      </span>
                    </div>
                    <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                      Submitted: {new Date(activeSubmission.submitted_at).toLocaleDateString()}
                    </div>

                    {activeSubmission.file_path && (
                      <a
                        className="text-button"
                        href={supabase.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(activeSubmission.file_path).data.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-block', marginTop: '0.75rem' }}
                      >
                        Open your submission
                      </a>
                    )}

                    {activeSubmission.status === 'graded' && (
                      <div className="grade-box">
                        <div className="mini-meta">
                          Grade:{' '}
                          <span className="grade-score">{activeSubmission.grade ?? '-'}</span>
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                          Feedback: {activeSubmission.feedback ?? '—'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="card assist-card">
                <div className="card-title">On-screen Help</div>
                <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
                  1. Choose an assignment from the list.
                </div>
                <div className="mini-meta">2. Upload your file and submit.</div>
                <div className="mini-meta">3. Check Latest Feedback after trainer review.</div>
              </div>
            </div>

            <div className="dashboard-side">
              <div className="card card-surface card-feedback">
                <div className="progress-row">
                  <div>
                    <div className="card-title">Progress</div>
                    <div className="mini-meta">
                      Category: {studentCategory ? formatCategory(studentCategory) : '—'}
                    </div>
                  </div>
                  <div className="mini-meta">{progressPercent}%</div>
                </div>

                <div className="progress-bar" aria-label="Progress bar">
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                  Keep going. Complete submissions to improve your marks.
                </div>

                <div className="metric-grid">
                  <div className="metric-tile">
                    <span className="metric-value">{assignments.length}</span>
                    <span className="metric-label">Total</span>
                  </div>
                  <div className="metric-tile submitted">
                    <span className="metric-value">{submittedCount}</span>
                    <span className="metric-label">Submitted</span>
                  </div>
                  <div className="metric-tile graded">
                    <span className="metric-value">{gradedCount}</span>
                    <span className="metric-label">Graded</span>
                  </div>
                </div>
              </div>

              <div className="card card-surface card-feedback">
                <div className="card-title">Upcoming Training Schedule</div>
                {applicationStatus !== 'approved' ? (
                  <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
                    Schedule appears once your application is approved.
                  </div>
                ) : trainingSessions.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
                    No upcoming sessions yet.
                  </div>
                ) : (
                  <div style={{ marginTop: '0.75rem' }}>
                    {trainingSessions.map((session) => (
                      <div key={session.id} className="assignment-item" style={{ borderBottom: 0 }}>
                        <div className="assignment-title-row">
                          <div className="assignment-title">{session.title}</div>
                          <div className="mini-meta">
                            {new Date(session.session_date).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="mini-meta">
                          {session.start_time ? session.start_time.slice(0, 5) : 'Time TBA'}
                          {session.end_time ? ` - ${session.end_time.slice(0, 5)}` : ''}
                          {session.location ? ` • ${session.location}` : ''}
                        </div>
                        {session.description && (
                          <div className="mini-meta" style={{ marginTop: '0.3rem' }}>
                            {session.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card card-surface card-feedback">
                <div className="card-title">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.4rem' }}>
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
                        <div className="mini-meta">{notification.body}</div>
                        <div className="mini-meta" style={{ marginTop: '0.25rem' }}>
                          {new Date(notification.created_at).toLocaleDateString()} • {notification.kind}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card card-surface card-feedback">
                <div className="card-title">Latest Feedback</div>
                {submissions.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.15rem' }}>
                    Once your trainer grades a submission, feedback will appear here.
                  </div>
                ) : (
                  (() => {
                    const graded = submissions
                      .filter(
                        (submission) =>
                          submission.status === 'graded' &&
                          (submission.feedback || submission.grade),
                      )
                      .sort((a, b) => {
                        const aTime = a.graded_at ? +new Date(a.graded_at) : 0
                        const bTime = b.graded_at ? +new Date(b.graded_at) : 0
                        return bTime - aTime
                      })[0]

                    if (!graded) {
                      return (
                        <div className="mini-meta" style={{ marginTop: '0.15rem' }}>
                          No graded feedback yet. Submit work to get reviewed.
                        </div>
                      )
                    }

                    return (
                      <>
                        <div className="mini-meta" style={{ marginTop: '0.15rem' }}>
                          {graded.feedback ? graded.feedback : '—'}
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.85rem' }}>
                          Trainer reviewed:{' '}
                          {graded.graded_at
                            ? new Date(graded.graded_at).toLocaleDateString()
                            : '—'}
                        </div>
                      </>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
