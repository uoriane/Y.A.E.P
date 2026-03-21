import '../../App.css'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = {
  children: ReactNode
}

export function SiteLayout({ children }: Props) {
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
            <button className="text-button">Help</button>
            <Link to="/signin" className="text-button" style={{ border: 0 }}>
              Sign In
            </Link>
            <Link to="/register" className="primary-button">
              Register
            </Link>
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

