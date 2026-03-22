import '../App.css'
import { SiteLayout } from './shared/SiteLayout'
import { useState } from 'react'

type FAQItem = {
  question: string
  answer: string
}

const faqs: FAQItem[] = [
  {
    question: 'Why can I not submit assignments?',
    answer:
      'Submission is available only when your application status is approved and your account has a program category.',
  },
  {
    question: 'How do trainers review my work?',
    answer:
      'After you submit, trainers in your category can open your file, assign a grade, and publish feedback.',
  },
  {
    question: 'Can administrators change user roles?',
    answer:
      'Yes. Administrators can update student, trainer, and admin roles from the User Accounts section.',
  },
  {
    question: 'What should I do if I see database errors?',
    answer:
      'Run the SQL in supabase/schema.sql again in Supabase SQL Editor, then refresh and sign in again.',
  },
]

export function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number>(0)

  return (
    <SiteLayout>
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title" style={{ marginBottom: '0.5rem' }}>
            Help Center
          </h2>
          <p className="section-subtitle" style={{ marginBottom: '2rem' }}>
            User guide, on-screen help, quick start, and common troubleshooting.
          </p>

          <div className="dashboard-grid">
            <div className="dashboard-side">
              <div className="card assist-card">
                <div className="card-title">1. User Guide</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Register your account and choose your role.
                </div>
                <div className="mini-meta">Sign in and open your dashboard.</div>
                <div className="mini-meta">Follow role-specific actions: submit work, review, or manage users.</div>
              </div>

              <div className="card assist-card">
                <div className="card-title">2. On-screen Help Text</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Each dashboard includes short guidance cards.
                </div>
                <div className="mini-meta">Student: submission and feedback flow.</div>
                <div className="mini-meta">Trainer: review and grading flow.</div>
                <div className="mini-meta">Admin: application and role management flow.</div>
              </div>
            </div>

            <div className="dashboard-side">
              <div className="card assist-card">
                <div className="card-title">3. Quick Start Guide</div>
                <div className="mini-meta" style={{ marginTop: '0.45rem' }}>
                  Step 1: Register and confirm account.
                </div>
                <div className="mini-meta">Step 2: Sign in with your role account.</div>
                <div className="mini-meta">Step 3: Complete your first dashboard action.</div>
                <div className="mini-meta">Step 4: Check updates from other roles in real time.</div>
              </div>

              <div className="card assist-card">
                <div className="card-title">4. Frequently Asked Questions</div>
                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.55rem' }}>
                  {faqs.map((faq, index) => {
                    const isOpen = openFaq === index
                    return (
                      <div key={faq.question} className="faq-item">
                        <button
                          type="button"
                          className="faq-question"
                          onClick={() => setOpenFaq(isOpen ? -1 : index)}
                        >
                          {faq.question}
                        </button>
                        {isOpen && <div className="mini-meta faq-answer">{faq.answer}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
