import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

type UserRole = 'student' | 'trainer' | 'admin'

export function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [category, setCategory] = useState('')
  const [role, setRole] = useState<'student' | 'trainer' | 'admin'>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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

      const role = profileData?.role ?? user.user_metadata?.role

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
    setSuccess(null)

    const categoryRequired = role === 'student' || role === 'trainer'
    if (categoryRequired && !category) {
      setError('Please choose a program category.')
      return
    }

    try {
      setLoading(true)

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            category: role === 'admin' ? null : category,
            role,
          },
        },
      })

      if (signUpError) {
        throw signUpError
      }

      setSuccess(
        'Account created. Please check your email to confirm your registration.',
      )
      setFullName('')
      setEmail('')
      setPassword('')
      setCategory('')
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong while registering.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner" style={{ maxWidth: 640 }}>
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Register for Arts Rwanda
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            Create your account and choose your creative program.
          </p>

          <form className="card" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="role">User type</label>
              <select
                id="role"
                required
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'student' | 'trainer' | 'admin')
                }
              >
                <option value="student">Student</option>
                <option value="trainer">Trainer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            {role !== 'admin' && (
              <div className="form-field">
                <label htmlFor="category">Program category</label>
                <select
                  id="category"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select a category</option>
                  <option value="visual-arts">Visual Arts</option>
                  <option value="music">Music</option>
                  <option value="dance">Dance</option>
                  <option value="design">Design</option>
                  <option value="theater">Theater</option>
                </select>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}
            {success && <p className="form-success">{success}</p>}

            <button
              type="submit"
              className="primary-button large"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
}

