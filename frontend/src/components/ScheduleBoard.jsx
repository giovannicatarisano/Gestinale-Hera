import { useState } from "react";
import { DAY_LABELS, DAY_FULL, SLOT_ORDER, initials } from "../lib/dates";
import { Clock, Users, Calendar, LayoutGrid, AlertTriangle, ArrowRight, UserCheck, UserX } from "lucide-react";

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
  const [viewMode, setViewMode] = useState("auto"); // 'auto' | 'day' | 'grid'

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
      {/* View Switcher Header (Compact & Responsive) */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-card border border-border rounded-sm p-2">
        {/* Day Selector Pills for Mobile / Tablet */}
        <div className="flex items-center gap-1 overflow-x-auto board-scroll py-0.5 max-w-full">
          {days.map((d) => {
            const count = shifts.filter((s) => s.day === d && s.driver_id).length;
            const totalDay = shifts.filter((s) => s.day === d).length;
            const isSelected = activeTab === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActiveTab(d)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span>{DAY_LABELS[d]}</span>
                {totalDay > 0 && (
                  <span className={`text-[10px] px-1 py-0.2 rounded-full font-mono ${isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
                    {count}/{totalDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Grid vs Day View Toggle */}
        <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-sm border border-border shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${
              viewMode === "day" || (viewMode === "auto" && "md:hidden")
                ? "bg-card text-foreground shadow-sm font-semibold"
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
            className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${
              viewMode === "grid" || (viewMode === "auto" && "hidden md:flex")
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Visualizza tabellone a griglia"
          >
            <LayoutGrid size={13} />
            <span className="hidden sm:inline">Tabellone</span>
          </button>
        </div>
      </div>

      {/* ================= 1. DAY CARDS VIEW (Mobile-friendly vertical cards) ================= */}
      <div className={`${viewMode === "grid" ? "hidden" : viewMode === "day" ? "block" : "block md:hidden"} space-y-4`}>
        <div className="bg-card border border-border rounded-sm p-3.5 flex items-center justify-between">
          <div>
            <div className="overline text-primary">{DAY_LABELS[activeTab]}</div>
            <h3 className="font-head font-bold text-lg">{DAY_FULL[activeTab]}</h3>
          </div>
          <div className="text-right font-mono text-xs text-muted-foreground">
            {shifts.filter((s) => s.day === activeTab && s.driver_id).length} di {shifts.filter((s) => s.day === activeTab).length} turni coperti
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
            <div key={slot} className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
              {/* Slot Header */}
              <div className="bg-secondary/40 border-b border-border px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-head font-bold text-sm">{meta.label}</span>
                  <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={11} /> {meta.time}
                  </span>
                </div>
                {meta.max && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-semibold ${overCap ? "bg-destructive text-white" : "bg-primary/10 text-primary"}`}>
                    max {meta.max} {overCap && "⚠️ Superato"}
                  </span>
                )}
              </div>

              {/* Shifts list in this slot */}
              <div className="divide-y divide-border/60 p-1">
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
                      className={`w-full text-left p-3 rounded-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        uncovered
                          ? "bg-destructive/5 hover:bg-destructive/10 border-l-4 border-l-destructive"
                          : mine
                          ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary"
                          : recovered
                          ? "bg-secondary/30 opacity-70 border-l-4 border-l-muted-foreground"
                          : "hover:bg-secondary/50 border-l-4 border-l-emerald-600"
                      }`}
                    >
                      {/* Left info: Route + Vehicle */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-card border border-border rounded-sm">
                            {route?.code || "—"}
                          </span>
                          <span className="font-semibold text-sm text-foreground">
                            {route?.name || "Giro senza nome"}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          Mezzo: <span className="font-medium text-foreground">{veh?.name || "—"}</span> ({veh?.plate || "N/D"})
                        </div>
                      </div>

                      {/* Right info: Driver assignment */}
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
                              {mine && <span className="overline text-[9px] text-primary">Il tuo turno</span>}
                              {recovered && <span className="overline text-[9px] text-muted-foreground">Sostituito</span>}
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

      {/* ================= 2. FULL MATRIX GRID VIEW (Desktop & scrollable) ================= */}
      <div className={`${viewMode === "day" ? "hidden" : viewMode === "grid" ? "block" : "hidden md:block"} board-scroll overflow-x-auto border border-border bg-card rounded-sm shadow-sm`}>
        <div className="min-w-[900px]">
          {/* Header row */}
          <div className="grid" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}>
            <div className="border-b border-r border-border p-3 bg-secondary/70">
              <span className="overline text-muted-foreground">Turno / Giorno</span>
            </div>
            {days.map((d) => (
              <div key={d} className="border-b border-r border-border p-3 bg-secondary/70 text-center">
                <div className="font-head font-bold text-sm">{DAY_FULL[d]}</div>
                <div className="overline text-muted-foreground">{DAY_LABELS[d]}</div>
              </div>
            ))}
          </div>

          {/* Slot rows */}
          {SLOT_ORDER.filter(
            (slot) => slot !== "domenica" || shifts.some((s) => s.slot === "domenica")
          ).map((slot) => {
            const meta = SLOT_META[slot];
            return (
              <div
                key={slot}
                className="grid"
                style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}
              >
                <div className="border-b border-r border-border p-3 bg-card/90">
                  <div className="font-head font-bold text-sm leading-tight">{meta.label}</div>
                  <div className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock size={11} /> {meta.time}
                  </div>
                  {meta.max && (
                    <div className="overline text-primary mt-1">max {meta.max} autisti</div>
                  )}
                </div>

                {days.map((d) => {
                  const items = cell(slot, d);
                  const driversInSlot = items.filter((s) => s.driver_id).length;
                  const overCap = meta.max && driversInSlot > meta.max;
                  return (
                    <div
                      key={d}
                      className={`border-b border-r border-border p-1.5 space-y-1.5 align-top min-h-[76px] ${
                        overCap ? "bg-destructive/10" : ""
                      }`}
                    >
                      {items.length === 0 && <div className="h-full min-h-[56px]" />}
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
                            className={`w-full text-left rounded-sm border p-2 transition-all ${
                              recovered
                                ? "border-border bg-secondary/30 opacity-60"
                                : uncovered
                                ? "border-dashed border-destructive bg-destructive/5 hover:bg-destructive/10"
                                : mine
                                ? "border-primary bg-primary/10 shadow-xs"
                                : "border-border bg-card hover:border-primary/50 shadow-xs"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[11px] font-bold truncate max-w-[80px]">
                                {route?.code || "—"}
                              </span>
                              {uncovered ? (
                                <span className="overline text-[9px] text-destructive font-bold">SCOPERTO</span>
                              ) : (
                                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[60px]">
                                  {veh?.plate}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-medium truncate mt-0.5">
                              {route?.name || "Giro"}
                            </div>
                            <div className="flex items-center gap-1 mt-1 text-[11px]">
                              {drv ? (
                                <>
                                  <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold shrink-0">
                                    {initials(drv.name)}
                                  </div>
                                  <span className={`truncate font-medium ${mine ? "text-primary font-bold" : ""}`}>
                                    {drv.name}
                                  </span>
                                </>
                              ) : (
                                <span className="text-destructive font-medium text-[10px]">Da assegnare</span>
                              )}
                            </div>
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
