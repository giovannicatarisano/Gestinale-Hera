import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { Header, Field } from "./Drivers";
import { DAY_LABELS } from "../lib/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Route as RouteIcon, Clock, Lock, Repeat } from "lucide-react";

const SLOTS = [
  { value: "rotazione", label: "🔄 Rotazione Libera (Mattino / Pomeriggio)" },
  { value: "presto", label: "Mattino Presto (05:30 – 11:50)" },
  { value: "standard", label: "Mattino Standard (06:00 – 12:20)" },
  { value: "pomeriggio", label: "Pomeriggio (12:30 – 18:50)" },
  { value: "domenica", label: "Turno Domenica (06:00 – 12:20)" },
];
const SLOT_SHORT = { rotazione: "Rotazione Libera", presto: "Presto", standard: "Standard", pomeriggio: "Pomeriggio", domenica: "Domenica" };
const EMPTY = {
  name: "", code: "", zone: "", vehicle_id: "", slot: "rotazione",
  schedule_mode: "fixed", days: [0, 1, 2, 3, 4, 5], interval_days: 2, start_date: "", pinned: false,
};

export default function RoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => Promise.all([api.get("/routes"), api.get("/vehicles")]).then(([r, v]) => { setRoutes(r.data); setVehicles(v.data); });
  useEffect(() => { load(); }, []);
  const vById = Object.fromEntries(vehicles.map((v) => [v.id, v]));

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, vehicle_id: vehicles[0]?.id || "" }); setOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      name: r.name, code: r.code, zone: r.zone, vehicle_id: r.vehicle_id, slot: r.slot,
      schedule_mode: r.schedule_mode || "fixed", days: r.days || [],
      interval_days: r.interval_days || 2, start_date: r.start_date || "", pinned: !!r.pinned,
    });
    setOpen(true);
  };

  const setSlot = (v) => setForm((f) => ({ ...f, slot: v, days: v === "domenica" ? [6] : (f.days.length ? f.days : [0, 1, 2, 3, 4, 5]) }));

  const toggleDay = (d) => setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() }));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.vehicle_id) return toast.error("Nome, codice e mezzo obbligatori");
    try {
      if (editing) await api.put(`/routes/${editing.id}`, form);
      else await api.post("/routes", form);
      toast.success(editing ? "Giro aggiornato" : "Giro aggiunto");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Eliminare ${r.name}?`)) return;
    await api.delete(`/routes/${r.id}`);
    toast.success("Giro eliminato"); load();
  };

  return (
    <div className="space-y-6">
      <Header title="Giri" subtitle="Percorsi di raccolta" count={routes.length} onAdd={openNew} addLabel="Nuovo giro" addTid="add-route-btn" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {routes.map((r) => (
          <div key={r.id} className="border border-border bg-card rounded-sm p-4" data-testid={`route-card-${r.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-sm bg-secondary flex items-center justify-center text-primary shrink-0"><RouteIcon size={20} /></div>
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-1.5">
                    {r.pinned && <Lock size={13} className="text-primary shrink-0" />}
                    {r.name}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{r.code} · {r.zone}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-sm ${
                r.slot === "rotazione"
                  ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 font-semibold"
                  : "bg-primary/15 text-primary"
              }`}>
                {r.slot === "rotazione" ? <Repeat size={10} /> : <Clock size={10} />}
                {SLOT_SHORT[r.slot]}
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-secondary rounded-sm">{vById[r.vehicle_id]?.name || "—"}</span>
              {r.schedule_mode === "frequency" && (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 bg-foreground text-background rounded-sm"><Repeat size={10} /> ogni {r.interval_days} gg</span>
              )}
              {r.pinned && (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded-sm"><Lock size={10} /> Fissato</span>
              )}
            </div>
            {r.schedule_mode !== "frequency" && (
              <div className="flex gap-1 mt-2">
                {DAY_LABELS.map((lbl, i) => (
                  <span key={i} className={`text-[10px] font-mono w-6 h-6 flex items-center justify-center rounded-sm ${r.days?.includes(i) ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>{lbl[0]}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="rounded-sm flex-1" data-testid={`edit-route-${r.id}`} onClick={() => openEdit(r)}><Pencil size={14} className="mr-1.5" /> Modifica</Button>
              <Button variant="outline" size="sm" className="rounded-sm text-destructive hover:bg-destructive/10" data-testid={`delete-route-${r.id}`} onClick={() => remove(r)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[94vw] sm:max-w-lg rounded-sm max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="route-modal">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight text-lg sm:text-xl">{editing ? "Modifica giro" : "Nuovo giro"}</DialogTitle>
            <DialogDescription className="sr-only">Configura percorso, mezzo richiesto, fascia oraria, frequenza e giorni operativi del giro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome giro *"><Input data-testid="route-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. Centro Storico" className="rounded-sm" /></Field>
              <Field label="Codice *"><Input data-testid="route-code-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="es. CS-01" className="rounded-sm font-mono uppercase" /></Field>
            </div>
            <Field label="Zona"><Input data-testid="route-zone-input" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="es. Centro, Periferia Nord" className="rounded-sm" /></Field>
            <Field label="Mezzo richiesto">
              <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                <SelectTrigger className="rounded-sm h-10" data-testid="route-vehicle-select"><SelectValue placeholder="Seleziona mezzo" /></SelectTrigger>
                <SelectContent className="max-h-56">{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {v.plate}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Fascia oraria">
              <Select value={form.slot} onValueChange={setSlot}>
                <SelectTrigger className="rounded-sm h-10" data-testid="route-slot-select"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            <Field label="Frequenza di assegnazione">
              <Select value={form.schedule_mode} onValueChange={(v) => setForm({ ...form, schedule_mode: v })}>
                <SelectTrigger className="rounded-sm h-10" data-testid="route-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Giorni fissi della settimana</SelectItem>
                  <SelectItem value="frequency">Ogni N giorni (ciclico)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.schedule_mode === "frequency" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Ogni quanti giorni">
                  <Input type="number" min="1" data-testid="route-interval-input" value={form.interval_days}
                    onChange={(e) => setForm({ ...form, interval_days: parseInt(e.target.value || "1", 10) })} className="rounded-sm font-mono h-10" />
                </Field>
                <Field label="Data di partenza (opz.)">
                  <Input type="date" data-testid="route-start-input" value={form.start_date || ""}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-sm font-mono h-10" />
                </Field>
              </div>
            ) : form.slot === "domenica" ? (
              <div className="text-xs text-muted-foreground border border-border rounded-sm p-3 font-mono bg-secondary/30">
                Giro fisso alla Domenica (max 3 autisti nel turno).
              </div>
            ) : (
              <Field label="Giorni operativi">
                <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
                  {DAY_LABELS.slice(0, 6).map((lbl, i) => (
                    <button key={i} type="button" data-testid={`route-day-${i}`} onClick={() => toggleDay(i)}
                      className={`h-9 text-xs font-mono font-semibold rounded-sm border transition-colors ${form.days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <div className="flex items-center justify-between border border-border rounded-sm p-3 bg-secondary/20">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5"><Lock size={14} className="text-primary" /> Fissa giro</div>
                <div className="text-xs text-muted-foreground">Il motore lo mantiene sempre su questo turno e giorno.</div>
              </div>
              <Switch checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} data-testid="route-pinned-switch" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" className="rounded-sm h-10 text-xs sm:text-sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90 h-10 text-xs sm:text-sm font-semibold" data-testid="save-route-btn" onClick={save}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
