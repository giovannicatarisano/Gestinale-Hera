import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { Header, Field } from "./Drivers";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Truck, AlertTriangle, CheckCircle2, Wrench, Gauge } from "lucide-react";

const EMPTY = {
  name: "",
  plate: "",
  type: "Compattatore",
  status: "available",
  fault_note: "",
  current_km: 0,
  maintenance_km_interval: 20000,
  last_service_km: 0,
  last_service_date: "",
};

const STATUS_CONFIG = {
  available: {
    label: "Disponibile",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  faulty: {
    label: "In Guasto",
    color: "bg-destructive/15 text-destructive border-destructive/30",
    icon: AlertTriangle,
  },
  maintenance: {
    label: "In Manutenzione",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    icon: Wrench,
  },
};

export default function Fleet() {
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/vehicles").then((r) => setVehicles(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (v) => {
    setEditing(v);
    setForm({
      name: v.name,
      plate: v.plate,
      type: v.type || "Compattatore",
      status: v.status || "available",
      fault_note: v.fault_note || "",
      current_km: v.current_km ?? 0,
      maintenance_km_interval: v.maintenance_km_interval ?? 20000,
      last_service_km: v.last_service_km ?? 0,
      last_service_date: v.last_service_date || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.plate.trim()) return toast.error("Nome e targa obbligatori");
    try {
      if (editing) await api.put(`/vehicles/${editing.id}`, form);
      else await api.post("/vehicles", form);
      toast.success(editing ? "Mezzo aggiornato" : "Mezzo aggiunto");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const handleRecordService = async (v) => {
    const curr = v.current_km || 0;
    const ok = window.confirm(
      `Confermi di aver eseguito il tagliando/manutenzione per ${v.name} (${v.plate}) ai chilometri attuali (${curr.toLocaleString("it-IT")} km)?\nQuesto aggiornerà la data e azzererà il conteggio di allerta tagliando.`
    );
    if (!ok) return;

    try {
      await api.post(`/vehicles/${v.id}/service`, {
        service_km: curr,
        service_date: new Date().toISOString().split("T")[0],
      });
      toast.success(`Tagliando registrato con successo a ${curr.toLocaleString("it-IT")} km`);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Eliminare ${v.name}?`)) return;
    await api.delete(`/vehicles/${v.id}`);
    toast.success("Mezzo eliminato"); load();
  };

  const toggleStatusQuick = async (v, newStatus) => {
    try {
      await api.put(`/vehicles/${v.id}`, {
        name: v.name,
        plate: v.plate,
        type: v.type || "Compattatore",
        status: newStatus,
        fault_note: v.fault_note || "",
      });
      toast.success(`Stato ${v.name}: ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const availableCount = vehicles.filter((v) => (v.status || "available") === "available").length;
  const faultyCount = vehicles.filter((v) => v.status === "faulty").length;
  const maintCount = vehicles.filter((v) => v.status === "maintenance").length;

  return (
    <div className="space-y-6">
      <Header
        title="Mezzi"
        subtitle="Flotta aziendale"
        count={vehicles.length}
        onAdd={openNew}
        addLabel="Nuovo mezzo"
        addTid="add-vehicle-btn"
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 overline text-[10px] px-2 py-0.5 rounded-sm font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={11} /> Disponibili: {availableCount}
            </span>
            {faultyCount > 0 && (
              <span className="inline-flex items-center gap-1 overline text-[10px] px-2 py-0.5 rounded-sm font-semibold bg-destructive/15 text-destructive">
                <AlertTriangle size={11} /> In guasto: {faultyCount}
              </span>
            )}
            {maintCount > 0 && (
              <span className="inline-flex items-center gap-1 overline text-[10px] px-2 py-0.5 rounded-sm font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                <Wrench size={11} /> In manutenzione: {maintCount}
              </span>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {vehicles.map((v) => {
          const stKey = v.status || "available";
          const cfg = STATUS_CONFIG[stKey] || STATUS_CONFIG.available;
          const StIcon = cfg.icon;
          const isFaulty = stKey === "faulty" || stKey === "maintenance";

          return (
            <div
              key={v.id}
              className={`group relative bg-card border rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200 ${
                isFaulty ? "border-destructive/50 bg-card" : "border-border hover:border-foreground/40"
              }`}
              data-testid={`vehicle-card-${v.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ring-2 ring-background shrink-0 ${
                    stKey === "faulty"
                      ? "bg-destructive/15 text-destructive"
                      : stKey === "maintenance"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-secondary text-primary"
                  }`}>
                    <Truck size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-base leading-tight text-foreground truncate group-hover:text-primary transition-colors">{v.name}</div>
                    <div className="overline text-muted-foreground text-[10px] truncate mt-0.5">{v.type}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider shrink-0 ${cfg.color}`}>
                  <StIcon size={12} /> {cfg.label}
                </span>
              </div>

              <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-border">
                <div className="font-mono text-xs inline-block px-2.5 py-1 bg-secondary rounded-lg font-bold tracking-wide border border-border shadow-2xs">
                  {v.plate}
                </div>
                <div className="flex items-center gap-1">
                  {stKey !== "available" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatusQuick(v, "available")}
                      className="h-7 text-[10px] px-2.5 text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10 rounded-lg font-semibold shadow-2xs"
                      title="Segna come disponibile"
                    >
                      <CheckCircle2 size={11} className="mr-1" /> Ripristina
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatusQuick(v, "faulty")}
                      className="h-7 text-[10px] px-2.5 text-destructive border-destructive/40 hover:bg-destructive/10 rounded-lg font-semibold shadow-2xs"
                      title="Segna mezzo come guasto"
                    >
                      <AlertTriangle size={11} className="mr-1" /> Segna Guasto
                    </Button>
                  )}
                </div>
              </div>

              {/* Sezione Chilometri e Manutenzione Programmata */}
              <div className="mt-3 pt-2.5 border-t border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Gauge size={14} className="text-primary shrink-0" />
                    <span>Contachilometri:</span>
                  </div>
                  <div className="font-mono font-bold text-xs text-foreground bg-secondary/80 px-2 py-0.5 rounded-lg border border-border shadow-2xs">
                    {(v.current_km || 0).toLocaleString("it-IT")} km
                  </div>
                </div>

                {v.last_km_updated_at && (
                  <div className="text-[10px] text-muted-foreground flex items-center justify-between px-0.5">
                    <span>Ultima lettura:</span>
                    <span className="truncate max-w-[170px]" title={`Aggiornato da ${v.last_km_updated_by || 'Autista'}`}>
                      {new Date(v.last_km_updated_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {v.last_km_updated_by ? ` • ${v.last_km_updated_by}` : ""}
                    </span>
                  </div>
                )}

                {(() => {
                  const interval = v.maintenance_km_interval || 20000;
                  const lastService = v.last_service_km || 0;
                  const nextServiceAt = lastService + interval;
                  const remainingKm = nextServiceAt - (v.current_km || 0);

                  const isOverdue = remainingKm <= 0;
                  const isImminent = !isOverdue && remainingKm <= 1500;

                  return (
                    <div className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-1.5 transition-colors ${
                      isOverdue
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-400"
                        : isImminent
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        : "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400"
                    }`}>
                      <div className="flex items-center gap-1.5 font-semibold truncate">
                        <Wrench size={12} className="shrink-0" />
                        <span className="truncate">
                          {isOverdue
                            ? `Tagliando scaduto (${Math.abs(remainingKm).toLocaleString('it-IT')} km fa)`
                            : isImminent
                            ? `Tagliando tra ${remainingKm.toLocaleString('it-IT')} km`
                            : `Tagliando tra ${remainingKm.toLocaleString('it-IT')} km`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRecordService(v)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-background border border-current hover:opacity-85 transition-opacity shrink-0 shadow-2xs cursor-pointer"
                        title="Registra tagliando effettuato ai km attuali"
                      >
                        Tagliando Fatto
                      </button>
                    </div>
                  );
                })()}
              </div>

              {v.fault_note && (
                <div className="mt-2.5 p-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-tight">{v.fault_note}</span>
                </div>
              )}

              <div className="flex gap-2 mt-3 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="rounded-xl flex-1 font-semibold border-border hover:bg-secondary hover:border-foreground/40 shadow-2xs h-9" data-testid={`edit-vehicle-${v.id}`} onClick={() => openEdit(v)}>
                  <Pencil size={14} className="mr-1.5" /> Modifica
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-destructive/10 border-border hover:border-destructive/40 shadow-2xs h-9 px-3" data-testid={`delete-vehicle-${v.id}`} onClick={() => remove(v)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[94vw] sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-border/80" data-testid="vehicle-modal">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight text-lg sm:text-xl">
              {editing ? "Modifica mezzo" : "Nuovo mezzo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nome mezzo *">
              <Input
                data-testid="vehicle-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="es. Compattatore 01"
                className="rounded-sm"
              />
            </Field>
            <Field label="Targa *">
              <Input
                data-testid="vehicle-plate-input"
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                placeholder="es. AB 123 CD"
                className="rounded-sm font-mono uppercase"
              />
            </Field>
            <Field label="Tipologia">
              <Input
                data-testid="vehicle-type-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="es. Compattatore, Porter, Scarrabile"
                className="rounded-sm"
              />
            </Field>

            <Field label="Stato operatività mezzo">
              <Select
                value={form.status}
                onValueChange={(val) => setForm({ ...form, status: val })}
              >
                <SelectTrigger className="rounded-sm h-10 text-xs sm:text-sm" data-testid="vehicle-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                      Disponibile per i turni
                    </span>
                  </SelectItem>
                  <SelectItem value="faulty">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                      In Guasto (Fuori servizio)
                    </span>
                  </SelectItem>
                  <SelectItem value="maintenance">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                      In Manutenzione programmata
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.status !== "available" && (
              <Field label="Descrizione guasto / motivo fermo">
                <Input
                  value={form.fault_note}
                  onChange={(e) => setForm({ ...form, fault_note: e.target.value })}
                  placeholder="es. Guasto al cambio, attesa ricambi"
                  className="rounded-sm text-xs"
                />
              </Field>
            )}

            {/* Configurazione Chilometri e Manutenzione Programmata */}
            <div className="pt-2 border-t border-border space-y-3">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Gauge size={14} className="text-primary" />
                <span>Gestione Chilometri e Tagliando</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Chilometri attuali (km)">
                  <Input
                    type="number"
                    data-testid="vehicle-current-km-input"
                    value={form.current_km}
                    onChange={(e) => setForm({ ...form, current_km: parseInt(e.target.value, 10) || 0 })}
                    placeholder="es. 124500"
                    className="rounded-sm font-mono"
                  />
                </Field>
                <Field label="Soglia tagliando ogni (km)">
                  <Input
                    type="number"
                    data-testid="vehicle-maintenance-interval-input"
                    value={form.maintenance_km_interval}
                    onChange={(e) => setForm({ ...form, maintenance_km_interval: parseInt(e.target.value, 10) || 20000 })}
                    placeholder="es. 20000"
                    className="rounded-sm font-mono"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Km all'ultimo tagliando">
                  <Input
                    type="number"
                    data-testid="vehicle-last-service-km-input"
                    value={form.last_service_km}
                    onChange={(e) => setForm({ ...form, last_service_km: parseInt(e.target.value, 10) || 0 })}
                    placeholder="es. 100000"
                    className="rounded-sm font-mono"
                  />
                </Field>
                <Field label="Data ultimo tagliando">
                  <Input
                    type="date"
                    data-testid="vehicle-last-service-date-input"
                    value={form.last_service_date}
                    onChange={(e) => setForm({ ...form, last_service_date: e.target.value })}
                    className="rounded-sm"
                  />
                </Field>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" className="rounded-sm h-10 text-xs sm:text-sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90 h-10 text-xs sm:text-sm font-semibold" data-testid="save-vehicle-btn" onClick={save}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
