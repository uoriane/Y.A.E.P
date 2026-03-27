import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { SignInPage } from './pages/SignInPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { TrainerDashboardPage } from './pages/TrainerDashboardPage.tsx'
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx'
import { HelpPage } from './pages/HelpPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/trainer-dashboard"
          element={<TrainerDashboardPage />}
        />
        <Route
          path="/admin-dashboard"
          element={<AdminDashboardPage />}
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
