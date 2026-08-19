import { useState, useCallback } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import NotificationsPanel from "./NotificationsPanel";
import {
  LayoutDashboard,
  Users,
  Truck,
  Route,
  GraduationCap,
  LogOut,
  Eye,
  CalendarOff,
  ArrowLeftRight,
  Menu,
  X,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { initials } from "../lib/dates";

const PRIMARY_NAV = [
  { to: "/dashboard", label: "Turni", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/autisti", label: "Autisti", icon: Users, tid: "nav-drivers" },
  { to: "/mezzi", label: "Mezzi", icon: Truck, tid: "nav-fleet" },
  { to: "/giri", label: "Giri", icon: Route, tid: "nav-routes" },
];

const SECONDARY_NAV = [
  { to: "/assenze", label: "Assenze & Ferie", icon: CalendarOff, tid: "nav-absences" },
  { to: "/scambi", label: "Scambi Turno", icon: ArrowLeftRight, tid: "nav-swaps" },
  { to: "/formazioni", label: "Abilitazioni", icon: GraduationCap, tid: "nav-skills" },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger a full page data reload by dispatching a custom event that pages listen to
    window.dispatchEvent(new CustomEvent("hera:refresh"));
    // Also reload the page if there's no listener yet
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const isSecondaryActive = SECONDARY_NAV.some((n) => location.pathname === n.to);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* ================= DESKTOP SIDEBAR (lg+) ================= */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-card flex-col fixed h-screen z-20">
        {/* Logo brand */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Logo size={32} />
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto board-scroll">
          <div className="overline text-muted-foreground px-3 py-1 text-[10px]">Gestione Principale</div>
          {PRIMARY_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon size={18} className="shrink-0" />
              <span>{n.label}</span>
            </NavLink>
          ))}

          <div className="overline text-muted-foreground px-3 pt-4 pb-1 text-[10px]">Avanzate</div>
          {SECONDARY_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon size={18} className="shrink-0" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer actions */}
        <div className="p-3 border-t border-border space-y-1.5 bg-card/50">
          <div className="flex items-center gap-2 mb-2">
            <button
              id="refresh-btn-desktop"
              onClick={handleRefresh}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-sm text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors border border-border/50"
              title="Aggiorna i dati"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>Aggiorna</span>
            </button>
            <NotificationsPanel side="top" align="start" />
          </div>
          <button
            data-testid="view-board-btn"
            onClick={() => navigate("/tabellone")}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-sm text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors duration-150 border border-border/50"
          >
            <div className="flex items-center gap-2.5">
              <Eye size={17} className="text-primary shrink-0" />
              <span>Vista Tabellone</span>
            </div>
            <ChevronRight size={14} className="text-muted-foreground" />
          </button>
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors duration-150"
          >
            <LogOut size={16} className="shrink-0" />
            <span>Esci dall'account</span>
          </button>
        </div>
      </aside>

      {/* ================= MOBILE / TABLET TOP HEADER (<lg) ================= */}
      <header className="lg:hidden h-14 border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Logo size={26} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/tabellone")}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-sm bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            <Eye size={14} />
            <span>Tabellone</span>
          </button>
          {/* Refresh button */}
          <button
            type="button"
            id="refresh-btn-mobile"
            onClick={handleRefresh}
            className="h-9 w-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Aggiorna dati"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
          {/* Notifications */}
          <NotificationsPanel side="bottom" align="end" />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-sm border border-border text-foreground hover:bg-secondary transition-colors"
            aria-label="Apri menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* ================= MOBILE SLIDE-OVER DRAWER (<lg) ================= */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative ml-auto w-4/5 max-w-xs bg-card h-full shadow-2xl flex flex-col z-10 border-l border-border animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs">
                  {initials(user?.name || "A")}
                </div>
                <div>
                  <div className="text-xs font-bold leading-none">{user?.name}</div>
                  <div className="overline text-[9px] text-primary mt-0.5">Amministratore</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-sm hover:bg-secondary text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Menu items */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto board-scroll">
              <div className="overline text-muted-foreground px-3 py-1 text-[10px]">Tutte le Sezioni</div>
              {ALL_NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-sm text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground hover:bg-secondary"
                    }`
                  }
                >
                  <n.icon size={18} className="shrink-0" />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Drawer footer */}
            <div className="p-4 border-t border-border space-y-2 bg-secondary/30">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  navigate("/tabellone");
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-sm font-semibold bg-primary/10 text-primary border border-primary/20"
              >
                <Eye size={16} /> Vista Tabellone
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut size={16} /> Esci dall'account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MAIN CONTENT AREA ================= */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col min-h-screen">
        {/* Desktop Top Header (lg+) */}
        <header className="hidden lg:flex h-16 border-b border-border bg-card/70 backdrop-blur-xl sticky top-0 z-10 items-center justify-end px-8">
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="overline text-primary">Amministratore</div>
            </div>
            <div className="h-9 w-9 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-sm shadow-sm">
              {initials(user?.name || "A")}
            </div>
          </div>
        </header>

        {/* Page Content with safe padding for mobile bottom nav */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* ================= MOBILE BOTTOM NAVIGATION BAR (<lg) ================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-1 py-1.5 shadow-lg" style={{ paddingBottom: "calc(0.4rem + var(--sab))" }}>
        {PRIMARY_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-sm text-[11px] font-medium transition-colors ${
                isActive
                  ? "text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <n.icon size={20} className="mb-0.5" />
            <span className="truncate max-w-[64px]">{n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-sm text-[11px] font-medium transition-colors ${
            isSecondaryActive ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Menu size={20} className="mb-0.5" />
          <span>Altro</span>
        </button>
      </nav>
    </div>
  );
}
