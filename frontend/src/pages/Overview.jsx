import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { apiError } from "../lib/api";
import { weekKey } from "../lib/dates";
import { Button } from "../components/ui/button";
import {
  Truck,
  Users,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ArrowRight,
  Clock,
  ShieldAlert,
  ArrowLeftRight,
  BriefcaseMedical,
  Sparkles,
  CalendarOff,
  Sun,
  Sunset,
  Sunrise,
  Activity,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export default function Overview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dati
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [rotation, setRotation] = useState(null);

  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];
  // 0 = Lunedì, 6 = Domenica
  const dayOfWeek = (today.getDay() + 6) % 7;
  const wk = weekKey(today);

  const loadAllData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [drvRes, vehRes, rtsRes, shfRes, absRes, swpRes, rotRes] = await Promise.all([
        api.get("/drivers"),
        api.get("/vehicles"),
        api.get("/routes"),
        api.get(`/shifts?week_start=${wk}`),
        api.get("/absences").catch(() => ({ data: [] })),
        api.get("/swap-requests").catch(() => ({ data: [] })),
        api.get(`/rotation?week_start=${wk}`).catch(() => ({ data: null })),
      ]);

      setDrivers(drvRes.data || []);
      setVehicles(vehRes.data || []);
      setRoutes(rtsRes.data || []);
      setShifts(shfRes.data || []);
      setAbsences(absRes.data || []);
      setSwaps(swpRes.data || []);
      setRotation(rotRes.data || null);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore nel caricamento del quadro operativo");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wk]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Listener per refresh globale
  useEffect(() => {
    const onRefresh = () => loadAllData(true);
    window.addEventListener("hera:refresh", onRefresh);
    return () => window.removeEventListener("hera:refresh", onRefresh);
  }, [loadAllData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadAllData(true);
    toast.success("Dati operativi aggiornati");
  };

  // Mappe veloci
  const driverById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));

  // Calcoli Flotta
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter((v) => v.status === "available" || !v.status).length;
  const faultyVehicles = vehicles.filter((v) => v.status === "faulty");
  const maintenanceVehicles = vehicles.filter((v) => v.status === "maintenance");
  const vehicleAlertsCount = faultyVehicles.length + maintenanceVehicles.length;

  // Calcoli Autisti e Assenze
  const activeDrivers = drivers.filter((d) => d.active !== false);
  const todayAbsences = absences.filter((a) => {
    return a.start_date <= todayIso && a.end_date >= todayIso;
  });

  // Calcoli Turni di Oggi
  const todayShifts = shifts.filter((s) => Number(s.day) === dayOfWeek);
  const todayCovered = todayShifts.filter((s) => s.driver_id && s.status !== "recovered");
  const todayUncovered = todayShifts.filter((s) => !s.driver_id && s.status !== "recovered");

  // Raggruppamento Turni di Oggi per Slot
  const prestoShifts = todayShifts.filter((s) => s.slot === "presto");
  const standardShifts = todayShifts.filter((s) => s.slot === "standard");
  const pomeriggioShifts = todayShifts.filter((s) => s.slot === "pomeriggio");
  const domenicaShifts = todayShifts.filter((s) => s.slot === "domenica");

  // Calcolo Scadenze Patenti (< 30 giorni o scadute)
  const licenseAlerts = [];
  drivers.forEach((drv) => {
    (drv.licenses || []).forEach((lic) => {
      if (lic.expiry_date) {
        const diffDays = Math.ceil((new Date(lic.expiry_date) - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          licenseAlerts.push({
            driver: drv.name,
            license: lic.name,
            expiry: lic.expiry_date,
            days: diffDays,
            isExpired: diffDays < 0,
          });
        }
      }
    });
  });

  // Calcolo Reintegri Kit Medico
  const medKitRequests = [];
  drivers.forEach((drv) => {
    (drv.medical_kit || []).forEach((item) => {
      if (item.needs_replacement) {
        medKitRequests.push({
          driver: drv.name,
          driverId: drv.id,
          item: item.name,
          note: item.replacement_note,
          date: item.replacement_requested_at,
        });
      }
    });
  });

  // Scambi turno in attesa di approvazione staff
  const pendingStaffSwaps = swaps.filter((sw) => sw.status === "pending_admin" || sw.status === "pending");

  const todayFormatted = today.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-9 w-9 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Caricamento cruscotto operativo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ================= HEADER DI CONTROLLO ================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Presidio Operativo Attivo
            </span>
            <span className="text-xs text-muted-foreground capitalize font-medium">{todayFormatted}</span>
          </div>
          <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight text-foreground">
            Control Room & Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Sintesi esecutiva in tempo reale della flotta, del personale viaggiante e delle attività giornaliere.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="rounded-xl font-medium h-9 px-3 gap-1.5 text-xs shadow-2xs border-border hover:bg-secondary"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Aggiorna</span>
          </Button>

          <Button
            asChild
            size="sm"
            className="rounded-xl font-semibold h-9 px-3.5 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Link to="/turni">
              <CalendarDays size={14} />
              <span>Tabellone Turni</span>
              <ArrowRight size={13} className="opacity-80" />
            </Link>
          </Button>
        </div>
      </div>

      {/* ================= 4 MACRO INDICATORI (KPI CARDS) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Mezzi Operativi */}
        <div className="border border-border/80 bg-card rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-primary/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Efficienza Flotta</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-head font-black text-2xl sm:text-3xl text-foreground">{availableVehicles}</span>
                <span className="text-xs font-semibold text-muted-foreground">/ {totalVehicles} mezzi pronti</span>
              </div>
            </div>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
              vehicleAlertsCount === 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
            }`}>
              <Truck size={22} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            {vehicleAlertsCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                <AlertTriangle size={13} /> {vehicleAlertsCount} fermi / guasti
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} /> Tutti i mezzi disponibili
              </span>
            )}
            <Link to="/mezzi" className="text-primary hover:underline font-semibold flex items-center gap-0.5">
              Dettaglio <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* KPI 2: Autisti in Servizio Oggi */}
        <div className="border border-border/80 bg-card rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-primary/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Autisti in Servizio Oggi</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-head font-black text-2xl sm:text-3xl text-foreground">{todayCovered.length}</span>
                <span className="text-xs font-semibold text-muted-foreground">/ {todayShifts.length} turni coperti</span>
              </div>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            {todayUncovered.length > 0 ? (
              <span className="text-rose-600 font-bold flex items-center gap-1">
                <AlertTriangle size={13} /> {todayUncovered.length} turni da coprire oggi!
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} /> Nessun turno scoperto oggi
              </span>
            )}
            <Link to="/turni" className="text-primary hover:underline font-semibold flex items-center gap-0.5">
              Tabellone <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* KPI 3: Assenze Odierne */}
        <div className="border border-border/80 bg-card rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-primary/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Assenze Odierne</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-head font-black text-2xl sm:text-3xl text-foreground">{todayAbsences.length}</span>
                <span className="text-xs font-semibold text-muted-foreground">autisti assenti</span>
              </div>
            </div>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
              todayAbsences.length > 0 ? "bg-purple-500/10 text-purple-600" : "bg-slate-500/10 text-slate-600"
            }`}>
              <CalendarOff size={22} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground truncate max-w-[150px]">
              {todayAbsences.length > 0
                ? todayAbsences.map((a) => driverById[a.driver_id]?.name || "Autista").join(", ")
                : "Tutto l'organico presente"}
            </span>
            <Link to="/assenze" className="text-primary hover:underline font-semibold flex items-center gap-0.5">
              Gestisci <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* KPI 4: Scambi & Notifiche Operative */}
        <div className="border border-border/80 bg-card rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-primary/40 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Richieste Cambio Turno</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-head font-black text-2xl sm:text-3xl text-foreground">{pendingStaffSwaps.length}</span>
                <span className="text-xs font-semibold text-muted-foreground">in attesa approvazione</span>
              </div>
            </div>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
              pendingStaffSwaps.length > 0 ? "bg-amber-500/10 text-amber-600" : "bg-slate-500/10 text-slate-600"
            }`}>
              <ArrowLeftRight size={22} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            {pendingStaffSwaps.length > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                <Clock size={13} /> Richiede intervento staff
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} /> Nessuna richiesta pendente
              </span>
            )}
            <Link to="/scambi" className="text-primary hover:underline font-semibold flex items-center gap-0.5">
              Verifica <ChevronRight size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* ================= SEZIONE CENTRALE: TURNI DI OGGI ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Colonna Sinistra (2/3): Giri del Giorno suddivisi per fascia oraria */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              <h2 className="font-head font-bold text-lg tracking-tight text-foreground">
                Giri di Raccolta di Oggi
              </h2>
            </div>
            {rotation && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold border border-blue-500/20">
                  G1: {rotation.gruppo1_turno === "mattina" ? "Mattina" : "Pomeriggio"}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-400 font-semibold border border-orange-500/20">
                  G2: {rotation.gruppo2_turno === "mattina" ? "Mattina" : "Pomeriggio"}
                </span>
              </div>
            )}
          </div>

          {todayShifts.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-8 text-center bg-card">
              <CalendarDays size={32} className="mx-auto text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold text-foreground">Nessun turno programmato per la giornata odierna</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Verifica il tabellone settimanale per avviare o modificare le assegnazioni.
              </p>
              <Button asChild size="sm" variant="outline" className="rounded-xl">
                <Link to="/turni">Vai al Tabellone Turni</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Slot 1: Mattino Presto */}
              {prestoShifts.length > 0 && (
                <SlotBlock
                  title="Mattino Presto"
                  time="05:30 – 11:50"
                  icon={Sunrise}
                  iconColor="text-emerald-500"
                  badgeColor="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  shifts={prestoShifts}
                  driverById={driverById}
                  vehicleById={vehicleById}
                  routeById={routeById}
                />
              )}

              {/* Slot 2: Mattino Standard */}
              {standardShifts.length > 0 && (
                <SlotBlock
                  title="Mattino Standard"
                  time="06:00 – 12:20"
                  icon={Sun}
                  iconColor="text-blue-500"
                  badgeColor="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                  shifts={standardShifts}
                  driverById={driverById}
                  vehicleById={vehicleById}
                  routeById={routeById}
                />
              )}

              {/* Slot 3: Pomeriggio */}
              {pomeriggioShifts.length > 0 && (
                <SlotBlock
                  title="Pomeriggio"
                  time="12:30 – 18:50"
                  icon={Sunset}
                  iconColor="text-amber-500"
                  badgeColor="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                  shifts={pomeriggioShifts}
                  driverById={driverById}
                  vehicleById={vehicleById}
                  routeById={routeById}
                />
              )}

              {/* Slot 4: Domenica */}
              {domenicaShifts.length > 0 && (
                <SlotBlock
                  title="Turno Domenicale"
                  time="06:00 – 12:20"
                  icon={CalendarDays}
                  iconColor="text-purple-500"
                  badgeColor="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30"
                  shifts={domenicaShifts}
                  driverById={driverById}
                  vehicleById={vehicleById}
                  routeById={routeById}
                />
              )}
            </div>
          )}
        </div>

        {/* Colonna Destra (1/3): Alert di Sicurezza, Compliance & Officina */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-500" />
            <h2 className="font-head font-bold text-lg tracking-tight text-foreground">
              Presidio & Conformità
            </h2>
          </div>

          {/* Card Scadenze Patenti */}
          <div className="border border-border bg-card rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users size={14} className="text-primary" />
                Scadenze Patenti (30 gg)
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground">
                {licenseAlerts.length}
              </span>
            </div>

            {licenseAlerts.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-1">
                <CheckCircle2 size={15} />
                <span>Nessuna patente o CQC in scadenza</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 board-scroll">
                {licenseAlerts.map((lic, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-secondary/50 border border-border/60">
                    <div>
                      <div className="font-semibold text-foreground">{lic.driver}</div>
                      <div className="text-[11px] text-muted-foreground">Patente {lic.license}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      lic.isExpired ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    }`}>
                      {lic.isExpired ? "Scaduta!" : `${lic.days} gg rimasti`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-1">
              <Link to="/autisti" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Apri anagrafica autisti <ChevronRight size={12} />
              </Link>
            </div>
          </div>

          {/* Card Reintegri Kit Medico di Bordo */}
          <div className="border border-border bg-card rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BriefcaseMedical size={14} className="text-rose-500" />
                Reintegri Kit Medico
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground">
                {medKitRequests.length}
              </span>
            </div>

            {medKitRequests.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-1">
                <CheckCircle2 size={15} />
                <span>Tutti i kit medici di bordo completi</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 board-scroll">
                {medKitRequests.map((req, idx) => (
                  <div key={idx} className="text-xs p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{req.driver}</span>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-500/15 px-1.5 py-0.5 rounded">
                        Reintegro
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-foreground/90">Articolo: {req.item}</div>
                    {req.note && <div className="text-[10px] text-muted-foreground italic">"{req.note}"</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="pt-1">
              <Link to="/autisti" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Verifica dotazioni kit <ChevronRight size={12} />
              </Link>
            </div>
          </div>

          {/* Card Anomalie Mezzi / Fermo Officina */}
          <div className="border border-border bg-card rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Truck size={14} className="text-amber-500" />
                Segnalazioni Officina Mezzi
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground">
                {vehicleAlertsCount}
              </span>
            </div>

            {vehicleAlertsCount === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-1">
                <CheckCircle2 size={15} />
                <span>Nessun veicolo in riparazione</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 board-scroll">
                {[...faultyVehicles, ...maintenanceVehicles].map((veh) => (
                  <div key={veh.id} className="text-xs p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{veh.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        veh.status === "faulty" ? "bg-destructive/15 text-destructive" : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      }`}>
                        {veh.status === "faulty" ? "Guasto" : "Manutenzione"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">Targa: {veh.plate}</div>
                    {veh.fault_note && <div className="text-[10px] text-foreground/80 italic">"{veh.fault_note}"</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="pt-1">
              <Link to="/mezzi" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                Vai al parco mezzi <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sotto-componente per visualizzare i turni di uno slot
function SlotBlock({ title, time, icon: Icon, iconColor, badgeColor, shifts, driverById, vehicleById, routeById }) {
  return (
    <div className="border border-border/80 bg-card rounded-2xl p-4 shadow-2xs space-y-3">
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <span className="font-bold text-sm text-foreground">{title}</span>
          <span className="text-xs font-mono text-muted-foreground">({time})</span>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
          {shifts.length} {shifts.length === 1 ? "giro" : "giri"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {shifts.map((s) => {
          const drv = driverById[s.driver_id];
          const veh = vehicleById[s.vehicle_id];
          const rute = routeById[s.route_id];
          const isCovered = Boolean(drv);

          return (
            <div
              key={s.id}
              className={`p-3 rounded-xl border transition-all ${
                isCovered
                  ? "bg-secondary/40 border-border/70 hover:bg-secondary/70"
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                    <span>{rute?.name || "Giro non assegnato"}</span>
                    {rute?.code && (
                      <span className="text-[10px] font-mono bg-background/80 px-1 py-0.2 rounded border border-border/50 text-muted-foreground">
                        {rute.code}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {rute?.zone ? `Zona: ${rute.zone}` : "Servizio standard"}
                  </div>
                </div>
                {isCovered ? (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" title="Coperto" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0 mt-1 animate-ping" title="Scoperto!" />
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <Users size={13} className="text-primary shrink-0" />
                  <span className={isCovered ? "text-foreground font-semibold" : "text-destructive font-bold"}>
                    {isCovered ? drv.name : "DA ASSEGNARE"}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground shrink-0">
                  <Truck size={12} />
                  <span>{veh?.name || "Mezzo fisso"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
