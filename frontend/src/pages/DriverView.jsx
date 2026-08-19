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
import { ChevronLeft, ChevronRight, LogOut, LayoutDashboard, Clock, Bell, ArrowLeftRight, Check, X as XIcon, Info } from "lucide-react";

const SLOT_TIME = { presto: "05:30 – 11:50", standard: "06:00 – 12:20", pomeriggio: "12:30 – 18:50", domenica: "06:00 – 12:20" };
const SLOT_LABEL = { presto: "Mattino Presto", standard: "Mattino Standard", pomeriggio: "Pomeriggio", domenica: "Turno Domenica" };
const SWAP_STATUS = {
  pending_driver: { label: "In attesa risposta collega", cls: "bg-amber-500/15 text-amber-700" },
  pending_admin: { label: "In attesa admin", cls: "bg-blue-500/15 text-blue-700" },
  approved: { label: "Approvato ✅", cls: "bg-emerald-500/15 text-emerald-700" },
  rejected: { label: "Rifiutato ❌", cls: "bg-destructive/15 text-destructive" },
  pending: { label: "In attesa", cls: "bg-amber-500/15 text-amber-700" },
};

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
  useEffect(() => {
    loadNotifs(); loadSwaps();
    const onRefresh = () => { loadNotifs(); loadSwaps(); };
    window.addEventListener("hera:refresh", onRefresh);
    return () => window.removeEventListener("hera:refresh", onRefresh);
  }, [loadNotifs, loadSwaps]);

  useEffect(() => {
    api.get(`/shifts?week_start=${wk}`).then((r) => setShifts(r.data));
    api.get(`/rotation?week_start=${wk}`).then((r) => setRotation(r.data)).catch(() => setRotation(null));
  }, [wk]);

  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const myShifts = myId ? shifts.filter((s) => s.driver_id === myId && s.status !== "recovered").sort((a, b) => a.day - b.day) : [];
  const unread = notifs.filter((n) => !n.read).length;
  const mySlot = rotation?.rotation?.find((r) => r.driver_id === myId)?.slot;

  // Swaps I sent
  const mySentSwaps = swaps.filter((sw) => sw.from_driver_id === myId);
  // Swaps I received and must respond to
  const myIncomingSwaps = swaps.filter((sw) => sw.to_driver_id === myId && sw.status === "pending_driver");

  const swapForShift = (sid) => swaps.find((s) => s.shift_id === sid && ["pending_driver","pending_admin","pending"].includes(s.status) && s.from_driver_id === myId);

  const respondToSwap = async (swapId, accepted) => {
    try {
      await api.patch(`/swap-requests/${swapId}/driver-respond`, { accepted });
      toast.success(accepted ? "✅ Hai accettato il cambio — in attesa dell'admin" : "Hai rifiutato la richiesta");
      loadSwaps(); loadNotifs();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const openNotifs = (open) => {
    if (open && unread > 0) {
      api.post("/notifications/read", {}).then(() => setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))));
    }
  };

  const submitSwap = async () => {
    if (!swapTo) return toast.error("Seleziona un collega");
    try {
      await api.post("/swap-requests", { shift_id: swapShift.id, to_driver_id: swapTo, note: swapNote });
      toast.success("Richiesta di cambio inviata · notifica inviata al collega e all'admin");
      setSwapShift(null); setSwapTo(""); setSwapNote("");
      loadSwaps();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const colleagues = drivers.filter((d) => d.id !== myId && d.active);

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="h-14 sm:h-16 border-b border-border bg-card/90 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between px-3 sm:px-6">
        <Logo size={28} />
        <div className="flex items-center gap-1.5 sm:gap-2">
          {user?.role === "admin" && (
            <Button variant="outline" size="sm" className="rounded-sm text-xs h-9 px-2.5 sm:px-3" data-testid="back-admin-btn" onClick={() => navigate("/dashboard")}>
              <LayoutDashboard size={14} className="mr-1 sm:mr-1.5" /> <span>Admin</span>
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
              <PopoverContent align="end" className="w-[88vw] sm:w-80 rounded-sm p-0">
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
          <Button variant="ghost" size="sm" className="rounded-sm h-9 w-9 p-0 text-muted-foreground hover:text-destructive" data-testid="driver-logout-btn" onClick={logout} title="Esci">
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      <main className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="overline text-primary mb-0.5">Tabellone condiviso · sola lettura</div>
            <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter">Turni della settimana</h1>
          </div>
          {myId && (
            <div className="flex flex-wrap gap-2">
              {/* Group badge */}
              {(() => {
                const myDriver = drivers.find(d => d.id === myId);
                const myGroup = myDriver?.group;
                const myEntry = rotation?.rotation?.find((r) => r.driver_id === myId);
                const cat = myEntry?.group_category; // "mattina" or "pomeriggio"
                return (
                  <>
                    {myGroup && (
                      <div className={`border rounded-sm px-3.5 py-2 shrink-0 self-start sm:self-auto ${
                        myGroup === "gruppo1"
                          ? "border-blue-500/40 bg-blue-500/5"
                          : "border-orange-500/40 bg-orange-500/5"
                      }`}>
                        <div className="overline text-muted-foreground text-[10px]">
                          {myGroup === "gruppo1" ? "Gruppo 1" : "Gruppo 2"}
                        </div>
                        <div className={`font-head font-bold text-sm sm:text-base ${
                          myGroup === "gruppo1" ? "text-blue-700 dark:text-blue-400" : "text-orange-700 dark:text-orange-400"
                        }`}>
                          {cat === "mattina" ? "☀️ Turno Mattina" : cat === "pomeriggio" ? "🌆 Turno Pomeriggio" : mySlot ? SLOT_LABEL[mySlot] : "—"}
                        </div>
                      </div>
                    )}
                    {mySlot && (
                      <div className="border border-primary/40 bg-primary/5 rounded-sm px-3.5 py-2 shrink-0 self-start sm:self-auto" data-testid="my-rotation">
                        <div className="overline text-muted-foreground text-[10px]">Turno specifico questa settimana</div>
                        <div className="font-head font-bold text-primary text-sm sm:text-base">{SLOT_LABEL[mySlot]}</div>
                        <div className="font-mono text-xs text-muted-foreground">{SLOT_TIME[mySlot]}</div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* my shifts */}
        {myId && (
          <div>
            <div className="overline text-muted-foreground mb-2">I miei turni</div>
            {myShifts.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground bg-card">
                Nessun turno assegnato per te questa settimana.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myShifts.map((s) => {
                  const route = routeById[s.route_id];
                  const veh = vehicleById[s.vehicle_id];
                  const pendingSwap = swapForShift(s.id);
                  return (
                    <div key={s.id} className="border border-primary/40 bg-primary/5 rounded-sm p-3.5 sm:p-4 shadow-xs" data-testid={`my-shift-${s.id}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-head font-bold text-base">{DAY_FULL[s.day]}</span>
                        <span className="font-mono text-xs px-2 py-0.5 bg-card border border-border rounded-sm font-semibold">{route?.code}</span>
                      </div>
                      <div className="text-sm font-semibold text-foreground mt-1">{route?.name}</div>
                      <div className="flex items-center gap-2 mt-2 font-mono text-xs text-muted-foreground">
                        <Clock size={12} /> {SLOT_TIME[s.slot]} · {SLOT_LABEL[s.slot]}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-1">Mezzo: <span className="font-medium text-foreground">{veh?.name}</span> · {veh?.plate}</div>
                      {pendingSwap ? (
                        <div className="mt-3 text-xs font-mono text-amber-700 bg-amber-500/10 p-2 rounded-sm border border-amber-500/20 flex items-center gap-1.5">
                          <ArrowLeftRight size={13} className="shrink-0" />
                          <span>Cambio richiesto → <b>{pendingSwap.to_name}</b> (in attesa)</span>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="rounded-sm w-full mt-3 h-10 font-semibold text-xs" data-testid={`request-swap-${s.id}`} onClick={() => { setSwapShift(s); setSwapTo(""); setSwapNote(""); }}>
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

        {/* incoming swaps — requests where I am the target driver */}
        {myId && myIncomingSwaps.length > 0 && (
          <div>
            <div className="overline text-primary mb-2 flex items-center gap-1.5">
              <ArrowLeftRight size={12} /> Richieste di cambio ricevute
              <span className="ml-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">{myIncomingSwaps.length}</span>
            </div>
            <div className="space-y-3">
              {myIncomingSwaps.map((sw) => (
                <div key={sw.id} className="border border-primary/30 bg-primary/5 rounded-sm p-3.5 sm:p-4" data-testid={`incoming-swap-${sw.id}`}>
                  <div className="text-sm font-semibold">{sw.from_name} ti propone di prendere il suo turno</div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5">{sw.shift_label}</div>
                  {sw.note && <div className="text-xs italic text-muted-foreground mt-1 bg-secondary/40 p-1.5 rounded-sm">"{sw.note}"</div>}
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="flex-1 h-10 rounded-sm bg-primary hover:bg-primary/90 font-semibold text-xs" data-testid={`accept-swap-${sw.id}`} onClick={() => respondToSwap(sw.id, true)}>
                      <Check size={13} className="mr-1.5" /> Accetto
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-10 rounded-sm text-destructive hover:bg-destructive/10 font-semibold text-xs" data-testid={`refuse-swap-${sw.id}`} onClick={() => respondToSwap(sw.id, false)}>
                      <XIcon size={13} className="mr-1.5" /> Rifiuto
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* my swap requests */}
        {myId && mySentSwaps.length > 0 && (
          <div>
            <div className="overline text-muted-foreground mb-2">Le mie richieste di cambio</div>
            <div className="border border-border bg-card rounded-sm divide-y divide-border">
              {mySentSwaps.map((sw) => {
                const st = SWAP_STATUS[sw.status] || SWAP_STATUS.pending;
                return (
                  <div key={sw.id} className="flex items-center justify-between gap-3 p-3" data-testid={`my-swap-${sw.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{sw.shift_label}</div>
                      <div className="font-mono text-xs text-muted-foreground">{sw.from_name} → {sw.to_name}</div>
                    </div>
                    <span className={`overline text-[10px] px-2 py-0.5 rounded-sm shrink-0 font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* week nav */}
        <div className="border border-border bg-card rounded-sm p-2.5 flex items-center justify-between w-full sm:max-w-md shadow-xs">
          <button data-testid="dv-prev-week" onClick={() => setRef(shiftWeek(ref, -1))} className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150" title="Settimana precedente">
            <ChevronLeft size={18} />
          </button>
          <div className="font-head font-bold text-sm sm:text-base text-center px-2">{weekLabel(ref)}</div>
          <button data-testid="dv-next-week" onClick={() => setRef(shiftWeek(ref, 1))} className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150" title="Settimana successiva">
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
        <DialogContent className="w-[94vw] sm:max-w-md rounded-sm p-4 sm:p-5 max-h-[85vh] overflow-y-auto" data-testid="swap-modal">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight text-lg">Richiedi cambio turno</DialogTitle>
            <DialogDescription className="sr-only">Scegli un collega a cui proporre il tuo turno; la richiesta sarà approvata da un assistente.</DialogDescription>
          </DialogHeader>
          {swapShift && (
            <div className="space-y-3.5 py-2">
              <div className="border border-border rounded-sm p-3 bg-secondary/30">
                <div className="text-sm font-semibold">{routeById[swapShift.route_id]?.name}</div>
                <div className="font-mono text-xs text-muted-foreground mt-1">{DAY_FULL[swapShift.day]} · {SLOT_LABEL[swapShift.slot]}</div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1.5">Proponi a un collega</div>
                <Select value={swapTo} onValueChange={setSwapTo}>
                  <SelectTrigger className="rounded-sm h-10 text-xs sm:text-sm" data-testid="swap-colleague-select"><SelectValue placeholder="Seleziona collega" /></SelectTrigger>
                  <SelectContent className="max-h-60">{colleagues.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1.5">Motivazione (opzionale)</div>
                <Textarea data-testid="swap-note-input" value={swapNote} onChange={(e) => setSwapNote(e.target.value)} rows={2} className="rounded-sm text-xs sm:text-sm" placeholder="es. Impegno personale, visita..." />
              </div>
              {/* Dual-approval info banner */}
              <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-sm p-3 text-xs text-blue-700 dark:text-blue-400">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>Il collega riceverà una notifica e dovrà accettare. Dopo, l'admin approverà definitivamente. Solo con <b>entrambe le approvazioni</b> il cambio viene effettuato.</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" className="rounded-sm h-10 text-xs" onClick={() => setSwapShift(null)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90 h-10 text-xs font-semibold" data-testid="submit-swap-btn" onClick={submitSwap}>Invia richiesta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
