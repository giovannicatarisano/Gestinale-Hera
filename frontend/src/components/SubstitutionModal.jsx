import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Check, X, UserX, Truck, Route as RouteIcon, ShieldCheck, ShieldAlert } from "lucide-react";

export default function SubstitutionModal({ shift, open, onClose, onChanged, vehicleById }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !shift) return;
    setData(null);
    setLoading(true);
    api
      .get(`/shifts/${shift.id}/substitutes`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [open, shift]);

  const assign = async (driverId) => {
    try {
      await api.patch(`/shifts/${shift.id}`, { driver_id: driverId });
      toast.success(driverId ? "Autista assegnato" : "Turno liberato");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const markAbsence = async () => {
    try {
      await api.patch(`/shifts/${shift.id}`, { status: "absence" });
      toast.warning("Assenza registrata · turno da coprire");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const route = data?.route;
  const veh = route ? vehicleById?.[route.vehicle_id] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-sm p-0 gap-0 bg-card/95 backdrop-blur-xl" data-testid="substitution-modal">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle className="font-head font-black tracking-tight text-xl">
            Sostituzione turno
          </DialogTitle>
          {route && (
            <div className="mt-2 space-y-1.5">
              <div className="text-sm font-semibold">{route.name}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="font-mono px-2 py-0.5 bg-secondary rounded-sm">{route.code}</span>
                <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 bg-secondary rounded-sm">
                  <Truck size={12} /> {veh?.name} · {veh?.plate}
                </span>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="p-5 max-h-[55vh] overflow-y-auto board-scroll">
          {shift?.driver_id && (
            <Button
              variant="outline"
              data-testid="mark-absence-btn"
              onClick={markAbsence}
              className="w-full mb-4 rounded-sm border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <UserX size={16} className="mr-2" /> Segna assenza / Libera turno
            </Button>
          )}

          <div className="overline text-muted-foreground mb-3">Sostituti suggeriti</div>

          {loading && <div className="text-sm text-muted-foreground py-6 text-center">Caricamento…</div>}

          <div className="space-y-2">
            {data?.candidates.map((c) => {
              const best = c.qualified && c.available;
              return (
                <div
                  key={c.id}
                  data-testid={`substitute-${c.id}`}
                  className={`flex items-center gap-3 border rounded-sm p-3 ${
                    best ? "border-primary/40 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="h-9 w-9 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{c.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Tag ok={c.vehicle_ok} label="Mezzo" icon={Truck} />
                      <Tag ok={c.route_ok} label="Giro" icon={RouteIcon} />
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
                          c.available ? "bg-secondary text-muted-foreground" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {c.available ? "Disponibile" : "Occupato"}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-secondary text-muted-foreground">
                        {c.week_load} turni/sett.
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    data-testid={`assign-${c.id}`}
                    disabled={!c.available}
                    onClick={() => assign(c.id)}
                    className="rounded-sm shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Check size={14} className="mr-1" /> Assegna
                  </Button>
                </div>
              );
            })}
            {data && data.candidates.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">Nessun autista disponibile.</div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end">
          <Button variant="ghost" onClick={onClose} className="rounded-sm" data-testid="close-modal-btn">
            <X size={16} className="mr-1" /> Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tag({ ok, label, icon: Icon }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
        ok ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground line-through"
      }`}
    >
      {ok ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />} <Icon size={10} /> {label}
    </span>
  );
}
