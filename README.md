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

## Prerequisites

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
