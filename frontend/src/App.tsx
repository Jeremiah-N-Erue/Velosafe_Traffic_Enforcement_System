import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Zones from "./pages/Zones";
import Vehicles from "./pages/Vehicles";
import Violations from "./pages/Violations";
import Incidents from "./pages/Incidents";
import ReviewQueue from "./pages/ReviewQueue";
import AdminOversight from "./pages/AdminOversight";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="full-page-loading">Loading VeloSafe…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/zones" element={<Zones />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/violations" element={<Violations />} />
                <Route path="/review" element={<ReviewQueue />} />
                <Route
                  path="/oversight"
                  element={
                    <AdminRoute>
                      <AdminOversight />
                    </AdminRoute>
                  }
                />
                <Route path="/incidents" element={<Incidents />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
