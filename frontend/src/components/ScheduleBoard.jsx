import { DAY_LABELS, DAY_FULL, SLOT_ORDER, initials } from "../lib/dates";
import { AlertTriangle, Clock, Lock, RotateCcw } from "lucide-react";

const SLOT_META = {
  presto: { label: "Mattino Presto", time: "05:30 – 11:50", max: 3 },
  standard: { label: "Mattino Standard", time: "06:00 – 12:20", max: null },
  pomeriggio: { label: "Pomeriggio", time: "12:30 – 18:50", max: null },
  domenica: { label: "Turno Domenica", time: "06:00 – 12:20", max: 3 },
};

export default function ScheduleBoard({
  shifts,
  routes,
  vehicles,
  drivers,
  editable = false,
  onCellClick,
  highlightDriverId,
}) {
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
    <div className="board-scroll overflow-x-auto border border-border bg-card rounded-sm">
      <div className="min-w-[900px]">
        {/* header row */}
        <div className="grid" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}>
          <div className="border-b border-r border-border p-3 bg-secondary/60">
            <span className="overline text-muted-foreground">Turno / Giorno</span>
          </div>
          {days.map((d) => (
            <div key={d} className="border-b border-r border-border p-3 bg-secondary/60 text-center">
              <div className="font-head font-bold text-sm">{DAY_FULL[d]}</div>
              <div className="overline text-muted-foreground">{DAY_LABELS[d]}</div>
            </div>
          ))}
        </div>

        {/* slot rows */}
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
              <div className="border-b border-r border-border p-3 bg-card">
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
                    className={`border-b border-r border-border p-1.5 space-y-1.5 align-top min-h-[70px] ${
                      overCap ? "bg-destructive/10" : ""
                    }`}
                  >
                    {items.length === 0 && <div className="h-full min-h-[52px]" />}
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
                          className={`w-full text-left rounded-sm border p-2 transition-colors duration-150 ${
                            recovered
                              ? "border-border bg-secondary/30 opacity-60"
                              : uncovered
                              ? "border-dashed border-destructive bg-destructive/5 hover:bg-destructive/10"
                              : mine
                              ? "border-primary bg-primary/10"
                              : "border-border bg-secondary/40 hover:bg-secondary"
                          } ${editable ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[10px] font-semibold text-muted-foreground truncate flex items-center gap-1">
                              {s.pinned && <Lock size={9} className="text-primary shrink-0" />}
                              {s.recovery && <RotateCcw size={9} className="text-primary shrink-0" />}
                              {route?.code}
                            </span>
                            {veh && (
                              <span className="font-mono text-[9px] px-1 py-0.5 bg-background border border-border rounded-sm text-muted-foreground shrink-0">
                                {veh.plate}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium leading-tight mt-0.5 truncate">
                            {route?.name}
                          </div>
                          <div className="mt-1.5">
                            {recovered ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                                <RotateCcw size={11} /> RIPROGRAMMATO
                              </span>
                            ) : uncovered ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
                                <AlertTriangle size={11} /> SCOPERTO · DA RECUPERARE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-4 w-4 rounded-sm bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                                  {initials(drv?.name || "?")}
                                </span>
                                <span className="text-[11px] font-semibold truncate">{drv?.name}</span>
                              </span>
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
  );
}
