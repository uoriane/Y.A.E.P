import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useState } from 'react'
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

export function DashboardPage() {
  const [studentCategory, setStudentCategory] = useState<string>('')
  const [studentName, setStudentName] = useState<string>('')
  const [applicationStatus, setApplicationStatus] = useState<
    'pending' | 'approved' | 'rejected' | ''
  >('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [activeAssignmentId, setActiveAssignmentId] = useState<string>('')

  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

      const categoryValue = user.user_metadata?.category
      const fullName = user.user_metadata?.full_name
      const categoryString =
        typeof categoryValue === 'string' ? categoryValue : ''

      setStudentCategory(categoryString)
      setStudentName(typeof fullName === 'string' ? fullName : 'Student')

      const roleValue = user.user_metadata?.role
      const role =
        typeof roleValue === 'string' ? (roleValue as string) : 'student'
      if (role !== 'student') {
        setErrorMessage('This dashboard is for student accounts only.')
        setPageLoading(false)
        return
      }

      // Phase 1 rule: only approved students can access assignments and submit work.
      const { data: applicationRow, error: appErr } = await supabase
        .from('applications')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()

      if (appErr) {
        setErrorMessage(
          appErr.message ??
            'Could not load your application status. Please try again.',
        )
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

      if (status !== 'approved') {
        setAssignments([])
        setSubmissions([])
        setActiveAssignmentId('')
        setPageLoading(false)
        return
      }

      // Load assignments for this category
      const { data: assignmentData, error: assignmentsErr } =
        await supabase
          .from('assignments')
          .select('id, category, title, due_date')
          .eq('category', categoryString)
          .order('due_date', { ascending: true })

      if (assignmentsErr) {
        setErrorMessage(
          assignmentsErr.message ??
            'Could not load assignments. Make sure you ran supabase/schema.sql.',
        )
        setAssignments([])
        setSubmissions([])
        setPageLoading(false)
        return
      }

      setAssignments(assignmentData ?? [])
      const firstAssignmentId = assignmentData?.[0]?.id ?? ''
      setActiveAssignmentId(firstAssignmentId)

      // Load the student's submissions
      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, assignment_id, assignment_title, category, file_path, status, grade, feedback, submitted_at, graded_at, trainer_id',
        )
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false })

      if (submissionsErr) {
        setErrorMessage(
          submissionsErr.message ??
            'Could not load your submissions. Make sure you ran supabase/schema.sql.',
        )
      } else {
        setSubmissions(submissionData ?? [])
      }

      setPageLoading(false)
    })()
  }, [])

  const activeAssignment = assignments.find(
    (a) => a.id === activeAssignmentId,
  )

  const activeSubmission = submissions.find(
    (s) => s.assignment_id === activeAssignmentId,
  )

  async function handleSubmitWork(e: React.FormEvent) {
    e.preventDefault()
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

      // Upload file to Supabase Storage
      // We keep the path predictable so it's easy to find later.
      const filePath = `${userId}/${activeAssignment.id}/${Date.now()}_${fileToUpload.name}`
      const { error: uploadErr } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(filePath, fileToUpload, {
          cacheControl: '3600',
          upsert: true,
          contentType: fileToUpload.type,
        })

      if (uploadErr) throw uploadErr

      // If there is already a submission:
      // - allow student to replace it while it's still "submitted"
      // - if it's already graded, we keep it as-is.
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
            trainer_id: null,
          })
          .eq('id', activeSubmission.id)

        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('submissions').insert({
          student_id: userId,
          trainer_id: null,
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

      // Refresh submissions list
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
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Student Dashboard
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            View your assignments, track progress, and review feedback.
          </p>

          <div className="dashboard-grid">
            <div className="dashboard-side">
              <div className="card">
                <h3 className="card-title">Your Assignments</h3>

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
                ) : (
                  <div style={{ marginTop: '0.75rem' }}>
                    {assignments.map((a) => {
                      const sub = submissions.find(
                        (s) => s.assignment_id === a.id,
                      )
                      const isActive = a.id === activeAssignmentId
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setActiveAssignmentId(a.id)
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
                              <div className="assignment-title">{a.title}</div>
                              <div className="mini-meta">
                                {sub?.status === 'graded' ? sub.grade ?? '-' : sub?.status ?? 'Not submitted'}
                              </div>
                            </div>
                            <div className="mini-meta">
                              Due: {a.due_date ?? '—'}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="card">
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
                        onChange={(e) => {
                          setActiveAssignmentId(e.target.value)
                          setFileToUpload(null)
                        }}
                        disabled={assignments.length === 0}
                      >
                        {assignments.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
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
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
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
                      Status: <strong>{activeSubmission.status}</strong>
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
                      <div style={{ marginTop: '0.75rem' }}>
                        <div className="mini-meta">
                          Grade: <strong>{activeSubmission.grade ?? '-'}</strong>
                        </div>
                        <div className="mini-meta" style={{ marginTop: '0.35rem' }}>
                          Feedback: {activeSubmission.feedback ?? '—'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

              <div className="card">
                <div className="progress-row">
                  <div>
                    <div className="card-title">Progress</div>
                    <div className="mini-meta">
                      Category: {studentCategory ? studentCategory.replace('-', ' ') : '—'}
                    </div>
                  </div>
                  <div className="mini-meta">
                    {assignments.length > 0
                      ? Math.round(
                          (submissions.length / assignments.length) * 100,
                        ) + '%'
                      : '0%'}
                  </div>
                </div>

                <div className="progress-bar" aria-label="Progress bar">
                  <div
                    className="progress-fill"
                    style={{
                      width:
                        assignments.length > 0
                          ? Math.round(
                              (submissions.length / assignments.length) * 100,
                            ) + '%'
                          : '0%',
                    }}
                  />
                </div>
                <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                  Keep going. Complete submissions to improve your marks.
                </div>
              </div>

              <div className="card">
                <div className="card-title">Latest Feedback</div>
                {submissions.length === 0 ? (
                  <div className="mini-meta" style={{ marginTop: '0.15rem' }}>
                    Once your trainer grades a submission, feedback will appear here.
                  </div>
                ) : (
                  (() => {
                    const graded = submissions
                      .filter((s) => s.status === 'graded' && (s.feedback || s.grade))
                      .sort((a, b) => {
                        const at = a.graded_at ? +new Date(a.graded_at) : 0
                        const bt = b.graded_at ? +new Date(b.graded_at) : 0
                        return bt - at
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
                          Trainer reviewed: {graded.graded_at ? new Date(graded.graded_at).toLocaleDateString() : '—'}
                        </div>
                      </>
                    )
                  })()
                )}
              </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}

