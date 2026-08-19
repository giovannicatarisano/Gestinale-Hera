import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, KeyRound, ShieldCheck, UsersRound } from "lucide-react";

const EMPTY = { name: "", email: "", phone: "", active: true, group: "", password: "" };

const GROUP_LABEL = { gruppo1: "Gruppo 1", gruppo2: "Gruppo 2", "": "Nessun gruppo" };
const GROUP_CLS = {
  gruppo1: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  gruppo2: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "": "bg-secondary text-muted-foreground",
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/drivers").then((r) => setDrivers(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (d) => { setEditing(d); setForm({ name: d.name, email: d.email, phone: d.phone, active: d.active, group: d.group || "", password: "" }); setOpen(true); };

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
      <Header
        title="Autisti"
        subtitle="Anagrafica dipendenti"
        count={drivers.length}
        onAdd={openNew}
        addLabel="Nuovo autista"
        addTid="add-driver-btn"
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 overline text-[10px] px-2 py-0.5 rounded-sm font-semibold ${GROUP_CLS.gruppo1}`}>
              <UsersRound size={11} /> G1: {drivers.filter(d => d.group === "gruppo1").length}
            </span>
            <span className={`inline-flex items-center gap-1 overline text-[10px] px-2 py-0.5 rounded-sm font-semibold ${GROUP_CLS.gruppo2}`}>
              <UsersRound size={11} /> G2: {drivers.filter(d => d.group === "gruppo2").length}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {drivers.map((d) => (
          <div key={d.id} className="border border-border bg-card rounded-sm p-4" data-testid={`driver-card-${d.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-sm flex items-center justify-center font-head font-bold text-sm ${
                  d.group === "gruppo1" ? "bg-blue-500 text-white" :
                  d.group === "gruppo2" ? "bg-orange-500 text-white" :
                  "bg-primary text-primary-foreground"
                }`}>
                  {initials(d.name)}
                </div>
                <div>
                  <div className="font-semibold leading-tight">{d.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{d.email || "—"}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`overline px-1.5 py-0.5 rounded-sm text-[10px] ${d.active ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {d.active ? "Attivo" : "Inattivo"}
                </span>
                {d.group && (
                  <span className={`overline px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${GROUP_CLS[d.group]}`}>
                    {d.group === "gruppo1" ? "G1" : "G2"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="font-mono text-xs text-muted-foreground">{d.phone || ""}</div>
              {d.has_account ? (
                <span className="inline-flex items-center gap-1 overline text-primary" data-testid={`account-badge-${d.id}`}>
                  <ShieldCheck size={12} /> Accesso attivo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 overline text-muted-foreground">
                  <KeyRound size={12} /> Nessun accesso
                </span>
              )}
            </div>
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
        <DialogContent className="w-[94vw] sm:max-w-md rounded-sm max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="driver-modal">
          <DialogHeader>
            <DialogTitle className="font-head tracking-tight text-lg sm:text-xl">
              {editing ? "Modifica autista" : "Nuovo autista"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nome e cognome *">
              <Input
                data-testid="driver-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="es. Mario Rossi"
                className="rounded-sm"
              />
            </Field>
            <Field label="Email aziendale">
              <Input
                data-testid="driver-email-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="mario.rossi@hera.it"
                className="rounded-sm"
              />
            </Field>
            <Field label="Telefono">
              <Input
                data-testid="driver-phone-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+39 333 1234567"
                className="rounded-sm"
              />
            </Field>
            <Field label="Gruppo turni *">
              <Select value={form.group} onValueChange={(v) => setForm({ ...form, group: v })}>
                <SelectTrigger className="rounded-sm h-10 text-xs sm:text-sm" data-testid="driver-group-select">
                  <SelectValue placeholder="Seleziona gruppo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gruppo1">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                      Gruppo 1
                    </span>
                  </SelectItem>
                  <SelectItem value="gruppo2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />
                      Gruppo 2
                    </span>
                  </SelectItem>
                  <SelectItem value="">
                    <span className="text-muted-foreground">Nessun gruppo (rotazione libera)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                I gruppi si alternano automaticamente ogni settimana tra turno Mattina e Pomeriggio.
              </p>
            </Field>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-semibold">Stato attivo</Label>
              <Switch
                data-testid="driver-active-toggle"
                checked={form.active}
                onCheckedChange={(c) => setForm({ ...form, active: c })}
              />
            </div>
            <div className="border-t border-border pt-4">
              <div className="text-xs font-semibold mb-1">
                {editing ? "Reimposta password accesso" : "Password accesso app (opzionale)"}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Consente all'autista di accedere all'applicazione sul telefono.
              </p>
              <Input
                data-testid="driver-password-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "Lascia vuoto per non modificare" : "Minimo 6 caratteri"}
                className="rounded-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" className="rounded-sm h-10 text-xs sm:text-sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button className="rounded-sm bg-primary hover:bg-primary/90 h-10 text-xs sm:text-sm font-semibold" data-testid="save-driver-btn" onClick={save}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Header({ title, subtitle, count, onAdd, addLabel, addTid, icon: Icon = Users, extra }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <div className="overline text-primary mb-0.5">{subtitle}</div>
        <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter flex items-center gap-2.5">
          {title} <span className="font-mono text-xs sm:text-sm px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">{count}</span>
        </h1>
        {extra && <div className="mt-2 flex items-center gap-2">{extra}</div>}
      </div>
      {onAdd && (
        <Button className="rounded-sm bg-primary hover:bg-primary/90 font-semibold h-10 px-3.5 text-xs sm:text-sm shadow-sm self-start sm:self-auto" data-testid={addTid} onClick={onAdd}>
          <Plus size={16} className="mr-1.5" /> <span>{addLabel}</span>
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
