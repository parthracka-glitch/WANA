import './App.css';
import { Route, Routes, Navigate } from 'react-router-dom';

import Header from './pages/header/Header.jsx';

// Auth
import Signup from './pages/auth/signup/Signup.jsx';
import Login from './pages/auth/login/Login.jsx';
import LogoutPage from './pages/auth/logout/logout.jsx';
import VerifyEmail from './pages/auth/VerifyEmail.jsx';
import Rejected from './pages/auth/Rejected.jsx';
import Suspended from './pages/auth/Suspended.jsx';

// Pages
import Home from './pages/Home/Home.jsx';
import History from './pages/History/Historyf.jsx';
import AdminLogs from './pages/admin/AdminLogs.jsx';
import LiveTracking from './pages/citizen/LiveTracking.jsx';

// Supervisor & Admin
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard.jsx';
import OngoingEvents from './pages/supervisor/OngoingEvents.jsx';
import AcceptorEvents from './pages/supervisor/AcceptorEvents.jsx';
import AdminApproval from './pages/admin/AdminApproval.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

// Lifecycle Pages for Supervisors (FE-01, FE-02)
import CompleteProfile from './pages/supervisor/CompleteProfile.jsx'; 
import PendingApproval from './pages/supervisor/PendingApproval.jsx'; 

// Route Guard
import ProtectedRoute from './pages/components/ProtectedRoute.jsx';

function App() {
  return (
    <>
      <Header />
      <Routes>
        {/* --- Public Routes --- */}
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/rejected" element={<Rejected />} />
        <Route path="/suspended" element={<Suspended />} />
        <Route path="/track/:eventId" element={<LiveTracking />} />

        {/* --- Supervisor Lifecycle Routes --- */}
        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <CompleteProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pending-approval"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <PendingApproval />
            </ProtectedRoute>
          }
        />

        {/* --- Fully Protected Supervisor Routes --- */}
        <Route
          path="/supervisor/dashboard"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <SupervisorDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/supervisor/ongoing-events"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <OngoingEvents />
            </ProtectedRoute>
          }
        />

        <Route
          path="/supervisor/acceptors"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <AcceptorEvents />
            </ProtectedRoute>
          }
        />

        <Route
          path="/supervisor/history"
          element={
            <ProtectedRoute allowedRole="supervisor">
              <History />
            </ProtectedRoute>
          }
        />

        {/* --- Admin Routes --- */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/approval"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminApproval />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/logs"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminLogs />
            </ProtectedRoute>
          }
        />

        {/* --- Redirects for legacy unfiltered routes --- */}
        <Route path="/dashboard" element={<Navigate to="/supervisor/dashboard" replace />} />
        <Route path="/currentstatus" element={<Navigate to="/supervisor/dashboard" replace />} />

        <Route
          path="/logout"
          element={
            <ProtectedRoute>
              <LogoutPage />
            </ProtectedRoute>
          }
        />

        {/* --- Fallbacks --- */}
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="*" element={<Navigate to="/home" />} />
      </Routes>
    </>
  );
}

export default App;