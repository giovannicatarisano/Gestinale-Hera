import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { Header, Field } from "./Drivers";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Truck, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";

const EMPTY = { name: "", plate: "", type: "Compattatore", status: "available", fault_note: "" };

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {vehicles.map((v) => {
          const stKey = v.status || "available";
          const cfg = STATUS_CONFIG[stKey] || STATUS_CONFIG.available;
          const StIcon = cfg.icon;
          const isFaulty = stKey === "faulty" || stKey === "maintenance";

          return (
            <div
              key={v.id}
              className={`border rounded-sm p-4 transition-all ${
                isFaulty ? "border-destructive/40 bg-card shadow-xs" : "border-border bg-card shadow-xs"
              }`}
              data-testid={`vehicle-card-${v.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-sm flex items-center justify-center ${
                    stKey === "faulty"
                      ? "bg-destructive/15 text-destructive"
                      : stKey === "maintenance"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-secondary text-primary"
                  }`}>
                    <Truck size={22} />
                  </div>
                  <div>
                    <div className="font-semibold leading-tight">{v.name}</div>
                    <div className="overline text-muted-foreground">{v.type}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[11px] font-semibold ${cfg.color}`}>
                  <StIcon size={12} /> {cfg.label}
                </span>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="font-mono text-sm inline-block px-2 py-1 bg-secondary rounded-sm font-bold tracking-wide">
                  {v.plate}
                </div>
                <div className="flex items-center gap-1">
                  {stKey !== "available" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatusQuick(v, "available")}
                      className="h-7 text-[10px] px-2 text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10 rounded-sm"
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
                      className="h-7 text-[10px] px-2 text-destructive border-destructive/40 hover:bg-destructive/10 rounded-sm"
                      title="Segna mezzo come guasto"
                    >
                      <AlertTriangle size={11} className="mr-1" /> Segna Guasto
                    </Button>
                  )}
                </div>
              </div>

              {v.fault_note && (
                <div className="mt-2.5 p-2 bg-destructive/10 border border-destructive/20 rounded-sm text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-tight">{v.fault_note}</span>
                </div>
              )}

              <div className="flex gap-2 mt-4 pt-2 border-t border-border/60">
                <Button variant="outline" size="sm" className="rounded-sm flex-1" data-testid={`edit-vehicle-${v.id}`} onClick={() => openEdit(v)}>
                  <Pencil size={14} className="mr-1.5" /> Modifica
                </Button>
                <Button variant="outline" size="sm" className="rounded-sm text-destructive hover:bg-destructive/10" data-testid={`delete-vehicle-${v.id}`} onClick={() => remove(v)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[94vw] sm:max-w-md rounded-sm max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="vehicle-modal">
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
