import { useState, useEffect } from "react";
import api, { apiError } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Check, X as XIcon, AlertTriangle, ShieldCheck, Fuel, Clock, Gauge } from "lucide-react";

export const DEFAULT_CHECKLIST_ITEMS = [
  { id: 1, title: "Controllo integrità pedane cabina e maniglie salita" },
  { id: 2, title: "Controllo spie di segnalazione anomalie cruscotto mezzo e pannello controllo attrezzatura (assenza spie anomalie accese/messaggi di errore)" },
  { id: 3, title: "Controllo spie relative ai sistemi di informazione e avvertimento (assenza spie anomalie accese/messaggi di errore)" },
  { id: 4, title: "Funzionamento delle telecamere (se presenti)" },
  { id: 5, title: "Funzionamento dell'impianto frenante, compreso il freno di stazionamento" },
  { id: 6, title: "Integrità degli specchi retrovisori e di quelli esterni e funzionamento dei tergicristalli" },
  { id: 7, title: "Presenza del triangolo di emergenza" },
  { id: 8, title: "Controllo visivo che il mezzo e la relativa attrezzatura siano in sagoma" },
  { id: 9, title: "Controllo visivo presenza e integrità sistemi di informazione ed avvertimento (se presenti)" },
  { id: 10, title: "Per i veicoli carico posteriore, controllo integrità delle pedane posteriori (uomo presente) e del sistema di comunicazione tra autista e uomo in pedana" },
  { id: 11, title: "Controllo visivo dello stato dei pneumatici, usura e deformazioni visibili e dei relativi indicatori di serraggio se presenti" },
  { id: 12, title: "Funzionamento luci e segnalatori" },
  { id: 13, title: "Controllo visivo eventuali perdite liquidi/aria" },
  { id: 14, title: "Estintore (se presente): immediatamente utilizzabile, dispositivo di sicurezza per azionamenti accidentali correttamente inserito, indicatore di pressione indicante un valore compreso all'interno del campo verde" },
  { id: 15, title: "Pacchetto di medicazione" },
];

export default function ChecklistModal({ open, onOpenChange, shift, mode = "start", onSuccess }) {
  const isStart = mode === "start";

  const [items, setItems] = useState([]);
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Campi specifici per fine turno
  const [fuelDone, setFuelDone] = useState(true);
  const [fuelNotes, setFuelNotes] = useState("");
  const [serviceCompleted, setServiceCompleted] = useState(true);
  const [serviceNotes, setServiceNotes] = useState("");

  useEffect(() => {
    if (!open) return;

    // Se esiste già una compilazione precedente per questo step, la carichiamo
    const existing = isStart ? shift?.start_checklist : shift?.end_checklist;
    if (existing && existing.items && existing.items.length > 0) {
      setItems(existing.items);
      setKm(isStart ? (existing.km_start ?? "") : (existing.km_end ?? ""));
      setNotes(existing.notes || "");
      if (!isStart) {
        setFuelDone(existing.fuel_done ?? true);
        setFuelNotes(existing.fuel_notes || "");
        setServiceCompleted(existing.service_completed ?? true);
        setServiceNotes(existing.service_notes || "");
      }
    } else {
      // Inizializza con i 15 punti predefiniti VUOTI (senza alcuna selezione predefinita)
      setItems(
        DEFAULT_CHECKLIST_ITEMS.map((item) => ({
          id: item.id,
          title: item.title,
          status: null, // Parte non selezionato!
          notes: "",
        }))
      );
      setKm("");
      setNotes("");
      setFuelDone(true);
      setFuelNotes("");
      setServiceCompleted(true);
      setServiceNotes("");
    }
  }, [open, shift, isStart]);

  const setItemStatus = (id, status) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: it.status === status ? null : status } : it))
    );
  };

  const setItemNote = (id, noteVal) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, notes: noteVal } : it))
    );
  };

  const handleSetAllConform = () => {
    setItems((prev) => prev.map((it) => ({ ...it, status: "C", notes: "" })));
    toast.success("Tutte le voci impostate su 'Conforme'");
  };

  const completedCount = items.filter((it) => it.status === "C" || it.status === "NC").length;
  const anomaliesCount = items.filter((it) => it.status === "NC").length;

  const handleSubmit = async () => {
    // 1. Verifica che tutte e 15 le voci siano state valutate
    const unselected = items.filter((it) => it.status !== "C" && it.status !== "NC");
    if (unselected.length > 0) {
      toast.error(`Devi completare tutte le voci: restano ${unselected.length} controlli da verificare!`);
      return;
    }

    // 2. Validazioni specifiche per fine turno
    if (!isStart) {
      if (!fuelDone && !fuelNotes.trim()) {
        toast.error("Specifica il motivo del mancato rifornimento");
        return;
      }
      if (!serviceCompleted && !serviceNotes.trim()) {
        toast.error("Specifica le vie saltate o il motivo del giro incompleto");
        return;
      }
    }

    // 3. Verifica che per ogni NC ci sia una nota
    const ncWithoutNotes = items.filter((it) => it.status === "NC" && !it.notes?.trim());
    if (ncWithoutNotes.length > 0) {
      toast.error(`Aggiungi una breve nota per le voci Non Conformi (${ncWithoutNotes.length} senza motivo)`);
      return;
    }

    setSubmitting(true);
    try {
      if (isStart) {
        await api.post(`/shifts/${shift.id}/start-checklist`, {
          km_start: km ? parseInt(km, 10) : null,
          items,
          notes: notes.trim(),
        });
        toast.success("Checklist di Inizio Servizio registrata con successo!");
      } else {
        await api.post(`/shifts/${shift.id}/end-checklist`, {
          km_end: km ? parseInt(km, 10) : null,
          fuel_done: fuelDone,
          fuel_notes: fuelNotes.trim(),
          service_completed: serviceCompleted,
          service_notes: serviceNotes.trim(),
          items,
          notes: notes.trim(),
        });
        toast.success("Checklist di Fine Servizio e Riconsegna registrata!");
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore durante il salvataggio della scheda");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 rounded-2xl gap-0 overflow-hidden bg-card border-border shadow-xl">
        {/* Header Modale */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-secondary/30 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold ${
                isStart ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
              }`}>
                {isStart ? <ShieldCheck size={20} /> : <Clock size={20} />}
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-head font-black tracking-tight text-foreground">
                  {isStart ? "Scheda Controllo Inizio Servizio" : "Scheda Controllo Fine Servizio"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {isStart
                    ? "Controlli pre-partenza veicolo e attrezzatura (Modulo Ufficiale HERA)"
                    : "Verifica riconsegna mezzo, rifornimento carburante e completamento servizio"}
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSetAllConform}
              className="rounded-xl text-xs font-semibold h-8 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 shrink-0 hidden sm:flex"
            >
              <Check size={14} className="mr-1" /> Tutto Conforme
            </Button>
          </div>

          <div className="sm:hidden mt-2 pt-2 border-t border-border/50 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSetAllConform}
              className="rounded-xl text-xs font-semibold h-7 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 w-full"
            >
              <Check size={14} className="mr-1" /> Imposta Tutto su Conforme
            </Button>
          </div>
        </DialogHeader>

        {/* Corpo scrollabile */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 board-scroll">
          {/* Sezione Chilometri Mezzo */}
          <div className="p-3.5 rounded-xl border border-border bg-secondary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Gauge size={18} className="text-primary shrink-0" />
              <div>
                <div className="text-xs font-bold text-foreground">
                  {isStart ? "Chilometri di Inizio Turno" : "Chilometri di Rientro (Fine Turno)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {isStart ? "Rilevati dal tachimetro alla partenza" : "Servono a conteggiare i km percorsi sul giro"}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-44">
              <input
                type="number"
                placeholder="es. 124500"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="w-full h-9 px-3 text-xs sm:text-sm rounded-xl border border-border bg-background font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Sezione di Fine Turno: Rifornimento e Giro */}
          {!isStart && (
            <div className="space-y-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <div className="font-bold text-xs uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <Fuel size={14} /> Chiusura Operativa Giro
              </div>

              {/* Rifornimento */}
              <div className="space-y-2 pt-1 border-t border-blue-500/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Rifornimento effettuato?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFuelDone(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        fuelDone
                          ? "bg-emerald-500 text-white shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      ✓ Sì
                    </button>
                    <button
                      type="button"
                      onClick={() => setFuelDone(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        !fuelDone
                          ? "bg-rose-500 text-white shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      ✗ No
                    </button>
                  </div>
                </div>

                {!fuelDone && (
                  <input
                    type="text"
                    placeholder="Indica il motivo del mancato rifornimento (es. pompa guasta, orario)..."
                    value={fuelNotes}
                    onChange={(e) => setFuelNotes(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-rose-500/40 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                )}
              </div>

              {/* Giro Completato */}
              <div className="space-y-2 pt-2 border-t border-blue-500/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Giro completato regolarmente?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setServiceCompleted(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        serviceCompleted
                          ? "bg-emerald-500 text-white shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      ✓ Sì
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceCompleted(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        !serviceCompleted
                          ? "bg-rose-500 text-white shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      ✗ No
                    </button>
                  </div>
                </div>

                {!serviceCompleted && (
                  <input
                    type="text"
                    placeholder="Indica vie saltate e motivo (es. via Roma bloccata da lavori)..."
                    value={serviceNotes}
                    onChange={(e) => setServiceNotes(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-rose-500/40 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                )}
              </div>
            </div>
          )}

          {/* I 15 PUNTI DI CONTROLLO */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Verifiche Mezzo ({completedCount}/15 compilate)
              </span>
              {anomaliesCount > 0 && (
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle size={12} /> {anomaliesCount} Non Conformità
                </span>
              )}
            </div>

            <div className="space-y-2">
              {items.map((it) => {
                const isConform = it.status === "C";
                const isNonConform = it.status === "NC";
                const isUnset = it.status === null;

                return (
                  <div
                    key={it.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isUnset
                        ? "border-border/50 bg-secondary/10"
                        : isConform
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-rose-500/40 bg-rose-500/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 text-xs">
                        <span className="font-mono font-bold text-muted-foreground text-[11px] shrink-0 mt-0.5">
                          {it.id}.
                        </span>
                        <span className="font-medium text-foreground leading-snug">
                          {it.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Bottone Conforme (C) */}
                        <button
                          type="button"
                          onClick={() => setItemStatus(it.id, "C")}
                          className={`h-7 px-3 rounded-lg text-xs font-bold border transition-all ${
                            isConform
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs font-black"
                              : "bg-background border-border text-muted-foreground hover:bg-secondary"
                          }`}
                          title="Conforme"
                        >
                          C
                        </button>

                        {/* Bottone Non Conforme (NC) */}
                        <button
                          type="button"
                          onClick={() => setItemStatus(it.id, "NC")}
                          className={`h-7 px-3 rounded-lg text-xs font-bold border transition-all ${
                            isNonConform
                              ? "bg-rose-600 border-rose-600 text-white shadow-2xs font-black"
                              : "bg-background border-border text-muted-foreground hover:bg-secondary"
                          }`}
                          title="Non Conforme"
                        >
                          NC
                        </button>
                      </div>
                    </div>

                    {/* Campo note se Non Conforme */}
                    {isNonConform && (
                      <div className="mt-2.5 pt-2 border-t border-rose-500/20">
                        <input
                          type="text"
                          placeholder="Specifica anomalia o difetto riscontrato (obbligatorio)..."
                          value={it.notes || ""}
                          onChange={(e) => setItemNote(it.id, e.target.value)}
                          className="w-full h-8 px-2.5 text-xs rounded-lg border border-rose-500/40 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Note generali opzionali */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-muted-foreground">Note generali aggiuntive (opzionale):</label>
            <textarea
              rows={2}
              placeholder="Eventuali annotazioni per l'officina o il coordinatore..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
        </div>

        {/* Footer con pulsanti di azione */}
        <DialogFooter className="p-3.5 sm:p-4 border-t border-border bg-secondary/30 shrink-0 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-xl text-xs font-semibold text-muted-foreground"
          >
            Annulla
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className={`rounded-xl text-xs font-bold px-4 gap-1.5 shadow-sm text-white ${
              completedCount < 15
                ? "bg-slate-500 hover:bg-slate-600 opacity-80"
                : isStart
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {submitting
              ? "Salvataggio..."
              : completedCount < 15
              ? `Compila tutte le voci (${completedCount}/15)`
              : isStart
              ? "✓ Convalida Inizio Servizio"
              : "✓ Invia Chiusura Turno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
