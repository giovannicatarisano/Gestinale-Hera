import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Header, Field } from "./Drivers";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserPlus,
  KeyRound,
  Trash2,
  Pencil,
  Mail,
  Calendar,
  Lock,
  UserCheck,
  AlertCircle,
  ShieldAlert
} from "lucide-react";

const EMPTY_FORM = { name: "", email: "", password: "" };

export default function Assistants() {
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog Crea
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  // Dialog Modifica / Password
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Dialog Elimina
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/assistants");
      setAssistants(res.data || []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Errore nel caricamento assistenti"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handleRefresh = () => load();
    window.addEventListener("hera:refresh", handleRefresh);
    return () => window.removeEventListener("hera:refresh", handleRefresh);
  }, []);

  const openNew = () => {
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return toast.error("Inserisci il nome dell'assistente");
    if (!createForm.email.trim()) return toast.error("Inserisci l'email");
    if (!createForm.password.trim() || createForm.password.trim().length < 4) {
      return toast.error("La password deve avere almeno 4 caratteri");
    }

    setCreating(true);
    try {
      await api.post("/assistants", {
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password.trim(),
      });
      toast.success(`Assistente ${createForm.name.trim()} creato con successo`);
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Errore creazione assistente"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (assistant) => {
    setEditTarget(assistant);
    setEditForm({
      name: assistant.name || "",
      email: assistant.email || "",
      password: "", // Vuota se non desidera cambiarla
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) return toast.error("Il nome è obbligatorio");
    if (!editForm.email.trim()) return toast.error("L'email è obbligatoria");
    if (editForm.password && editForm.password.trim().length < 4) {
      return toast.error("La nuova password deve contenere almeno 4 caratteri");
    }

    setSavingEdit(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      await api.put(`/assistants/${editTarget.id}`, payload);
      toast.success("Credenziali assistente aggiornate");
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Errore aggiornamento"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/assistants/${deleteTarget.id}`);
      toast.success(`Accesso revocato ed eliminato per ${deleteTarget.name}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Errore eliminazione"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Assistenti"
        subtitle="Controllo Accessi & Collaboratori"
        count={assistants.length}
        onAdd={openNew}
        addLabel="Nuovo assistente"
        addTid="add-assistant-btn"
      />

      {/* Box informativo di sicurezza per l'Admin */}
      <div className="p-4 rounded-sm border border-emerald-500/30 bg-emerald-500/5 flex items-start gap-3.5">
        <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck size={20} />
        </div>
        <div className="text-xs space-y-1">
          <div className="font-semibold text-foreground text-sm">
            Area Riservata Amministratore Superiore
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Solo tu puoi visualizzare questa pagina e creare o revocare le credenziali per gli{" "}
            <span className="font-medium text-foreground">Assistenti</span>. 
            Gli assistenti hanno accesso completo al gestionale per operare su autisti, mezzi, giri e turni, 
            ma non possono vedere né modificare altri assistenti o il tuo account amministratore.
          </p>
        </div>
      </div>

      {/* Lista Assistenti */}
      {loading ? (
        <div className="py-12 flex justify-center items-center text-muted-foreground text-sm gap-2">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Caricamento assistenti...</span>
        </div>
      ) : assistants.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-8 text-center bg-card">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mx-auto text-muted-foreground mb-3">
            <UserPlus size={22} />
          </div>
          <h3 className="font-semibold text-base mb-1">Nessun assistente registrato</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Al momento sei l'unico gestore del sistema. Clicca sul pulsante qui sotto per creare le credenziali per un tuo collaboratore.
          </p>
          <Button onClick={openNew} className="rounded-sm bg-primary hover:bg-primary/90 h-9 text-xs font-semibold">
            <UserPlus size={15} className="mr-1.5" /> Aggiungi primo assistente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assistants.map((a) => (
            <div
              key={a.id}
              className="border border-border bg-card rounded-sm p-4 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-sm flex items-center justify-center font-head font-bold text-sm bg-teal-600 text-white shadow-xs">
                      {initials(a.name)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                        {a.name}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Mail size={12} className="shrink-0" />
                        <span className="truncate max-w-[180px]">{a.email}</span>
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                    <UserCheck size={11} /> Assistente
                  </span>
                </div>

                <div className="pt-2 border-t border-border/70 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar size={12} className="shrink-0" />
                  <span>
                    Creato il:{" "}
                    {a.created_at ? new Date(a.created_at).toLocaleDateString("it-IT") : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-sm h-8 text-xs font-medium"
                  onClick={() => openEdit(a)}
                  title="Modifica anagrafica o reimposta password"
                >
                  <KeyRound size={13} className="mr-1 text-primary" /> Modifica / Password
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-sm h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
                  onClick={() => setDeleteTarget(a)}
                  title="Revoca accesso ed elimina"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIALOG CREA NUOVO ASSISTENTE */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" size={20} />
              Nuovo Assistente Operativo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Nome e Cognome">
              <Input
                placeholder="es. Marco Bianchi"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="rounded-sm h-9 text-sm"
              />
            </Field>

            <Field label="Email di Accesso (Username)">
              <Input
                type="email"
                placeholder="es. marco.bianchi@hera.it"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="rounded-sm h-9 text-sm"
              />
            </Field>

            <Field label="Password Iniziale">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Minimo 4 caratteri"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="rounded-sm h-9 text-sm pr-9"
                />
                <Lock size={14} className="absolute right-3 top-2.5 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Comunica questa password al tuo collaboratore per il suo primo accesso.
              </p>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-sm h-9 text-xs"
              onClick={() => setCreateOpen(false)}
            >
              Annulla
            </Button>
            <Button
              className="rounded-sm bg-primary hover:bg-primary/90 h-9 text-xs font-semibold"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creazione in corso..." : "Crea Assistente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG MODIFICA / RESET PASSWORD */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="text-primary" size={18} />
              Modifica Assistente: {editTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Nome e Cognome">
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="rounded-sm h-9 text-sm"
              />
            </Field>

            <Field label="Email di Accesso">
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="rounded-sm h-9 text-sm"
              />
            </Field>

            <Field label="Nuova Password (opzionale)">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Lascia vuoto per non modificare"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="rounded-sm h-9 text-sm pr-9"
                />
                <KeyRound size={14} className="absolute right-3 top-2.5 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Compila questo campo solo se desideri resettare o cambiare la password dell'assistente.
              </p>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-sm h-9 text-xs"
              onClick={() => setEditOpen(false)}
            >
              Annulla
            </Button>
            <Button
              className="rounded-sm bg-primary hover:bg-primary/90 h-9 text-xs font-semibold"
              onClick={handleUpdate}
              disabled={savingEdit}
            >
              {savingEdit ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG CONFERMA ELIMINAZIONE */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert size={20} />
              Revoca Accesso Assistente
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-xs space-y-2">
            <p>
              Sei sicuro di voler revocare l'accesso e cancellare l'account di{" "}
              <strong className="text-foreground">{deleteTarget?.name}</strong> ({deleteTarget?.email})?
            </p>
            <p className="text-muted-foreground">
              L'utente non potrà più effettuare il login. Nessun dato operativo (turni o autisti creati) verrà perso.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-sm h-9 text-xs"
              onClick={() => setDeleteTarget(null)}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="rounded-sm h-9 text-xs font-semibold"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Eliminazione..." : "Conferma ed Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
