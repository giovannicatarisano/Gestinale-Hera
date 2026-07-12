import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

const EMPTY = { name: "", email: "", phone: "", active: true };

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/drivers").then((r) => setDrivers(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (d) => { setEditing(d); setForm({ name: d.name, email: d.email, phone: d.phone, active: d.active }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Il nome è obbligatorio");
    try {
      if (editing) await api.put(`/drivers/${editing.id}`, form);
      else await api.post("/drivers", form);
      toast.success(editing ? "Autista aggiornato" : "Autista aggiunto");
      setOpen(false);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const remove = async (d) => {
    if (!window.confirm(`Eliminare ${d.name}?`)) return;
    await api.delete(`/drivers/${d.id}`);
    toast.success("Autista eliminato");
    load();
  };

  return (
    <div className="space-y-6">
      <Header title="Autisti" subtitle="Anagrafica dipendenti" count={drivers.length} onAdd={openNew} addLabel="Nuovo autista" addTid="add-driver-btn" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {drivers.map((d) => (
          <div key={d.id} className="border border-border bg-card rounded-sm p-4" data-testid={`driver-card-${d.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold">
                  {initials(d.name)}
                </div>
                <div>
                  <div className="font-semibold">{d.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{d.email || "—"}</div>
                </div>
              </div>
              <span className={`overline px-1.5 py-0.5 rounded-sm ${d.active ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {d.active ? "Attivo" : "Inattivo"}
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground mt-3">{d.phone || ""}</div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="rounded-sm flex-1" data-testid={`edit-driver-${d.id}`} onClick={() => openEdit(d)}>
                <Pencil size={14} className="mr-1.5" /> Modifica
              </Button>
              <Button variant="outline" size="sm" className="rounded-sm text-destructive hover:bg-destructive/10" data-testid={`delete-driver-${d.id}`} onClick={() => remove(d)}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-head tracking-tight">{editing ? "Modifica autista" : "Nuovo autista"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nome e cognome"><Input data-testid="driver-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm" /></Field>
            <Field label="Email"><Input data-testid="driver-email-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-sm" /></Field>
            <Field label="Telefono"><Input data-testid="driver-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-sm" /></Field>
            <div className="flex items-center justify-between border border-border rounded-sm p-3">
              <Label className="text-sm">In servizio</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="driver-active-switch" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90" data-testid="save-driver-btn" onClick={save}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Header({ title, subtitle, count, onAdd, addLabel, addTid, icon: Icon = Users }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="overline text-primary mb-1">{subtitle}</div>
        <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tighter flex items-center gap-3">
          {title} <span className="font-mono text-base text-muted-foreground">{count}</span>
        </h1>
      </div>
      {onAdd && (
        <Button className="rounded-sm bg-primary hover:bg-primary/90 font-semibold" data-testid={addTid} onClick={onAdd}>
          <Plus size={16} className="mr-1.5" /> <span className="hidden sm:inline">{addLabel}</span>
        </Button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
