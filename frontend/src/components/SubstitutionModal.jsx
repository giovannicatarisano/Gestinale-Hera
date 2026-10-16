import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Check, X, UserX, Truck, Route as RouteIcon, ShieldCheck, ShieldAlert, RotateCcw, History, Clock } from "lucide-react";

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

  const recover = async () => {
    try {
      const { data } = await api.post(`/shifts/${shift.id}/recover`);
      toast.success(
        data.driver_id ? "Giro riprogrammato e assegnato al giorno successivo" : "Giro riprogrammato · da coprire"
      );
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
      <DialogContent className="w-[94vw] sm:max-w-lg rounded-sm p-0 gap-0 bg-card/95 backdrop-blur-xl max-h-[88vh] flex flex-col" data-testid="substitution-modal">
        <DialogHeader className="p-4 sm:p-5 border-b border-border shrink-0">
          <DialogTitle className="font-head font-black tracking-tight text-lg sm:text-xl">
            Sostituzione turno
          </DialogTitle>
          <DialogDescription className="sr-only">
            Seleziona un autista sostituto disponibile e abilitato per questo turno.
          </DialogDescription>
          {route && (
            <div className="mt-2 space-y-1.5">
              <div className="text-sm font-semibold">{route.name}</div>
              <div className="flex flex-wrap gap-2 text-xs items-center">
                <span className="font-mono px-2 py-0.5 bg-secondary rounded-sm">{route.code}</span>
                <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 bg-secondary rounded-sm">
                  <Truck size={12} /> {veh?.name} · {veh?.plate}
                </span>
                {veh?.status && veh.status !== "available" && (
                  <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 bg-destructive/15 text-destructive rounded-sm border border-destructive/30 text-[11px]">
                    <ShieldAlert size={12} /> {veh.status === "faulty" ? "MEZZO IN GUASTO" : "IN MANUTENZIONE"}
                    {veh.fault_note && ` (${veh.fault_note})`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Box Tracciabilità e Autore */}
          {(shift?.last_modified_by || shift?.created_by) && (
            <div className="mt-2.5 p-2 rounded-sm bg-secondary/50 border border-border text-[11px] flex items-start gap-2">
              <History size={13} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {shift.last_modified_by ? (
                  <div>
                    <span className="font-semibold text-foreground">Ultima modifica:</span>{" "}
                    <span>{shift.last_modified_by}</span>{" "}
                    <span className="px-1 py-0.2 rounded-xs bg-primary/10 text-primary font-semibold text-[10px]">
                      {shift.last_modified_role === "assistant" ? "Assistente" : "Admin"}
                    </span>
                    {shift.last_modified_at && (
                      <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                        {new Date(shift.last_modified_at).toLocaleString("it-IT", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold text-foreground">Creato da:</span>{" "}
                    <span>{shift.created_by}</span>{" "}
                    <span className="px-1 py-0.2 rounded-xs bg-secondary text-muted-foreground font-semibold text-[10px]">
                      {shift.created_by_role === "assistant" ? "Assistente" : "Admin"}
                    </span>
                    {shift.created_at && (
                      <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                        {new Date(shift.created_at).toLocaleString("it-IT", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    )}
                  </div>
                )}
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

          {!shift?.driver_id && shift?.status !== "recovered" && (
            <Button
              variant="outline"
              data-testid="recover-btn"
              onClick={recover}
              className="w-full mb-4 rounded-sm border-primary/50 text-primary hover:bg-primary/10"
            >
              <RotateCcw size={16} className="mr-2" /> Recupera al giorno successivo
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
                        {c.absent ? "Assente" : c.available ? "Disponibile" : "Occupato"}
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

          {/* Registro Storico Modifiche */}
          {shift?.history && shift.history.length > 0 && (
            <div className="mt-5 pt-3 border-t border-border">
              <div className="overline text-[10px] text-muted-foreground flex items-center gap-1.5 mb-2">
                <History size={11} className="text-primary" /> Cronologia Modifiche / Audit Trail
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto board-scroll">
                {shift.history.slice().reverse().map((h, idx) => (
                  <div key={idx} className="text-[10px] p-2 rounded-sm bg-secondary/30 border border-border/40 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">{h.by}</span>
                        <span className="px-1 py-0.2 rounded-xs bg-secondary text-muted-foreground font-semibold text-[9px]">
                          {h.role === "assistant" ? "Assistente" : "Admin"}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">{h.detail}</div>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0 text-[9px]">
                      {new Date(h.at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}{" "}
                      {new Date(h.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
