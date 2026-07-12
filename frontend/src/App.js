import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Drivers from "./pages/Drivers";
import Fleet from "./pages/Fleet";
import RoutesPage from "./pages/RoutesPage";
import SkillMatrix from "./pages/SkillMatrix";
import DriverView from "./pages/DriverView";
import "./App.css";

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/" : "/tabellone"} replace />;
  }
  return children;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/dashboard" : "/tabellone"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/tabellone"
            element={
              <Protected>
                <DriverView />
              </Protected>
            }
          />
          <Route
            element={
              <Protected role="admin">
                <Layout />
              </Protected>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/autisti" element={<Drivers />} />
            <Route path="/mezzi" element={<Fleet />} />
            <Route path="/giri" element={<RoutesPage />} />
            <Route path="/formazioni" element={<SkillMatrix />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
