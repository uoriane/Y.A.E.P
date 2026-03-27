import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

type UserRole = 'student' | 'trainer' | 'admin'

function getRoleFromMetadata(metadata: unknown): UserRole | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined

  const role = (metadata as { role?: unknown }).role
  if (role === 'student' || role === 'trainer' || role === 'admin') {
    return role
  }

  return undefined
}

export function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    async function redirectIfAuthenticated() {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!isMounted || !user) return

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle<{ role: UserRole }>()

      const role = profileData?.role ?? getRoleFromMetadata(user.user_metadata)

      if (role === 'trainer') navigate('/trainer-dashboard', { replace: true })
      else if (role === 'admin') navigate('/admin-dashboard', { replace: true })
      else navigate('/dashboard', { replace: true })
    }

    redirectIfAuthenticated()

    return () => {
      isMounted = false
    }
  }, [navigate])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    try {
      setLoading(true)

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr

      const userId = userData.user?.id
      if (!userId) throw new Error('Unable to resolve current user account.')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle<{ role: UserRole }>()

      const role = profileData?.role ?? getRoleFromMetadata(userData.user?.user_metadata)

      if (role === 'trainer') navigate('/trainer-dashboard')
      else if (role === 'admin') navigate('/admin-dashboard')
      else navigate('/dashboard')
    } catch (err: any) {
      setError(err.message ?? 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner" style={{ maxWidth: 480 }}>
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Sign In
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Access your assignments, feedback, and progress.
          </p>

          <form className="card" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="primary-button large"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
}

