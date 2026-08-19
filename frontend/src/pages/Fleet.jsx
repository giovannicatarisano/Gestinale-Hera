import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { Header, Field } from "./Drivers";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Truck } from "lucide-react";

const EMPTY = { name: "", plate: "", type: "Compattatore" };

export default function Fleet() {
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/vehicles").then((r) => setVehicles(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (v) => { setEditing(v); setForm({ name: v.name, plate: v.plate, type: v.type }); setOpen(true); };

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

  return (
    <div className="space-y-6">
      <Header title="Mezzi" subtitle="Flotta aziendale" count={vehicles.length} onAdd={openNew} addLabel="Nuovo mezzo" addTid="add-vehicle-btn" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {vehicles.map((v) => (
          <div key={v.id} className="border border-border bg-card rounded-sm p-4" data-testid={`vehicle-card-${v.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-sm bg-secondary flex items-center justify-center text-primary">
                  <Truck size={22} />
                </div>
                <div>
                  <div className="font-semibold">{v.name}</div>
                  <div className="overline text-muted-foreground">{v.type}</div>
                </div>
              </div>
            </div>
            <div className="font-mono text-sm mt-3 inline-block px-2 py-1 bg-secondary rounded-sm">{v.plate}</div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="rounded-sm flex-1" data-testid={`edit-vehicle-${v.id}`} onClick={() => openEdit(v)}>
                <Pencil size={14} className="mr-1.5" /> Modifica
              </Button>
              <Button variant="outline" size="sm" className="rounded-sm text-destructive hover:bg-destructive/10" data-testid={`delete-vehicle-${v.id}`} onClick={() => remove(v)}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[94vw] sm:max-w-md rounded-sm max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="vehicle-modal">
          <DialogHeader><DialogTitle className="font-head tracking-tight text-lg sm:text-xl">{editing ? "Modifica mezzo" : "Nuovo mezzo"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Nome mezzo *"><Input data-testid="vehicle-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. Compattatore 01" className="rounded-sm" /></Field>
            <Field label="Targa *"><Input data-testid="vehicle-plate-input" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="es. AB 123 CD" className="rounded-sm font-mono uppercase" /></Field>
            <Field label="Tipologia"><Input data-testid="vehicle-type-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="es. Compattatore, Porter, Scarrabile" className="rounded-sm" /></Field>
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
