import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { weekKey, weekLabel, shiftWeek } from "../lib/dates";
import ScheduleBoard from "../components/ScheduleBoard";
import SubstitutionModal from "../components/SubstitutionModal";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2, AlertTriangle, CalendarDays, Printer, UsersRound, Sun, Sunset, ChevronDown, FileText, Maximize2 } from "lucide-react";

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

  const handlePrint = (format = "A4") => {
    // Rimuove eventuali stili dinamici di stampa precedenti
    const existingStyle = document.getElementById("hera-print-page-style");
    if (existingStyle) existingStyle.remove();

    // Inietta dinamicamente la regola @page per il formato scelto
    const style = document.createElement("style");
    style.id = "hera-print-page-style";
    const margin = format === "A2" ? "14mm" : "6mm";
    style.textContent = `@media print { @page { size: ${format} landscape; margin: ${margin}; } }`;
    document.head.appendChild(style);

    // Imposta l'attributo per applicare le classi CSS corrispondenti
    document.body.setAttribute("data-print-size", format);

    // Avvia la finestra di stampa
    window.print();

    // Pulizia post-stampa
    const cleanup = () => {
      document.body.removeAttribute("data-print-size");
      const s = document.getElementById("hera-print-page-style");
      if (s) s.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 2500);
  };

  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const total = shifts.length;
  const covered = shifts.filter((s) => s.driver_id).length;
  const uncovered = total - covered;

  return (
    <div className="space-y-5">
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <div className="overline text-primary mb-0.5">Pianificazione settimanale</div>
          <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter">Tabellone turni</h1>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="print-board-btn"
                variant="outline"
                disabled={total === 0}
                className="rounded-xl font-semibold h-10 px-3.5 text-xs sm:text-sm flex-1 sm:flex-initial border-border shadow-2xs hover:bg-secondary gap-1.5"
                title="Stampa o esporta in formato PDF"
              >
                <Printer size={16} />
                <span>Stampa / PDF</span>
                <ChevronDown size={13} className="opacity-60 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1.5 rounded-2xl border-border bg-card shadow-lg z-50">
              <DropdownMenuItem
                data-testid="print-a4-btn"
                onClick={() => handlePrint("A4")}
                className="flex flex-col items-start gap-1 p-2.5 rounded-xl cursor-pointer hover:bg-secondary focus:bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-foreground">
                    <FileText size={15} className="text-primary" />
                    <span>Formato A4 Orizzontale</span>
                  </div>
                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.2 rounded font-mono font-bold">Standard</span>
                </div>
                <p className="text-[11px] text-muted-foreground pl-6 leading-tight">
                  Ottimizzato per foglio singolo da ufficio, bacheca e PDF
                </p>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                data-testid="print-a2-btn"
                onClick={() => handlePrint("A2")}
                className="flex flex-col items-start gap-1 p-2.5 rounded-xl cursor-pointer hover:bg-secondary focus:bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-foreground">
                    <Maximize2 size={15} className="text-blue-600" />
                    <span>Formato A2 / Poster</span>
                  </div>
                  <span className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-400 px-1.5 py-0.2 rounded font-mono font-bold">Murale</span>
                </div>
                <p className="text-[11px] text-muted-foreground pl-6 leading-tight">
                  Ingrandito per tabelloni grandi da officina e plotter
                </p>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            data-testid="generate-shifts-btn"
            onClick={generate}
            disabled={generating}
            className="rounded-xl bg-primary hover:bg-primary/90 font-semibold h-10 px-4 text-xs sm:text-sm shadow-sm flex-1 sm:flex-initial"
          >
            <Sparkles size={16} className={`mr-1.5 ${generating ? "animate-pulse" : ""}`} />
            {generating ? "Generazione…" : "Genera Turni"}
          </Button>
        </div>
      </div>

      {/* Controlli settimana e statistiche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 no-print">
        <div className="sm:col-span-2 border border-border bg-card rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all">
          <button
            data-testid="prev-week-btn"
            onClick={() => setRef(shiftWeek(ref, -1))}
            className="h-10 w-10 flex items-center justify-center border border-border rounded-xl hover:bg-secondary hover:border-foreground/40 transition-colors duration-150 shadow-2xs"
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
            className="h-10 w-10 flex items-center justify-center border border-border rounded-xl hover:bg-secondary hover:border-foreground/40 transition-colors duration-150 shadow-2xs"
            title="Settimana successiva"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <Stat icon={CheckCircle2} label="Turni coperti" value={covered} total={total} tone="ok" tid="stat-covered" />
        <Stat icon={AlertTriangle} label="Turni scoperti" value={uncovered} total={total} tone={uncovered ? "bad" : "ok"} tid="stat-uncovered" />
      </div>

      {/* Pannello informativo rotazione gruppi */}
      {rotation && (rotation.gruppo1_turno || rotation.gruppo2_turno) && (
        <div className="flex flex-wrap gap-2 items-center no-print">
          <span className="overline text-[10px] text-muted-foreground">Rotazione questa settimana:</span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border shadow-2xs ${
            rotation.gruppo1_turno === "mattina"
              ? "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400"
              : "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400"
          }`}>
            <UsersRound size={12} />
            G1 · {rotation.gruppo1_turno === "mattina" ? "☀️ Mattina" : "🌆 Pomeriggio"}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border shadow-2xs ${
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
          <div className="print-only mb-3 border-b-2 border-slate-900 pb-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xl tracking-tighter shrink-0">
                  H
                </div>
                <div>
                  <div className="font-head font-black text-lg sm:text-xl text-slate-900 leading-tight print-header-title">
                    HERA S.p.A. · Gestione Operativa Turni & Flotta
                  </div>
                  <div className="text-xs text-slate-600 font-medium print-header-sub">
                    Presidio Servizi Ambientali · Pianificazione Settimanale
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-slate-700">
                <div className="font-bold text-sm text-slate-900">
                  Settimana: {weekLabel(ref)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Copertura: <strong className="text-slate-900">{covered}/{total}</strong> turni ({total > 0 ? Math.round((covered / total) * 100) : 0}%)
                </div>
                <div className="text-[10px] text-slate-400">
                  Generato il {new Date().toLocaleDateString("it-IT")} alle {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
            {rotation && (rotation.gruppo1_turno || rotation.gruppo2_turno) && (
              <div className="flex items-center gap-4 mt-2 pt-1.5 border-t border-slate-200 text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Rotazione:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                  <strong>Gruppo 1:</strong> {rotation.gruppo1_turno === "mattina" ? "Mattina (06:00)" : "Pomeriggio (12:30)"}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                  <strong>Gruppo 2:</strong> {rotation.gruppo2_turno === "mattina" ? "Mattina (06:00)" : "Pomeriggio (12:30)"}
                </span>
                <span className="ml-auto text-[10px] text-slate-500 italic">
                  Documento operativo interno conforme alla pianificazione del personale viaggiante.
                </span>
              </div>
            )}
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
    <div className="border border-border bg-card rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-foreground/30 transition-all" data-testid={tid}>
      <div className="flex items-center gap-2 overline text-muted-foreground text-[10px]">
        <div className={`p-1.5 rounded-lg shrink-0 ${tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon size={14} />
        </div>
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-head font-black text-3xl tracking-tighter ${tone === "bad" ? "text-destructive" : "text-foreground"}`}>
          {value}
        </span>
        <span className="text-sm text-muted-foreground font-mono">/ {total}</span>
      </div>
    </div>
  );
}
