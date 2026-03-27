import '../../App.css'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

type Props = {
  children: ReactNode
}

export function SiteLayout({ children }: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [dashboardPath, setDashboardPath] = useState('/dashboard')

  useEffect(() => {
    let isMounted = true

    async function loadAuthState() {
      const { data, error } = await supabase.auth.getUser()
      if (!isMounted || error) return

      const user = data.user
      if (!user) {
        setIsAuthenticated(false)
        setDashboardPath('/dashboard')
        return
      }

      setIsAuthenticated(true)

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle<{ role: 'student' | 'trainer' | 'admin' }>()

      const roleValue = profile?.role ?? user.user_metadata?.role
      const role = typeof roleValue === 'string' ? roleValue : 'student'

      if (role === 'trainer') setDashboardPath('/trainer-dashboard')
      else if (role === 'admin') setDashboardPath('/admin-dashboard')
      else setDashboardPath('/dashboard')
    }

    loadAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAuthState()
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const authActionNode = useMemo(() => {
    if (!isAuthenticated) {
      return (
        <>
          <Link to="/signin" className="text-button" style={{ border: 0 }}>
            Sign In
          </Link>
          <Link to="/register" className="primary-button">
            Register
          </Link>
        </>
      )
    }

    return (
      <>
        <Link to="/profile" className="text-button" style={{ border: 0 }}>
          Profile
        </Link>
        <Link to={dashboardPath} className="text-button" style={{ border: 0 }}>
          Dashboard
        </Link>
        <button
          type="button"
          className="text-button"
          style={{ border: 0 }}
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/signin'
          }}
        >
          Sign Out
        </button>
      </>
    )
  }, [dashboardPath, isAuthenticated])

  return (
    <div className="app-root">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
            <div className="brand-icon">A</div>
            <div className="brand-text">
              <div className="brand-name">Arts Rwanda</div>
              <div className="brand-tagline">Youth Learning Platform</div>
            </div>
          </Link>

          <nav className="nav-actions">
            <Link to="/help" className="text-button" style={{ border: 0 }}>
              Help
            </Link>
            {authActionNode}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="footer-text">
            © 2026 Arts Rwanda Youth Learning Platform
          </p>
          <p className="footer-subtext">
            Supporting in-person Arts, Culture, and Design training
          </p>
        </div>
      </footer>
    </div>
  )
}

