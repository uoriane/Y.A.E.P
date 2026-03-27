import '../App.css'
import { useEffect, useState, type FormEvent } from 'react'
import { SiteLayout } from './shared/SiteLayout'
import { supabase } from '../lib/supabaseClient'

type ProfileRow = {
  user_id: string
  full_name: string | null
  role: 'student' | 'trainer' | 'admin'
  category: string | null
  created_at: string
}

type ApplicationRow = {
  status: 'pending' | 'approved' | 'rejected'
}

const CATEGORY_OPTIONS = [
  { value: 'visual-arts', label: 'Visual Arts' },
  { value: 'music', label: 'Music' },
  { value: 'dance', label: 'Dance' },
  { value: 'design', label: 'Design' },
  { value: 'theater', label: 'Theater' },
]

function formatCategory(value: string | null): string {
  if (!value) return 'Not set'

  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function ProfilePage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [applicationStatus, setApplicationStatus] = useState<ApplicationRow['status'] | null>(null)
  const [fullName, setFullName] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
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
        setErrorMessage('Please sign in to view your profile.')
        setLoading(false)
        return
      }

      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, role, category, created_at')
        .eq('user_id', user.id)
        .maybeSingle<ProfileRow>()

      if (profileErr) {
        setErrorMessage(profileErr.message)
        setLoading(false)
        return
      }

      if (!profileData) {
        setErrorMessage('Profile not found.')
        setLoading(false)
        return
      }

      setProfile(profileData)
      setFullName(profileData.full_name ?? '')
      setCategory(profileData.category ?? '')

      if (profileData.role === 'student') {
        const { data: appData } = await supabase
          .from('applications')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle<ApplicationRow>()

        setApplicationStatus(appData?.status ?? 'pending')
      }

      setLoading(false)
    })()
  }, [])

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return

    setSaving(true)
    setErrorMessage(null)
    setMessage(null)

    try {
      const categoryValue = profile.role === 'admin' ? null : category || null

      const { error } = await supabase.rpc('update_my_profile', {
        p_full_name: fullName,
        p_category: categoryValue,
      })

      if (error) throw error

      const { data: refreshed, error: refreshErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, role, category, created_at')
        .eq('user_id', profile.user_id)
        .maybeSingle<ProfileRow>()

      if (refreshErr) throw refreshErr
      if (refreshed) {
        setProfile(refreshed)
        setCategory(refreshed.category ?? '')
        setFullName(refreshed.full_name ?? '')
      }

      setMessage('Profile updated successfully.')
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Unable to update profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner" style={{ maxWidth: 760 }}>
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            My Profile
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Manage your account details and program information.
          </p>

          {loading ? (
            <div className="card">Loading profile...</div>
          ) : errorMessage ? (
            <div className="card" style={{ color: '#b91c1c' }}>{errorMessage}</div>
          ) : profile ? (
            <div className="dashboard-grid">
              <div className="card card-surface">
                <div className="card-title">Profile Details</div>

                <form onSubmit={handleSaveProfile} style={{ marginTop: '1rem' }}>
                  <div className="form-field">
                    <label htmlFor="profileFullName">Full name</label>
                    <input
                      id="profileFullName"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="profileRole">Role</label>
                    <input id="profileRole" value={profile.role} disabled />
                  </div>

                  {profile.role !== 'admin' && (
                    <div className="form-field">
                      <label htmlFor="profileCategory">Category</label>
                      <select
                        id="profileCategory"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        required
                      >
                        <option value="">Select category</option>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {message && (
                    <div className="form-success" style={{ marginBottom: '0.75rem' }}>
                      {message}
                    </div>
                  )}

                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </form>
              </div>

              <div className="dashboard-side">
                <div className="card card-surface">
                  <div className="card-title">Account Summary</div>
                  <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                    Role: {profile.role}
                  </div>
                  <div className="mini-meta">Category: {formatCategory(profile.category)}</div>
                  <div className="mini-meta">
                    Member since: {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                </div>

                {profile.role === 'student' && (
                  <div className="card assist-card">
                    <div className="card-title">Application Status</div>
                    <div className="mini-meta" style={{ marginTop: '0.75rem' }}>
                      Current status: {applicationStatus ?? 'pending'}
                    </div>
                    <div className="mini-meta">
                      Approved students can access assignments and submit work.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </SiteLayout>
  )
}
