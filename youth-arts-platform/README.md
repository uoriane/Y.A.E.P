# Youth Arts Platform

Web platform supporting youth talent development in Arts, Culture, and Design in Rwanda.

## Stack

- React + TypeScript + Vite
- React Router
- Supabase Auth + Postgres + Storage

## Current Features

- Public landing page
- Registration and sign-in
- Profile management page
- Role-based dashboards:
  - Student dashboard: assignments, submissions, grades, feedback, training schedule, notifications
  - Trainer dashboard: assigned student submissions, grading, assignment creation, training session creation, notifications
  - Admin dashboard: application decisions, user role/category management, strict trainer-student assignment, broadcast notifications, audit logs
- Strict trainer ownership flow: students are assigned to one trainer; trainer sees assigned students' submissions
- Notification queue in database

## Prerequisites

- Node.js 20+
- npm
- Supabase project

## Environment Variables

Create `.env` in this folder:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Run database schema in Supabase SQL Editor:

`supabase/schema.sql`

Important: re-run the latest schema whenever updates are made.

3. Start dev server:

```bash
npm run dev
```

## First-Time Functional Test

1. Register 3 accounts: one student, one trainer, one admin.
2. Sign in as admin and do the following:
   - Ensure trainer has role `trainer`
   - Ensure trainer category matches student category
   - Approve student application
   - Assign that student to the trainer in Trainer Assignment panel
3. Sign in as student and submit an assignment.
4. Sign in as trainer and verify submission appears and can be graded.

## Future Implementation

Real external email sending is planned for a future phase. The system currently stores notifications in the database and displays them in dashboards.

## Scripts

- `npm run dev`: start local development server
- `npm run build`: type-check and build
- `npm run preview`: preview production build locally
- `npm run lint`: run ESLint

## Troubleshooting

### Trainer cannot see submitted work

1. Re-run `supabase/schema.sql`.
2. In admin dashboard, ensure student is:
   - approved
   - assigned to a trainer
3. Ensure trainer and student categories are aligned.
4. Refresh trainer dashboard and clear search filters.
5. Sign out/sign in again if role/category/assignment changed recently.

### Search on trainer submissions returns nothing

This usually means submission data is empty due to missing assignment ownership or outdated schema.

Fix: re-run schema, assign trainer to student from admin dashboard, then refresh trainer dashboard.

### SQL/policy/table errors

Re-run latest `supabase/schema.sql`, refresh the browser, and sign in again.

## Key Files

- `src/pages/RegisterPage.tsx`
- `src/pages/SignInPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/TrainerDashboardPage.tsx`
- `src/pages/AdminDashboardPage.tsx`
- `src/pages/shared/SiteLayout.tsx`
- `src/lib/supabaseClient.ts`
- `supabase/schema.sql`
