import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { weekKey, weekLabel, shiftWeek } from "../lib/dates";
import ScheduleBoard from "../components/ScheduleBoard";
import SubstitutionModal from "../components/SubstitutionModal";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2, AlertTriangle, CalendarDays, Printer, UsersRound, Sun, Sunset } from "lucide-react";

export default function Dashboard() {
  const [ref, setRef] = useState(new Date());
  const [shifts, setShifts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [rotation, setRotation] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const wk = weekKey(ref);

  const loadBase = useCallback(async () => {
    const [r, v, d] = await Promise.all([api.get("/routes"), api.get("/vehicles"), api.get("/drivers")]);
    setRoutes(r.data);
    setVehicles(v.data);
    setDrivers(d.data);
  }, []);

  const loadShifts = useCallback(async () => {
    const { data } = await api.get(`/shifts?week_start=${wk}`);
    setShifts(data);
  }, [wk]);

  const loadRotation = useCallback(async () => {
    try {
      const { data } = await api.get(`/rotation?week_start=${wk}`);
      setRotation(data);
    } catch { setRotation(null); }
  }, [wk]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => {
    loadShifts();
    loadRotation();
  }, [loadShifts, loadRotation]);

  // Refresh listener
  useEffect(() => {
    const onRefresh = () => { loadShifts(); loadRotation(); };
    window.addEventListener("hera:refresh", onRefresh);
    return () => window.removeEventListener("hera:refresh", onRefresh);
  }, [loadShifts, loadRotation]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/shifts/generate", { week_start: wk });
      await loadShifts();
      const unassigned = data.unassigned_drivers || [];
      toast.success(`Turni generati: ${data.covered}/${data.total} coperti`, {
        description:
          (data.uncovered ? `${data.uncovered} turni scoperti. ` : "Copertura completa. ") +
          (unassigned.length ? `Senza turni: ${unassigned.join(", ")}` : "Ogni autista ha un turno assegnato."),
      });
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setGenerating(false);
    }
  };

  const openCell = (shift) => {
    setSelected(shift);
    setModalOpen(true);
  };

  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const total = shifts.length;
  const covered = shifts.filter((s) => s.driver_id).length;
  const uncovered = total - covered;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <div className="overline text-primary mb-0.5">Pianificazione settimanale</div>
          <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter">Tabellone turni</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="print-board-btn"
            onClick={() => window.print()}
            variant="outline"
            disabled={total === 0}
            className="rounded-sm font-semibold h-10 px-3.5 text-xs sm:text-sm flex-1 sm:flex-initial"
          >
            <Printer size={16} className="mr-1.5" /> Stampa / PDF
          </Button>
          <Button
            data-testid="generate-shifts-btn"
            onClick={generate}
            disabled={generating}
            className="rounded-sm bg-primary hover:bg-primary/90 font-semibold h-10 px-4 text-xs sm:text-sm shadow-sm flex-1 sm:flex-initial"
          >
            <Sparkles size={16} className={`mr-1.5 ${generating ? "animate-pulse" : ""}`} />
            {generating ? "Generazione…" : "Genera Turni"}
          </Button>
        </div>
      </div>

      {/* controls + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 no-print">
        <div className="sm:col-span-2 border border-border bg-card rounded-sm p-3 flex items-center justify-between shadow-xs">
          <button
            data-testid="prev-week-btn"
            onClick={() => setRef(shiftWeek(ref, -1))}
            className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150"
            title="Settimana precedente"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center px-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={13} /> <span className="overline text-[10px]">Settimana</span>
            </div>
            <div className="font-head font-bold text-sm sm:text-base mt-0.5" data-testid="week-label">{weekLabel(ref)}</div>
          </div>
          <button
            data-testid="next-week-btn"
            onClick={() => setRef(shiftWeek(ref, 1))}
            className="h-9 w-9 flex items-center justify-center border border-border rounded-sm hover:bg-secondary transition-colors duration-150"
            title="Settimana successiva"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <Stat icon={CheckCircle2} label="Turni coperti" value={covered} total={total} tone="ok" tid="stat-covered" />
        <Stat icon={AlertTriangle} label="Turni scoperti" value={uncovered} total={total} tone={uncovered ? "bad" : "ok"} tid="stat-uncovered" />
      </div>

      {/* Group rotation info panel */}
      {rotation && (rotation.gruppo1_turno || rotation.gruppo2_turno) && (
        <div className="flex flex-wrap gap-2 items-center no-print">
          <span className="overline text-[10px] text-muted-foreground">Rotazione questa settimana:</span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-sm border ${
            rotation.gruppo1_turno === "mattina"
              ? "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400"
              : "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400"
          }`}>
            <UsersRound size={12} />
            G1 · {rotation.gruppo1_turno === "mattina" ? "☀️ Mattina" : "🌆 Pomeriggio"}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-sm border ${
            rotation.gruppo2_turno === "mattina"
              ? "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400"
              : "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400"
          }`}>
            <UsersRound size={12} />
            G2 · {rotation.gruppo2_turno === "mattina" ? "☀️ Mattina" : "🌆 Pomeriggio"}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">(si alternano ogni settimana)</span>
        </div>
      )}

      {total === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-12 text-center bg-card">
          <Sparkles size={28} className="mx-auto text-primary mb-3" />
          <div className="font-head font-bold text-lg">Nessun turno per questa settimana</div>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Avvia il motore di assegnazione automatica per pianificare i giri di raccolta.
          </p>
          <Button data-testid="generate-empty-btn" onClick={generate} disabled={generating} className="rounded-sm bg-primary hover:bg-primary/90 font-semibold">
            <Sparkles size={16} className="mr-2" /> Genera Turni
          </Button>
        </div>
      ) : (
        <div className="print-area">
          <div className="print-only mb-3">
            <div className="font-head font-black text-xl">Hera · Tabellone Turni Flotta</div>
            <div className="font-mono text-sm">Settimana {weekLabel(ref)}</div>
          </div>
          <ScheduleBoard
            shifts={shifts}
            routes={routes}
            vehicles={vehicles}
            drivers={drivers}
            editable
            onCellClick={openCell}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground no-print">
        Clicca su un turno per sostituire l'autista, gestire un'assenza o coprire un turno scoperto.
      </p>

      <SubstitutionModal
        shift={selected}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChanged={loadShifts}
        vehicleById={vehicleById}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value, total, tone, tid }) {
  return (
    <div className="border border-border bg-card rounded-sm p-3" data-testid={tid}>
      <div className="flex items-center gap-1.5 overline text-muted-foreground">
        <Icon size={13} className={tone === "bad" ? "text-destructive" : "text-primary"} /> {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-head font-black text-3xl tracking-tighter ${tone === "bad" ? "text-destructive" : "text-foreground"}`}>
          {value}
        </span>
        <span className="text-sm text-muted-foreground font-mono">/ {total}</span>
      </div>
    </div>
  );
}
