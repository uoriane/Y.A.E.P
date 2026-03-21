import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useState } from 'react'
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

export function TrainerDashboardPage() {
  const [trainerCategory, setTrainerCategory] = useState<string>('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('')

  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

      const categoryValue = user.user_metadata?.category
      const categoryString =
        typeof categoryValue === 'string' ? categoryValue : ''
      setTrainerCategory(categoryString)

      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, trainer_id, category, assignment_id, assignment_title, student_name, file_path, submitted_at, status, grade, feedback, graded_at',
        )
        .eq('category', categoryString)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })

      if (submissionsErr) {
        setErrorMessage(
          submissionsErr.message ??
            'Could not load submissions. Make sure you ran supabase/schema.sql.',
        )
        setSubmissions([])
        setSelectedSubmissionId('')
      } else {
        setSubmissions(submissionData ?? [])
        setSelectedSubmissionId(submissionData?.[0]?.id ?? '')
      }

      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    const selected = submissions.find((s) => s.id === selectedSubmissionId)
    if (selected) {
      setGrade(selected.grade ?? '')
      setFeedback(selected.feedback ?? '')
    } else {
      setGrade('')
      setFeedback('')
    }
  }, [selectedSubmissionId, submissions])

  const selectedSubmission = submissions.find(
    (s) => s.id === selectedSubmissionId,
  )

  async function handleSaveReview(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSubmission) return

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

      // Refresh list: only keep pending submissions
      const { data: submissionData, error: submissionsErr } = await supabase
        .from('submissions')
        .select(
          'id, student_id, trainer_id, category, assignment_id, assignment_title, student_name, file_path, submitted_at, status, grade, feedback, graded_at',
        )
        .eq('category', trainerCategory)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })

      if (submissionsErr) throw submissionsErr
      const next = submissionData ?? []
      setSubmissions(next)
      setSelectedSubmissionId(next?.[0]?.id ?? '')
      setGrade('')
      setFeedback('')
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Failed to save review.')
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
                Focus: {trainerCategory ? trainerCategory.replace('-', ' ') : '—'}
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
              ) : submissions.length === 0 ? (
                <div className="mini-meta" style={{ marginTop: '1rem' }}>
                  No submissions waiting for review right now.
                </div>
              ) : (
                <div style={{ marginTop: '0.75rem' }}>
                  {submissions.map((s) => {
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
                            <div className="mini-meta">Submitted</div>
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
                        />
                      </div>

                      <div className="form-field">
                        <label htmlFor="feedback">Feedback</label>
                        <textarea
                          id="feedback"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={4}
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
                      >
                        Save Review
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
                <div className="card-title">What Happens Next</div>
                <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                  After you grade a submission, the student dashboard will show the grade
                  and feedback automatically.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}

