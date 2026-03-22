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

  return message
}

export function TrainerDashboardPage() {
  const [trainerCategory, setTrainerCategory] = useState<string>('')
  const [trainerUserId, setTrainerUserId] = useState<string>('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('')
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('submitted')
  const [searchText, setSearchText] = useState('')

  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('')
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState('')
  const [creatingAssignment, setCreatingAssignment] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

      if (!categoryString) {
        setErrorMessage('Trainer category is missing. Ask an administrator to assign your category.')
        setLoading(false)
        return
      }

      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, trainer_id, category, assignment_id, assignment_title, student_name, file_path, submitted_at, status, grade, feedback, graded_at',
        )
        .eq('category', categoryString)
        .order('submitted_at', { ascending: false })

      if (submissionsErr) {
        setErrorMessage(normalizeErrorMessage(submissionsErr.message))
        setSubmissions([])
        setSelectedSubmissionId('')
      } else {
        const rows = submissionData ?? []
        setSubmissions(rows)
        setSelectedSubmissionId(rows[0]?.id ?? '')
      }

      const { data: assignmentData, error: assignmentErr } = await supabase
        .from('assignments')
        .select('id, title, due_date, created_at')
        .eq('category', categoryString)
        .order('created_at', { ascending: false })

      if (assignmentErr) {
        setErrorMessage(normalizeErrorMessage(assignmentErr.message))
      } else {
        setAssignments((assignmentData ?? []) as AssignmentRow[])
      }

      setLoading(false)
    })()
  }, [])

  async function refreshAssignments() {
    if (!trainerCategory) return

    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, due_date, created_at')
      .eq('category', trainerCategory)
      .order('created_at', { ascending: false })

    if (error) throw error
    setAssignments((data ?? []) as AssignmentRow[])
  }

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

      // Refresh list
      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, trainer_id, category, assignment_id, assignment_title, student_name, file_path, submitted_at, status, grade, feedback, graded_at',
        )
        .eq('category', trainerCategory)
        .order('submitted_at', { ascending: false })

      if (submissionsErr) throw submissionsErr
      const next = submissionData ?? []
      setSubmissions(next)
      setSelectedSubmissionId(next.find((submission) => submission.status === 'submitted')?.id ?? next[0]?.id ?? '')
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

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Trainer Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Review student progress and add feedback.
          </p>

          <div className="dashboard-grid">
            <div className="card">
              <h3 className="card-title">Pending Submissions</h3>

              <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                Focus: {trainerCategory ? formatCategory(trainerCategory) : '—'}
              </div>

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
                            <div className="mini-meta">
                              {s.status === 'graded' ? 'Reviewed' : 'Pending'}
                            </div>
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
              <div className="card">
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

              <div className="card">
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

              <div className="card">
                <div className="card-title">Activity Snapshot</div>
                <div
                  style={{
                    marginTop: '0.75rem',
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  <div className="mini-meta">
                    <strong style={{ color: '#111827' }}>{pendingCount}</strong> Pending reviews
                  </div>
                  <div className="mini-meta">
                    <strong style={{ color: '#111827' }}>{gradedCount}</strong> Reviewed submissions
                  </div>
                  <div className="mini-meta">
                    Grade and feedback updates are reflected immediately on student dashboards.
                  </div>
                </div>
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

