import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import { LayoutDashboard, Users, Truck, Route, GraduationCap, LogOut, Eye, CalendarOff } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Pianificazione", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/autisti", label: "Autisti", icon: Users, tid: "nav-drivers" },
  { to: "/mezzi", label: "Mezzi", icon: Truck, tid: "nav-fleet" },
  { to: "/giri", label: "Giri", icon: Route, tid: "nav-routes" },
  { to: "/assenze", label: "Assenze", icon: CalendarOff, tid: "nav-absences" },
  { to: "/formazioni", label: "Formazioni", icon: GraduationCap, tid: "nav-skills" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-16 lg:w-60 shrink-0 border-r border-border bg-card flex flex-col fixed h-screen z-20">
        <div className="h-16 flex items-center px-3 lg:px-5 border-b border-border">
          <div className="hidden lg:block"><Logo size={32} /></div>
          <div className="lg:hidden mx-auto"><Logo size={30} showText={false} /></div>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 lg:px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon size={18} className="shrink-0" />
              <span className="hidden lg:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-2 lg:p-3 border-t border-border space-y-1">
          <button
            data-testid="view-board-btn"
            onClick={() => navigate("/tabellone")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors duration-150"
          >
            <Eye size={18} className="shrink-0" />
            <span className="hidden lg:inline">Tabellone</span>
          </button>
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors duration-150"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="hidden lg:inline">Esci</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-16 lg:ml-60 min-w-0">
        <header className="h-16 border-b border-border bg-card/70 backdrop-blur-xl sticky top-0 z-10 flex items-center justify-end px-6">
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="overline text-primary">Amministratore</div>
            </div>
            <div className="h-9 w-9 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-sm">
              {user?.name?.[0] || "A"}
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
