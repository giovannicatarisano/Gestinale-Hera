import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { weekKey, weekLabel, shiftWeek, DAY_FULL, initials } from "../lib/dates";
import ScheduleBoard from "../components/ScheduleBoard";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, LogOut, LayoutDashboard, Clock, Bell, ArrowLeftRight } from "lucide-react";

const SLOT_TIME = { presto: "05:30 – 11:50", standard: "06:00 – 12:20", pomeriggio: "12:30 – 18:50", domenica: "06:00 – 12:20" };
const SLOT_LABEL = { presto: "Mattino Presto", standard: "Mattino Standard", pomeriggio: "Pomeriggio", domenica: "Turno Domenica" };
const SWAP_STATUS = { pending: "In attesa", approved: "Approvato", rejected: "Rifiutato" };

export default function DriverView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ref, setRef] = useState(new Date());
  const [shifts, setShifts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [rotation, setRotation] = useState(null);
  const [swapShift, setSwapShift] = useState(null);
  const [swapTo, setSwapTo] = useState("");
  const [swapNote, setSwapNote] = useState("");
  const wk = weekKey(ref);
  const myId = user?.driver_id;

  useEffect(() => {
    Promise.all([api.get("/routes"), api.get("/vehicles"), api.get("/drivers")]).then(([r, v, d]) => {
      setRoutes(r.data); setVehicles(v.data); setDrivers(d.data);
    });
  }, []);

  const loadNotifs = useCallback(() => { if (myId) api.get("/notifications").then((r) => setNotifs(r.data)); }, [myId]);
  const loadSwaps = useCallback(() => { if (myId) api.get("/swap-requests").then((r) => setSwaps(r.data)); }, [myId]);
  useEffect(() => { loadNotifs(); loadSwaps(); }, [loadNotifs, loadSwaps]);

  useEffect(() => {
    api.get(`/shifts?week_start=${wk}`).then((r) => setShifts(r.data));
    api.get(`/rotation?week_start=${wk}`).then((r) => setRotation(r.data)).catch(() => setRotation(null));
  }, [wk]);

  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const myShifts = myId ? shifts.filter((s) => s.driver_id === myId && s.status !== "recovered").sort((a, b) => a.day - b.day) : [];
  const unread = notifs.filter((n) => !n.read).length;
  const mySlot = rotation?.rotation?.find((r) => r.driver_id === myId)?.slot;

  const openNotifs = (open) => {
    if (open && unread > 0) {
      api.post("/notifications/read", {}).then(() => setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))));
    }
  };

  const submitSwap = async () => {
    if (!swapTo) return toast.error("Seleziona un collega");
    try {
      await api.post("/swap-requests", { shift_id: swapShift.id, to_driver_id: swapTo, note: swapNote });
      toast.success("Richiesta di cambio inviata · in attesa di approvazione");
      setSwapShift(null); setSwapTo(""); setSwapNote("");
      loadSwaps();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const colleagues = drivers.filter((d) => d.id !== myId && d.active);
  const swapForShift = (sid) => swaps.find((s) => s.shift_id === sid && s.status === "pending");

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
          {myId && (
            <Popover onOpenChange={openNotifs}>
              <PopoverTrigger asChild>
                <button data-testid="notif-bell" className="relative h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150">
                  <Bell size={17} />
                  {unread > 0 && (
                    <span data-testid="notif-count" className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 rounded-sm p-0">
                <div className="p-3 border-b border-border overline text-muted-foreground">Notifiche</div>
                <div className="max-h-80 overflow-y-auto board-scroll">
                  {notifs.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Nessuna notifica.</div>
                  ) : (
                    notifs.map((n) => (
                      <div key={n.id} className="p-3 border-b border-border last:border-0" data-testid={`notif-${n.id}`}>
                        <div className="text-sm">{n.message}</div>
                        <div className="font-mono text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("it-IT")}</div>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="overline text-primary mb-1">Tabellone condiviso · sola lettura</div>
            <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tighter">Turni della settimana</h1>
          </div>
          {myId && mySlot && (
            <div className="border border-primary/40 bg-primary/5 rounded-sm px-4 py-2" data-testid="my-rotation">
              <div className="overline text-muted-foreground">Il mio turno questa settimana</div>
              <div className="font-head font-bold text-primary">{SLOT_LABEL[mySlot]}</div>
            </div>
          )}
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
                  const pendingSwap = swapForShift(s.id);
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
                      {pendingSwap ? (
                        <div className="mt-3 text-xs font-mono text-orange-600 flex items-center gap-1">
                          <ArrowLeftRight size={12} /> Cambio richiesto → {pendingSwap.to_name} (in attesa)
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="rounded-sm w-full mt-3" data-testid={`request-swap-${s.id}`} onClick={() => { setSwapShift(s); setSwapTo(""); setSwapNote(""); }}>
                          <ArrowLeftRight size={14} className="mr-1.5" /> Richiedi cambio
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* my swap requests */}
        {myId && swaps.length > 0 && (
          <div>
            <div className="overline text-muted-foreground mb-2">Le mie richieste di cambio</div>
            <div className="border border-border bg-card rounded-sm divide-y divide-border">
              {swaps.map((sw) => (
                <div key={sw.id} className="flex items-center justify-between gap-3 p-3" data-testid={`my-swap-${sw.id}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{sw.shift_label}</div>
                    <div className="font-mono text-xs text-muted-foreground">{sw.from_name} → {sw.to_name}</div>
                  </div>
                  <span className={`overline px-1.5 py-0.5 rounded-sm shrink-0 ${sw.status === "approved" ? "bg-primary/15 text-primary" : sw.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-orange-100 text-orange-700"}`}>
                    {SWAP_STATUS[sw.status]}
                  </span>
                </div>
              ))}
            </div>
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

      {/* swap request modal */}
      <Dialog open={!!swapShift} onOpenChange={(o) => !o && setSwapShift(null)}>
        <DialogContent className="rounded-sm" data-testid="swap-modal">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight">Richiedi cambio turno</DialogTitle>
            <DialogDescription className="sr-only">Scegli un collega a cui proporre il tuo turno; la richiesta sarà approvata da un assistente.</DialogDescription>
          </DialogHeader>
          {swapShift && (
            <div className="space-y-4 py-2">
              <div className="border border-border rounded-sm p-3">
                <div className="text-sm font-medium">{routeById[swapShift.route_id]?.name}</div>
                <div className="font-mono text-xs text-muted-foreground mt-1">{DAY_FULL[swapShift.day]} · {SLOT_LABEL[swapShift.slot]}</div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1.5">Proponi a</div>
                <Select value={swapTo} onValueChange={setSwapTo}>
                  <SelectTrigger className="rounded-sm" data-testid="swap-colleague-select"><SelectValue placeholder="Seleziona collega" /></SelectTrigger>
                  <SelectContent>{colleagues.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1.5">Motivazione (opz.)</div>
                <Textarea data-testid="swap-note-input" value={swapNote} onChange={(e) => setSwapNote(e.target.value)} rows={2} className="rounded-sm" />
              </div>
              <p className="text-xs text-muted-foreground">La richiesta dovrà essere approvata da un assistente/amministratore.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-sm" onClick={() => setSwapShift(null)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90" data-testid="submit-swap-btn" onClick={submitSwap}>Invia richiesta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
