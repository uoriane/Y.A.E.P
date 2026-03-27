<<<<<<< HEAD
# Youth Arts Platform

A web platform for youth arts training in Rwanda.

## Stack

- React + TypeScript + Vite
- React Router
- Supabase (Auth, Postgres, Storage)

## Features

- Public landing page
- Registration and sign-in
- Role-based dashboards:
  - Student dashboard for assignments and submissions
  - Trainer dashboard for reviewing and grading
  - Administrator dashboard for application decisions
- Node.js 20+
- A Supabase project

## Environment Variables

Create a .env file in the project root and add:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. In Supabase SQL Editor, run:

supabase/schema.sql

3. Start the app:

```bash
npm run dev
```

## Scripts

- npm run dev: start local development server
- npm run build: type-check and build production bundle
- npm run preview: preview production build locally
- npm run lint: run ESLint

## Project Structure

- src/App.tsx: landing page
- src/pages/RegisterPage.tsx: user registration
- src/pages/SignInPage.tsx: user sign-in
- src/pages/DashboardPage.tsx: student dashboard
- src/pages/TrainerDashboardPage.tsx: trainer dashboard
- src/pages/AdminDashboardPage.tsx: admin dashboard
- src/lib/supabaseClient.ts: Supabase client setup
- supabase/schema.sql: database schema and policies
=======
# Youth Arts Platform (Y.A.E.P)

A web platform for youth arts training in Rwanda.

This repository contains the frontend app in the folder youth-arts-platform.

## 1. Project Structure

- Root repository: Y.A.E.P
- App folder: youth-arts-platform
- Database SQL schema: youth-arts-platform/supabase/schema.sql

## 2. Prerequisites

Install these first:

1. Node.js 20 or newer
2. npm (comes with Node.js)
3. A Supabase account
   git clone https://github.com/uoriane/Y.A.E.P.git

2. Go into the repository:

   cd Y.A.E.P

3. Go into the app folder:

   cd youth-arts-platform

Important: package.json is inside youth-arts-platform. If you run npm commands from the repo root, they will fail.

## 4. Install Dependencies

From inside youth-arts-platform:

npm install

## 5. Create and Configure Supabase

1. Open Supabase dashboard.
2. Create a new project (or open your existing project).
3. Wait until the project is fully ready.
4. In Supabase, open Project Settings -> API.
5. Copy:
   - Project URL
   - anon public key

## 6. Create Environment File

Inside youth-arts-platform, create a file named .env and add:

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

Example:

VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

Do not wrap values in quotes.

## 7. Run Database Schema (Required)

1. In Supabase dashboard, open SQL Editor.
2. Open file youth-arts-platform/supabase/schema.sql from this repo.
3. Copy the full SQL.
4. Paste into SQL Editor.
5. Run it.
6. Confirm it finishes without errors.

This creates:

- profiles
- applications
- assignments
- submissions
- storage bucket acdr-submissions
- row-level security policies

If you previously ran older SQL, run the latest schema.sql again so all policy updates are applied.

## 8. Start Development Server

From youth-arts-platform:

npm run dev

Vite will show a local URL (usually http://localhost:5173).
Open that URL in your browser.

## 9. First-Time Test Flow

Follow this order to verify everything works:

1. Register a student account with a category (for example music).
2. Register a trainer account.
3. Register an admin account.
4. Sign in as admin.
5. In Admin Dashboard:
   - Set trainer role to trainer if needed.
   - Set trainer category to the same category as the student.
   - Approve the student application.
   - Assign the approved student to a trainer in the Trainer Assignment panel.
6. Sign in as student and submit an assignment.
7. Sign in as trainer and verify student submission appears.

## 9.1 Future Implementation

The project includes a notifications model in the database. Real outbound email delivery via third-party providers is planned as a future implementation due to domain and paid-service constraints.

## 10. Build for Production

From youth-arts-platform:

npm run build

Preview production build locally:

npm run preview

## 11. Linting


Cause: You are in Y.A.E.P instead of youth-arts-platform.

Fix:

cd youth-arts-platform
npm run dev

### Problem: Trainer cannot see student submission

Usually one of these:

1. schema.sql not re-run after updates
2. Student is not assigned to a trainer in Admin Dashboard
3. Trainer category does not match student category
4. Student application is not approved
5. Session is stale after role/category/assignment changes

Fix steps:

1. Re-run youth-arts-platform/supabase/schema.sql in Supabase SQL Editor.
2. Sign out and sign in again.
3. Verify trainer assignment exists for that student.
4. Verify trainer category and student category match.
5. Verify student application status is approved.

### Problem: Table or policy errors in UI

Fix:

1. Re-run latest youth-arts-platform/supabase/schema.sql.
2. Refresh the browser.
3. Sign out and sign in again.

## 13. Recommended Setup Checklist

Use this quick checklist when setting up on a new machine:

1. Clone repo
2. cd Y.A.E.P
3. cd youth-arts-platform
4. npm install
5. Create .env with Supabase URL and anon key
6. Run schema.sql in Supabase SQL Editor
7. npm run dev
8. Register admin, trainer, student
9. Approve student and assign trainer category in admin dashboard
10. Assign approved student to trainer
11. Test submission and trainer review flow

## 14. Tech Stack

- React
- TypeScript
- Vite
- React Router
- Supabase Auth
- Supabase Postgres
- Supabase Storage
>>>>>>> 5b2df04 (Implement SRS phase updates, trainer flow fixes, and docs cleanup)
