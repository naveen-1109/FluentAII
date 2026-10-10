import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminGuard } from './components/admin';
import { AuthFrame } from './components/AuthShell';
import { AppLayout } from './components/Layout';
import { RequireAuth } from './lib/auth';
import { AdminActivity, AdminClinicians, AdminFeatures, AdminOverview, AdminPatientDetail, AdminPatients } from './pages/Admin';
import Appointments from './pages/Appointments';
import Clinicians from './pages/Clinicians';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import { PatientDetail, Patients } from './pages/Patients';
import Record from './pages/Record';
import Roadmap from './pages/Roadmap';
import Register from './pages/Register';
import SessionDetail from './pages/SessionDetail';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Signup from './pages/Signup';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AuthFrame />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="record" element={<RequireAuth role="patient"><Record /></RequireAuth>} />
        <Route path="sessions" element={<RequireAuth role="patient"><Sessions /></RequireAuth>} />
        <Route path="sessions/:id" element={<SessionDetail />} />
        <Route path="roadmap" element={<RequireAuth role="patient"><Roadmap /></RequireAuth>} />
        <Route path="clinicians" element={<RequireAuth role="patient"><Clinicians /></RequireAuth>} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="patients" element={<RequireAuth role="clinician"><Patients /></RequireAuth>} />
        <Route path="patients/:id" element={<RequireAuth role="clinician"><PatientDetail /></RequireAuth>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route index element={<AdminOverview />} />
        <Route path="features" element={<AdminFeatures />} />
        <Route path="patients" element={<AdminPatients />} />
        <Route path="patients/:id" element={<AdminPatientDetail />} />
        <Route path="clinicians" element={<AdminClinicians />} />
        <Route path="activity" element={<AdminActivity />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
