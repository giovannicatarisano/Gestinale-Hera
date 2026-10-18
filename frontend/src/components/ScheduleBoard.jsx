import { useState } from "react";
import { DAY_LABELS, DAY_FULL, SLOT_ORDER, initials } from "../lib/dates";
import { Clock, Users, Calendar, LayoutGrid, AlertTriangle, ArrowRight, UserCheck, UserX, Award, BriefcaseMedical, CheckCircle2, RotateCw, History } from "lucide-react";
import { getLicenseStatus, getLicensesSummary, getMedicalKitSummary } from "../pages/Drivers";

const SLOT_META = {
  presto: { label: "Mattino Presto", time: "05:30 – 11:50", max: 3, color: "border-blue-500/30 bg-blue-500/5 text-blue-700" },
  standard: { label: "Mattino Standard", time: "06:00 – 12:20", max: null, color: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" },
  pomeriggio: { label: "Pomeriggio", time: "12:30 – 18:50", max: null, color: "border-amber-500/30 bg-amber-500/5 text-amber-700" },
  domenica: { label: "Turno Domenica", time: "06:00 – 12:20", max: 3, color: "border-purple-500/30 bg-purple-500/5 text-purple-700" },
};

export default function ScheduleBoard({
  shifts = [],
  routes = [],
  vehicles = [],
  drivers = [],
  editable = false,
  onCellClick,
  highlightDriverId,
}) {
  const [activeTab, setActiveTab] = useState(0); // 0 = Lunedi, etc.
  const [viewMode, setViewMode] = useState("auto"); // Modalità di visualizzazione: 'auto' | 'day' | 'grid'

  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const driverById = Object.fromEntries(drivers.map((d) => [d.id, d]));

  const daySet = new Set();
  routes.forEach((r) => (r.days || []).forEach((d) => daySet.add(d)));
  shifts.forEach((s) => daySet.add(s.day));
  const days = Array.from(daySet).sort((a, b) => a - b);
  if (days.length === 0) [0, 1, 2, 3, 4, 5].forEach((d) => days.push(d));

  const cell = (slot, day) => shifts.filter((s) => s.slot === slot && s.day === day);

  return (
    <div className="space-y-4">
      {/* Intestazione selettore visualizzazione (Compatta e reattiva) */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-card border border-border rounded-2xl p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] no-print">
        {/* Selettore pillole dei giorni per smartphone e tablet */}
        <div className="flex items-center gap-1.5 overflow-x-auto board-scroll py-0.5 max-w-full">
          {days.map((d) => {
            const count = shifts.filter((s) => s.day === d && s.driver_id).length;
            const totalDay = shifts.filter((s) => s.day === d).length;
            const isSelected = activeTab === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActiveTab(d)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span>{DAY_LABELS[d]}</span>
                {totalDay > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
                    {count}/{totalDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pulsanti di commutazione tra vista giornaliera e matrice completa */}
        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border shrink-0 ml-auto shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "day" || (viewMode === "auto" && "md:hidden")
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Visualizza giorno singolo"
          >
            <Calendar size={13} />
            <span className="hidden sm:inline">Giorno</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "grid" || (viewMode === "auto" && "hidden md:flex")
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Visualizza tabellone a griglia"
          >
            <LayoutGrid size={13} />
            <span className="hidden sm:inline">Tabellone</span>
          </button>
        </div>
      </div>

      {/* ================= 1. VISTA SCHEDE GIORNALIERE (Ottimizzata per smartphone) ================= */}
      <div className={`schedule-day-view ${viewMode === "grid" ? "hidden" : viewMode === "day" ? "block" : "block md:hidden"} space-y-4`}>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div>
            <div className="overline text-primary">{DAY_LABELS[activeTab]}</div>
            <h3 className="font-head font-bold text-lg sm:text-xl text-foreground">{DAY_FULL[activeTab]}</h3>
          </div>
          <div className="text-right font-mono text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{shifts.filter((s) => s.day === activeTab && s.driver_id).length}</span> di {shifts.filter((s) => s.day === activeTab).length} turni coperti
          </div>
        </div>

        {SLOT_ORDER.filter(
          (slot) => slot !== "domenica" || shifts.some((s) => s.slot === "domenica" && s.day === activeTab)
        ).map((slot) => {
          const meta = SLOT_META[slot];
          const items = cell(slot, activeTab);
          if (items.length === 0) return null;

          const driversInSlot = items.filter((s) => s.driver_id).length;
          const overCap = meta.max && driversInSlot > meta.max;

          return (
            <div key={slot} className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all">
              {/* Intestazione fascia oraria */}
              <div className="bg-secondary/40 border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-head font-bold text-sm text-foreground">{meta.label}</span>
                  <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={11} /> {meta.time}
                  </span>
                </div>
                {meta.max && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${overCap ? "bg-destructive text-white border-destructive" : "bg-primary/10 text-primary border-primary/20"}`}>
                    max {meta.max} {overCap && "⚠️ Superato"}
                  </span>
                )}
              </div>

              {/* Elenco turni per questa fascia oraria */}
              <div className="p-2.5 space-y-2">
                {items.map((s) => {
                  const route = routeById[s.route_id];
                  const veh = vehicleById[s.vehicle_id];
                  const drv = s.driver_id ? driverById[s.driver_id] : null;
                  const uncovered = !s.driver_id;
                  const mine = highlightDriverId && s.driver_id === highlightDriverId;
                  const recovered = s.status === "recovered";

                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!editable}
                      onClick={() => editable && onCellClick?.(s)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 ${
                        uncovered
                          ? "bg-destructive/5 hover:bg-destructive/10 border-destructive/50 border-l-4 border-l-destructive"
                          : mine
                          ? "bg-primary/10 hover:bg-primary/15 border-primary/50 border-l-4 border-l-primary"
                          : recovered
                          ? "bg-secondary/30 opacity-70 border-border border-l-4 border-l-muted-foreground"
                          : "bg-card hover:bg-secondary/40 border-border hover:border-foreground/40 border-l-4 border-l-emerald-600"
                      }`}
                    >
                      {/* Informazioni giro e mezzo */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-secondary border border-border rounded-lg shadow-2xs">
                            {route?.code || "—"}
                          </span>
                          <span className="font-semibold text-sm text-foreground">
                            {route?.name || "Giro senza nome"}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          Mezzo: <span className="font-medium text-foreground">{veh?.name || "—"}</span> ({veh?.plate || "N/D"})
                        </div>
                        {s.last_modified_by && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-xs w-fit mt-1">
                            <History size={11} className="shrink-0 text-amber-600" />
                            <span>
                              Modificato da: <strong className="font-semibold">{s.last_modified_by}</strong> ({s.last_modified_role === 'assistant' ? 'Assistente' : 'Admin'})
                            </span>
                            {s.last_modified_at && (
                              <span className="font-mono text-[9px] text-muted-foreground ml-1">
                                {new Date(s.last_modified_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Informazioni autista assegnato */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        {uncovered ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                            <UserX size={15} />
                            <span>NON ASSEGNATO</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className={`h-7 w-7 rounded-sm flex items-center justify-center font-head font-bold text-xs shadow-xs ${
                              drv?.group === "gruppo1" ? "bg-blue-500 text-white" :
                              drv?.group === "gruppo2" ? "bg-orange-500 text-white" :
                              "bg-primary text-primary-foreground"
                            }`}>
                              {initials(drv?.name || "?")}
                            </div>
                            <div className="text-right sm:text-left">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-foreground">{drv?.name}</span>
                                {drv?.group && (
                                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded-sm ${
                                    drv.group === "gruppo1"
                                      ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                                      : "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                                  }`}>
                                    {drv.group === "gruppo1" ? "G1" : "G2"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-end sm:justify-start">
                                {drv?.licenses && drv.licenses.length > 0 && (() => {
                                  const licSt = getLicensesSummary(drv.licenses);
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.2 rounded-xs border ${licSt.color}`}
                                      title={`Patenti autista: ${licSt.label}`}
                                    >
                                      <Award size={10} className="shrink-0" />
                                      <span>{licSt.label}</span>
                                    </span>
                                  );
                                })()}
                                {drv?.medical_kit && drv.medical_kit.length > 0 && (() => {
                                  const medSt = getMedicalKitSummary(drv.medical_kit);
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.2 rounded-xs border ${medSt.color}`}
                                      title={`Kit Medico: ${medSt.label}`}
                                    >
                                      {medSt.replacementNeeded > 0 ? (
                                        <RotateCw size={10} className="shrink-0 animate-spin text-purple-600" />
                                      ) : (
                                        <BriefcaseMedical size={10} className="shrink-0" />
                                      )}
                                      <span>Kit {medSt.label}</span>
                                    </span>
                                  );
                                })()}
                              </div>
                              {mine && <span className="overline text-[9px] text-primary">Il tuo turno</span>}
                              {recovered && <span className="overline text-[9px] text-muted-foreground">Sostituito</span>}
                              {s.last_modified_by && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground font-mono"
                                  title={`Ultima modifica: ${s.last_modified_by} (${s.last_modified_role === 'assistant' ? 'Assistente' : 'Admin'})${s.last_modified_at ? ' - ' + new Date(s.last_modified_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}`}
                                >
                                  <Clock size={8} /> Mod. {s.last_modified_by.split('@')[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {editable && (
                          <div className="text-xs text-primary font-semibold flex items-center gap-1 opacity-80 group-hover:opacity-100">
                            <span>Modifica</span>
                            <ArrowRight size={12} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= 2. MATRICE COMPLETA A GRIGLIA (Desktop e schermi estesi) ================= */}
      <div className={`schedule-grid-view ${viewMode === "day" ? "hidden" : viewMode === "grid" ? "block" : "hidden md:block"} board-scroll overflow-x-auto border border-border bg-card rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]`}>
        <div className="min-w-[900px] print:min-w-0">
          {/* Riga di intestazione */}
          <div className="grid grid-row-header" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}>
            <div className="border-b border-r border-border p-3 bg-secondary/70 print-header-cell">
              <span className="overline text-muted-foreground print-slot-title">Turno / Giorno</span>
            </div>
            {days.map((d) => (
              <div key={d} className="border-b border-r border-border p-3 bg-secondary/70 text-center print-header-cell">
                <div className="font-head font-bold text-sm text-foreground print-day-title">{DAY_FULL[d]}</div>
                <div className="overline text-muted-foreground print-day-sub">{DAY_LABELS[d]}</div>
              </div>
            ))}
          </div>

          {/* Righe delle fasce orarie */}
          {SLOT_ORDER.filter(
            (slot) => slot !== "domenica" || shifts.some((s) => s.slot === "domenica")
          ).map((slot) => {
            const meta = SLOT_META[slot];
            return (
              <div
                key={slot}
                className="grid grid-row-slot"
                style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}
              >
                <div className="border-b border-r border-border p-3 bg-card/90 print-slot-meta">
                  <div className="font-head font-bold text-sm leading-tight text-foreground print-slot-title">{meta.label}</div>
                  <div className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-1 print-slot-time">
                    <Clock size={11} className="print:hidden" /> {meta.time}
                  </div>
                  {meta.max && (
                    <div className="overline text-primary mt-1 font-semibold print-slot-max">max {meta.max} autisti</div>
                  )}
                </div>

                {days.map((d) => {
                  const items = cell(slot, d);
                  const driversInSlot = items.filter((s) => s.driver_id).length;
                  const overCap = meta.max && driversInSlot > meta.max;
                  return (
                    <div
                      key={d}
                      className={`border-b border-r border-border p-2 space-y-1.5 align-top min-h-[76px] print-slot-cell ${
                        overCap ? "bg-destructive/10" : ""
                      }`}
                    >
                      {items.length === 0 && <div className="h-full min-h-[56px] print-empty-slot" />}
                      {items.map((s) => {
                        const route = routeById[s.route_id];
                        const veh = vehicleById[s.vehicle_id];
                        const drv = s.driver_id ? driverById[s.driver_id] : null;
                        const uncovered = !s.driver_id;
                        const mine = highlightDriverId && s.driver_id === highlightDriverId;
                        const recovered = s.status === "recovered";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            data-testid={`shift-${s.id}`}
                            disabled={!editable}
                            onClick={() => editable && onCellClick?.(s)}
                            className={`w-full text-left rounded-xl border p-2.5 transition-all duration-150 print-shift-card ${
                              recovered
                                ? "border-border bg-secondary/30 opacity-60"
                                : uncovered
                                ? "border-dashed border-destructive/80 bg-destructive/5 hover:bg-destructive/10 shadow-2xs print-uncovered-card"
                                : mine
                                ? "border-primary/80 bg-primary/10 shadow-2xs hover:shadow-xs"
                                : "border-border bg-card hover:border-foreground/40 shadow-2xs hover:shadow-xs hover:-translate-y-0.5"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 print-shift-top">
                              <span className="font-mono text-[11px] font-bold truncate max-w-[80px] print-shift-code">
                                {route?.code || "—"}
                              </span>
                              {uncovered ? (
                                <span className="overline text-[9px] text-destructive font-bold print-uncovered-badge">SCOPERTO</span>
                              ) : (
                                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[60px] print-shift-plate">
                                  {veh?.plate}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-medium truncate mt-0.5 print-shift-name">
                              {route?.name || "Giro"}
                            </div>
                            <div className="flex items-center gap-1 mt-1 text-[11px] print-driver-row">
                              {drv ? (
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold shrink-0 print-driver-avatar">
                                      {initials(drv.name)}
                                    </div>
                                    <span className={`truncate font-medium print-driver-name ${mine ? "text-primary font-bold" : ""}`}>
                                      {drv.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {drv?.licenses && drv.licenses.length > 0 && (() => {
                                      const licSt = getLicensesSummary(drv.licenses);
                                      return (
                                        <span
                                          className={`inline-flex items-center gap-0.5 text-[8px] font-semibold px-1 py-0 rounded-xs border ${licSt.color}`}
                                          title={`Patenti autista: ${licSt.label}`}
                                        >
                                          <Award size={8} />
                                          <span>{licSt.shortLabel}</span>
                                        </span>
                                      );
                                    })()}
                                    {drv?.medical_kit && drv.medical_kit.length > 0 && (() => {
                                      const medSt = getMedicalKitSummary(drv.medical_kit);
                                      return (
                                        <span
                                          className={`inline-flex items-center gap-0.5 text-[8px] font-semibold px-1 py-0 rounded-xs border ${medSt.color}`}
                                          title={`Kit Medico in dotazione: ${medSt.label} (${drv.medical_kit.length} presidi)`}
                                        >
                                          <BriefcaseMedical size={8} />
                                          <span>Kit</span>
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-destructive font-medium text-[10px]">Da assegnare</span>
                              )}
                            </div>
                            {s.last_modified_by && (
                              <div
                                className="text-[9px] font-mono text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/25 px-1 py-0.5 rounded-xs truncate mt-1 flex items-center gap-1 font-semibold"
                                title={`Ultima modifica: ${s.last_modified_by} (${s.last_modified_role === 'assistant' ? 'Assistente' : 'Admin'})${s.last_modified_at ? ' - ' + new Date(s.last_modified_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}`}
                              >
                                <History size={9} className="shrink-0 text-amber-600" />
                                <span className="truncate">Mod: {s.last_modified_by.split('@')[0]}</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
