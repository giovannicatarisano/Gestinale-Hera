import { useState, useEffect, useMemo, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Scale, Clock, Trash2, Edit2, Plus, Check, ArrowRight, Building2, Tag, AlertCircle } from "lucide-react";

const COMMON_FACILITIES = [
  "CDR Centro",
  "CDR Nord",
  "CDR Sud",
  "Impianto Hera",
  "Impianto Trattamento",
  "Termovalorizzatore",
  "Altro..."
];

const COMMON_WASTE_TYPES = [
  "Indifferenziato (RSU)",
  "Carta & Cartone",
  "Plastica & Imballaggi",
  "Organico (Umido)",
  "Vetro & Lattine",
  "Verde & Sfalci",
  "Ingombranti",
  "Altro"
];

function getCurrentTimeStr() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function computeDurationMinutes(entryStr, exitStr) {
  if (!entryStr || !exitStr) return null;
  try {
    const [eH, eM] = entryStr.split(":").map(Number);
    const [xH, xM] = exitStr.split(":").map(Number);
    if (isNaN(eH) || isNaN(eM) || isNaN(xH) || isNaN(xM)) return null;
    let diff = (xH * 60 + xM) - (eH * 60 + eM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  } catch {
    return null;
  }
}

export default function WeighingModal({ open, onOpenChange, shift, onSuccess }) {
  const [weighings, setWeighings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form stato
  const [editingId, setEditingId] = useState(null);
  const [netWeight, setNetWeight] = useState("");
  const [destination, setDestination] = useState("");
  const [customDestination, setCustomDestination] = useState("");
  const [wasteType, setWasteType] = useState("");
  const [customWasteType, setCustomWasteType] = useState("");
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [notes, setNotes] = useState("");

  // Ricarica la lista degli scarichi del turno
  const loadWeighings = useCallback(async () => {
    if (!shift?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/shifts/${shift.id}/weighings`);
      setWeighings(res.data || []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore nel caricamento delle pesate");
    } finally {
      setLoading(false);
    }
  }, [shift?.id]);

  useEffect(() => {
    if (open && shift?.id) {
      loadWeighings();
      resetForm();
    }
  }, [open, shift?.id, loadWeighings]);

  const resetForm = () => {
    setEditingId(null);
    setNetWeight("");
    setDestination("");
    setCustomDestination("");
    setWasteType("");
    setCustomWasteType("");
    setEntryTime("");
    setExitTime("");
    setNotes("");
  };

  const handleEdit = (w) => {
    setEditingId(w.id);
    setNetWeight(String(w.net_weight || ""));
    if (COMMON_FACILITIES.includes(w.destination)) {
      setDestination(w.destination);
      setCustomDestination("");
    } else {
      setDestination(w.destination ? "Altro..." : "");
      setCustomDestination(w.destination || "");
    }
    if (COMMON_WASTE_TYPES.includes(w.waste_type)) {
      setWasteType(w.waste_type);
      setCustomWasteType("");
    } else {
      setWasteType(w.waste_type ? "Altro" : "");
      setCustomWasteType(w.waste_type || "");
    }
    setEntryTime(w.entry_time || "");
    setExitTime(w.exit_time || "");
    setNotes(w.notes || "");
  };

  const handleDelete = async (wid) => {
    if (!window.confirm("Sei sicuro di voler eliminare questa pesata?")) return;
    try {
      await api.delete(`/weighings/${wid}`);
      toast.success("Scarico eliminato con successo");
      await loadWeighings();
      if (onSuccess) onSuccess();
      if (editingId === wid) resetForm();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore nell'eliminazione dello scarico");
    }
  };

  const liveDuration = useMemo(() => {
    return computeDurationMinutes(entryTime, exitTime);
  }, [entryTime, exitTime]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const weightNum = parseFloat(netWeight.replace(",", "."));
    if (isNaN(weightNum) || weightNum <= 0) {
      toast.error("Inserisci un peso netto valido (maggiore di 0 kg)");
      return;
    }

    const finalDestination = destination === "Altro..." ? customDestination.trim() : destination;
    const finalWasteType = wasteType === "Altro" ? customWasteType.trim() : wasteType;

    setSaving(true);
    try {
      const payload = {
        net_weight: weightNum,
        destination: finalDestination,
        waste_type: finalWasteType,
        entry_time: entryTime,
        exit_time: exitTime,
        duration_minutes: liveDuration,
        notes: notes.trim(),
      };

      if (editingId) {
        await api.patch(`/weighings/${editingId}`, payload);
        toast.success("Scarico aggiornato con successo");
      } else {
        await api.post(`/shifts/${shift.id}/weighings`, payload);
        toast.success("Nuovo scarico registrato con successo! ⚖️");
      }

      resetForm();
      await loadWeighings();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Errore nel salvataggio dello scarico");
    } finally {
      setSaving(false);
    }
  };

  const totalShiftNetWeight = useMemo(() => {
    return weighings.reduce((sum, w) => sum + (w.net_weight || 0), 0);
  }, [weighings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
        <DialogHeader className="text-left pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
            <Scale size={16} />
            <span>Gestione Pesi & Scarichi Turno</span>
          </div>
          <DialogTitle className="text-lg sm:text-xl font-head font-extrabold flex items-center justify-between gap-2 mt-1">
            <span>Scarichi Rifiuti</span>
            {weighings.length > 0 && (
              <span className="text-xs font-mono font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                Totale: {totalShiftNetWeight.toLocaleString("it-IT")} kg ({(totalShiftNetWeight / 1000).toFixed(2)} t)
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Registra i conferimenti effettuati per questo turno. Inserisci il <b>peso netto</b> comunicato dall'operatore della pesa.
          </DialogDescription>
        </DialogHeader>

        {/* Lista degli scarichi già effettuati nel turno */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>Scarichi del Turno ({weighings.length})</span>
            </h4>
            {editingId && (
              <Button size="xs" variant="ghost" onClick={resetForm} className="text-xs h-7 text-primary font-bold">
                <Plus size={13} className="mr-1" /> Nuovo scarico
              </Button>
            )}
          </div>

          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Caricamento scarichi...</div>
          ) : weighings.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground bg-secondary/20">
              Nessuno scarico ancora registrato per questo turno. Compila il modulo sotto per inserire la prima pesata.
            </div>
          ) : (
            <div className="space-y-2">
              {weighings.map((w) => (
                <div
                  key={w.id}
                  className={`p-3 rounded-xl border transition-all text-xs flex items-center justify-between gap-3 ${
                    editingId === w.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">
                        Scarico #{w.discharge_number}:{" "}
                        <span className="text-primary font-mono text-sm">{w.net_weight.toLocaleString("it-IT")} kg</span>
                      </span>
                      {w.destination && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-medium flex items-center gap-1">
                          <Building2 size={10} /> {w.destination}
                        </span>
                      )}
                      {w.waste_type && (
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium flex items-center gap-1">
                          <Tag size={10} /> {w.waste_type}
                        </span>
                      )}
                    </div>

                    {(w.entry_time || w.exit_time || w.duration_minutes) && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <Clock size={12} className="text-amber-500" />
                        <span>
                          {w.entry_time ? `Entrata ${w.entry_time}` : ""}{" "}
                          {w.exit_time ? `→ Uscita ${w.exit_time}` : ""}
                          {w.duration_minutes !== null && w.duration_minutes !== undefined && (
                            <b className="text-foreground ml-1">({w.duration_minutes} min in pesa)</b>
                          )}
                        </span>
                      </div>
                    )}

                    {w.notes && (
                      <div className="text-[11px] text-muted-foreground italic truncate">
                        "{w.notes}"
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEdit(w)}
                      title="Modifica scarico"
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(w.id)}
                      title="Elimina scarico"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form di inserimento o modifica */}
        <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              {editingId ? (
                <>
                  <Edit2 size={13} />
                  <span>Modifica Scarico #{weighings.find(w => w.id === editingId)?.discharge_number || ""}</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>Nuovo Scarico #{weighings.length + 1}</span>
                </>
              )}
            </h4>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] text-muted-foreground hover:underline"
              >
                Annulla e crea nuovo
              </button>
            )}
          </div>

          {/* Campo Peso Netto */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center justify-between">
              <span>Peso Netto Rifiuti *</span>
              <span className="text-[11px] font-normal text-muted-foreground">Comunicato dalla pesa</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="1"
                required
                value={netWeight}
                onChange={(e) => setNetWeight(e.target.value)}
                placeholder="Es. 2450"
                className="w-full h-11 pl-3 pr-12 text-base font-bold font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <span className="absolute right-3.5 top-3 text-xs font-bold text-muted-foreground pointer-events-none">
                KG
              </span>
            </div>
          </div>

          {/* Impianto o CDR */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Building2 size={13} className="text-primary" />
              <span>Impianto / CDR di Scarico</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_FACILITIES.map((fac) => (
                <button
                  type="button"
                  key={fac}
                  onClick={() => setDestination(fac)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    destination === fac
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background border-border text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {fac}
                </button>
              ))}
            </div>
            {destination === "Altro..." && (
              <input
                type="text"
                value={customDestination}
                onChange={(e) => setCustomDestination(e.target.value)}
                placeholder="Specifica nome impianto o CDR..."
                className="w-full h-9 px-3 text-xs rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none mt-1.5"
              />
            )}
          </div>

          {/* Tipologia Rifiuto (opzionale) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Tag size={13} className="text-primary" />
              <span>Tipologia Rifiuto (Opzionale)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_WASTE_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setWasteType(wasteType === type ? "" : type)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    wasteType === type
                      ? "bg-secondary text-secondary-foreground border-foreground/30 font-bold"
                      : "bg-background border-border text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {wasteType === "Altro" && (
              <input
                type="text"
                value={customWasteType}
                onChange={(e) => setCustomWasteType(e.target.value)}
                placeholder="Specifica tipologia rifiuto..."
                className="w-full h-9 px-3 text-xs rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none mt-1.5"
              />
            )}
          </div>

          {/* Tempo Trascorso in Pesa (facoltativo con pulsanti smart) */}
          <div className="p-3 rounded-xl border border-border bg-secondary/15 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Clock size={13} className="text-amber-500" />
                <span>Tempo in Pesa (Facoltativo)</span>
              </label>
              {liveDuration !== null && (
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  ⏱️ Tempo calcolato: {liveDuration} min
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Entrata in pesa */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Orario Ingresso:</span>
                  <button
                    type="button"
                    onClick={() => setEntryTime(getCurrentTimeStr())}
                    className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    🟢 Entrato ORA
                  </button>
                </div>
                <input
                  type="time"
                  value={entryTime}
                  onChange={(e) => setEntryTime(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              {/* Uscita da pesa */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Orario Uscita:</span>
                  <button
                    type="button"
                    onClick={() => setExitTime(getCurrentTimeStr())}
                    className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5"
                  >
                    🔴 Uscito ORA
                  </button>
                </div>
                <input
                  type="time"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Note facoltative */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Note / Osservazioni (Opzionale)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Coda in pesa, carico compatto, cassone pieno..."
              className="w-full h-9 px-3 text-xs rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Chiudi
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-10 px-5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? "Salvataggio..." : editingId ? "Salva Modifiche Scarico" : "Salva Scarico"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
