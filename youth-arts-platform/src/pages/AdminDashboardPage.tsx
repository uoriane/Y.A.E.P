import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type ApplicationRow = {
  user_id: string
  category: string | null
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  profiles?: {
    full_name: string | null
  }[]
}

export function AdminDashboardPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [pendingCount, setPendingCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

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

      // Load pending applications (with student full name).
      const { data: pendingApps, error: pendingErr } = await supabase
        .from('applications')
        .select('user_id, category, status, submitted_at, profiles(full_name)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })

      if (pendingErr) {
        setErrorMessage(
          pendingErr.message ??
            'Could not load applications. Make sure you ran supabase/schema.sql.',
        )
        setLoading(false)
        return
      }

      setApplications((pendingApps ?? []) as ApplicationRow[])

      // Load snapshot counts (small Phase 1 dataset, fine for demo).
      const { data: allApps, error: allAppsErr } = await supabase
        .from('applications')
        .select('status')

      if (!allAppsErr && allApps) {
        const p = allApps.filter((a: any) => a.status === 'pending').length
        const ap = allApps.filter((a: any) => a.status === 'approved').length
        const r = allApps.filter((a: any) => a.status === 'rejected').length
        setPendingCount(p)
        setApprovedCount(ap)
        setRejectedCount(r)
      }

      setLoading(false)
    })()
  }, [])

  async function refreshPending() {
    const { data: pendingApps, error: pendingErr } = await supabase
      .from('applications')
      .select('user_id, category, status, submitted_at, profiles(full_name)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })

    if (pendingErr) throw pendingErr
    setApplications((pendingApps ?? []) as ApplicationRow[])
  }

  async function decide(userId: string, nextStatus: 'approved' | 'rejected') {
    setErrorMessage(null)
    try {
      const { error } = await supabase
        .from('applications')
        .update({
          status: nextStatus,
          decision_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      if (error) throw error

      // Refresh list after update.
      await refreshPending()

      // Update counts (simple and reliable for now).
      const { data: allApps, error: allAppsErr } = await supabase
        .from('applications')
        .select('status')
      if (!allAppsErr && allApps) {
        const p = allApps.filter((a: any) => a.status === 'pending').length
        const ap = allApps.filter((a: any) => a.status === 'approved').length
        const r = allApps.filter((a: any) => a.status === 'rejected').length
        setPendingCount(p)
        setApprovedCount(ap)
        setRejectedCount(r)
      }
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Unable to update application.')
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
              ) : applications.length === 0 ? (
                <div className="mini-meta" style={{ marginTop: '1rem' }}>
                  No pending applications right now.
                </div>
              ) : (
                <div>
                  {applications.map((app) => {
                    const name = app.profiles?.[0]?.full_name ?? 'Student'
                    return (
                      <div
                        key={app.user_id}
                        className="assignment-item"
                        style={{ alignItems: 'stretch' }}
                      >
                        <div className="assignment-title-row">
                          <div className="assignment-title">{name}</div>
                          <div className="mini-meta">
                            {app.category ? app.category.replace('-', ' ') : '—'}
                          </div>
                        </div>
                        <div className="mini-meta">
                          Status: Pending • Submitted:{' '}
                          {new Date(app.submitted_at).toLocaleDateString()}
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            type="button"
                            className="primary-button"
                            style={{ padding: '0.45rem 1.1rem' }}
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
                            onClick={() => decide(app.user_id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
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
                <div className="card-title">Next Step (Phase 2)</div>
                <div className="mini-meta" style={{ marginTop: '0.5rem' }}>
                  Add category management, trainer assignment per category, and
                  assignment creation by trainers/admin.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}

