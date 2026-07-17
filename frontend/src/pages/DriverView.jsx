import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { weekKey, weekLabel, shiftWeek, DAY_FULL, initials } from "../lib/dates";
import ScheduleBoard from "../components/ScheduleBoard";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { ChevronLeft, ChevronRight, LogOut, LayoutDashboard, Clock } from "lucide-react";

const SLOT_TIME = { presto: "05:30 – 11:50", standard: "06:00 – 12:20", pomeriggio: "12:30 – 18:50", domenica: "06:00 – 12:20" };
const SLOT_LABEL = { presto: "Mattino Presto", standard: "Mattino Standard", pomeriggio: "Pomeriggio", domenica: "Turno Domenica" };

export default function DriverView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ref, setRef] = useState(new Date());
  const [shifts, setShifts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const wk = weekKey(ref);
  const myId = user?.driver_id;

  useEffect(() => {
    Promise.all([api.get("/routes"), api.get("/vehicles"), api.get("/drivers")]).then(([r, v, d]) => {
      setRoutes(r.data);
      setVehicles(v.data);
      setDrivers(d.data);
    });
  }, []);
  useEffect(() => {
    api.get(`/shifts?week_start=${wk}`).then((r) => setShifts(r.data));
  }, [wk]);

  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const myShifts = myId ? shifts.filter((s) => s.driver_id === myId).sort((a, b) => a.day - b.day) : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6">
        <Logo size={32} />
        <div className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Button variant="outline" size="sm" className="rounded-sm" data-testid="back-admin-btn" onClick={() => navigate("/dashboard")}>
              <LayoutDashboard size={15} className="mr-1.5" /> <span className="hidden sm:inline">Admin</span>
            </Button>
          )}
          <div className="hidden sm:flex items-center gap-2 mr-1">
            <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs">
              {initials(user?.name || "?")}
            </div>
            <span className="text-sm font-semibold">{user?.name}</span>
          </div>
          <Button variant="ghost" size="sm" className="rounded-sm" data-testid="driver-logout-btn" onClick={logout}>
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <div className="overline text-primary mb-1">Tabellone condiviso · sola lettura</div>
          <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tighter">Turni della settimana</h1>
        </div>

        {/* my shifts */}
        {myId && (
          <div>
            <div className="overline text-muted-foreground mb-2">I miei turni</div>
            {myShifts.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground bg-card">
                Nessun turno assegnato questa settimana.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myShifts.map((s) => {
                  const route = routeById[s.route_id];
                  const veh = vehicleById[s.vehicle_id];
                  return (
                    <div key={s.id} className="border border-primary/40 bg-primary/5 rounded-sm p-4" data-testid={`my-shift-${s.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-head font-bold">{DAY_FULL[s.day]}</span>
                        <span className="font-mono text-xs px-1.5 py-0.5 bg-card border border-border rounded-sm">{route?.code}</span>
                      </div>
                      <div className="text-sm font-medium mt-1">{route?.name}</div>
                      <div className="flex items-center gap-2 mt-2 font-mono text-xs text-muted-foreground">
                        <Clock size={12} /> {SLOT_TIME[s.slot]} · {SLOT_LABEL[s.slot]}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-1">{veh?.name} · {veh?.plate}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* week nav */}
        <div className="border border-border bg-card rounded-sm p-3 flex items-center justify-between max-w-md">
          <button data-testid="dv-prev-week" onClick={() => setRef(shiftWeek(ref, -1))} className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150">
            <ChevronLeft size={18} />
          </button>
          <div className="font-head font-bold text-sm">{weekLabel(ref)}</div>
          <button data-testid="dv-next-week" onClick={() => setRef(shiftWeek(ref, 1))} className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150">
            <ChevronRight size={18} />
          </button>
        </div>

        <div>
          <div className="overline text-muted-foreground mb-2">Tutti i colleghi</div>
          {shifts.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-muted-foreground bg-card">
              I turni di questa settimana non sono ancora stati pubblicati.
            </div>
          ) : (
            <ScheduleBoard shifts={shifts} routes={routes} vehicles={vehicles} drivers={drivers} highlightDriverId={myId} />
          )}
        </div>
      </main>
    </div>
  );
}
