import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { Header, Field } from "./Drivers";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Pencil, CalendarOff, Plane, Thermometer, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TYPES = {
  ferie: { label: "Ferie", icon: Plane, cls: "bg-primary/15 text-primary" },
  malattia: { label: "Malattia", icon: Thermometer, cls: "bg-destructive/15 text-destructive" },
  permesso: { label: "Permesso", icon: Clock3, cls: "bg-secondary text-muted-foreground" },
};
const EMPTY = { driver_id: "", type: "ferie", start_date: "", end_date: "", note: "" };

const fmt = (d) => { try { return format(new Date(d), "d MMM yyyy", { locale: it }); } catch { return d; } };

export default function Absences() {
  const [absences, setAbsences] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => Promise.all([api.get("/absences"), api.get("/drivers")]).then(([a, d]) => { setAbsences(a.data); setDrivers(d.data); });
  useEffect(() => { load(); }, []);
  const dById = Object.fromEntries(drivers.map((d) => [d.id, d]));

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, driver_id: drivers[0]?.id || "" }); setOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ driver_id: a.driver_id, type: a.type, start_date: a.start_date, end_date: a.end_date, note: a.note || "" }); setOpen(true); };

  const save = async () => {
    if (!form.driver_id || !form.start_date || !form.end_date) return toast.error("Autista e date obbligatori");
    try {
      if (editing) await api.put(`/absences/${editing.id}`, form);
      else await api.post("/absences", form);
      toast.success(editing ? "Assenza aggiornata" : "Assenza registrata");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const remove = async (a) => {
    if (!window.confirm("Eliminare questa assenza?")) return;
    await api.delete(`/absences/${a.id}`);
    toast.success("Assenza eliminata"); load();
  };

  const sorted = [...absences].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="space-y-6">
      <Header title="Assenze" subtitle="Ferie · malattie · permessi" count={absences.length} onAdd={openNew} addLabel="Nuova assenza" addTid="add-absence-btn" icon={CalendarOff} />

      <p className="text-sm text-muted-foreground -mt-2">
        Nei giorni di assenza il motore <b>esclude automaticamente</b> l'autista dalla generazione e dai suggerimenti di sostituzione.
      </p>

      {sorted.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-muted-foreground bg-card">
          Nessuna assenza registrata.
        </div>
      ) : (
        <div className="border border-border bg-card rounded-sm divide-y divide-border">
          {sorted.map((a) => {
            const t = TYPES[a.type] || TYPES.ferie;
            const drv = dById[a.driver_id];
            return (
              <div key={a.id} className="flex items-center gap-3 p-3" data-testid={`absence-row-${a.id}`}>
                <div className="h-9 w-9 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs shrink-0">
                  {initials(drv?.name || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{drv?.name || "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{fmt(a.start_date)} → {fmt(a.end_date)}{a.note ? ` · ${a.note}` : ""}</div>
                </div>
                <span className={`inline-flex items-center gap-1 overline px-1.5 py-0.5 rounded-sm shrink-0 ${t.cls}`}>
                  <t.icon size={11} /> {t.label}
                </span>
                <Button variant="outline" size="sm" className="rounded-sm" data-testid={`edit-absence-${a.id}`} onClick={() => openEdit(a)}><Pencil size={14} /></Button>
                <Button variant="outline" size="sm" className="rounded-sm text-destructive hover:bg-destructive/10" data-testid={`delete-absence-${a.id}`} onClick={() => remove(a)}><Trash2 size={14} /></Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight">{editing ? "Modifica assenza" : "Nuova assenza"}</DialogTitle>
            <DialogDescription className="sr-only">Registra ferie, malattia o permesso per un autista in un intervallo di date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Autista">
              <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger className="rounded-sm" data-testid="absence-driver-select"><SelectValue placeholder="Seleziona autista" /></SelectTrigger>
                <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="rounded-sm" data-testid="absence-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ferie">Ferie</SelectItem>
                  <SelectItem value="malattia">Malattia</SelectItem>
                  <SelectItem value="permesso">Permesso</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dal"><Input type="date" data-testid="absence-start-input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-sm font-mono" /></Field>
              <Field label="Al"><Input type="date" data-testid="absence-end-input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="rounded-sm font-mono" /></Field>
            </div>
            <Field label="Note (opz.)"><Textarea data-testid="absence-note-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="rounded-sm" rows={2} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90" data-testid="save-absence-btn" onClick={save}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
