import './App.css'
import { Link } from 'react-router-dom'

function App() {
  return (
    <div className="app-root">
      <SiteHeader />

      <main>
        <HeroSection />
        <WhatWeOfferSection />
        <ProgramCategoriesSection />
        <CallToActionSection />
      </main>

      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  return (
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
  )
}

function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-inner">
        <h1 className="hero-title">Empower Your Creative Journey</h1>
        <p className="hero-subtitle">
          Digital platform supporting Rwandan youth in Arts, Culture, and Design
        </p>

        <div className="hero-actions">
          <button className="primary-button large">Get Started</button>
          <button className="secondary-button large">Learn More</button>
        </div>
      </div>
    </section>
  )
}

type OfferCardProps = {
  title: string
  description: string
  icon: string
}

function WhatWeOfferSection() {
  return (
    <section className="section">
      <div className="section-inner">
        <h2 className="section-title">What We Offer</h2>
        <p className="section-subtitle">
          Supporting your in-person training with digital tools
        </p>

        <div className="cards-grid">
          <OfferCard
            title="View Assignments"
            description="Access learning tasks and assignments related to your training program."
            icon="📘"
          />
          <OfferCard
            title="Track Progress"
            description="Monitor your grades, receive feedback, and see your improvement over time."
            icon="📈"
          />
          <OfferCard
            title="Connect with Teachers"
            description="Get in touch with instructors and receive personalized guidance."
            icon="🧑‍🏫"
          />
        </div>
      </div>
    </section>
  )
}

function OfferCard({ title, description, icon }: OfferCardProps) {
  return (
    <article className="card">
      <div className="card-icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="card-title">{title}</h3>
      <p className="card-text">{description}</p>
    </article>
  )
}

function ProgramCategoriesSection() {
  const categories = [
    {
      title: 'Visual Arts',
      description: 'Painting, Drawing, Sculpture',
      icon: '🎨',
    },
    {
      title: 'Music',
      description: 'Instruments, Composition',
      icon: '🎵',
    },
    {
      title: 'Dance',
      description: 'Traditional & Modern',
      icon: '💃',
    },
    {
      title: 'Design',
      description: 'Graphic, Fashion, Product',
      icon: '🎭',
    },
    {
      title: 'Theater',
      description: 'Acting, Directing, Stagecraft',
      icon: '🎬',
    },
  ]

  return (
    <section className="section">
      <div className="section-inner">
        <h2 className="section-title">Program Categories</h2>
        <p className="section-subtitle">Choose your area of interest</p>

        <div className="cards-grid categories-grid">
          {categories.map((cat) => (
            <article key={cat.title} className="card category-card">
              <div className="card-icon" aria-hidden="true">
                {cat.icon}
              </div>
              <h3 className="card-title">{cat.title}</h3>
              <p className="card-text">{cat.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CallToActionSection() {
  return (
    <section className="cta-section">
      <div className="cta-inner">
        <h2 className="cta-title">Ready to Start Your Journey?</h2>
        <p className="cta-subtitle">
          Join our community of creative youth in Rwanda
        </p>
        <Link to="/register" className="primary-button large" style={{ textDecoration: 'none' }}>
          Register Now
        </Link>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
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
  )
}

export default App
