import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { useAuthStore } from './store/authStore';
import { Dashboard } from './pages/Dashboard';
import { RoomPage } from './pages/RoomPage';
import { JoinPage } from './pages/JoinPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Auth />}
        />
        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />
        <Route
          path="/room/:roomId"
          element={<ProtectedRoute><RoomPage /></ProtectedRoute>}
        />
        {/* Invite link route — redirects to login if not authenticated */}
        <Route path="/join/:token" element={<JoinPage />} />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </Router>
  );
}

export default App;
