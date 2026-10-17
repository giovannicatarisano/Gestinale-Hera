import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { ArrowLeftRight, Check, X, Clock, UserCheck, ShieldCheck, AlertCircle } from "lucide-react";

// Stati di approvazione a più passaggi
const STATUS = {
  pending_driver: {
    label: "In attesa del collega",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: <Clock size={11} />,
    desc: "Il collega deve accettare o rifiutare",
  },
  pending_admin: {
    label: "In attesa dell'admin",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <UserCheck size={11} />,
    desc: "Il collega ha accettato — in attesa dell'approvazione admin",
  },
  approved: {
    label: "Approvato ✅",
    cls: "bg-primary/15 text-primary",
    icon: <Check size={11} />,
    desc: "Cambio completato",
  },
  rejected: {
    label: "Rifiutato ❌",
    cls: "bg-destructive/15 text-destructive",
    icon: <X size={11} />,
    desc: "Richiesta rifiutata",
  },
  // Fallback per compatibilità
  pending: {
    label: "In attesa",
    cls: "bg-orange-100 text-orange-700",
    icon: <Clock size={11} />,
    desc: "",
  },
};

export default function Swaps() {
  const [rows, setRows] = useState([]);

  const load = useCallback(() =>
    api.get("/swap-requests").then((r) => setRows(r.data)).catch(() => {}), []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("hera:refresh", onRefresh);
    return () => window.removeEventListener("hera:refresh", onRefresh);
  }, [load]);

  const decide = async (id, status) => {
    try {
      await api.patch(`/swap-requests/${id}`, { status });
      toast.success(status === "approved" ? "✅ Cambio approvato e turno aggiornato" : "Cambio rifiutato");
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const actionable = rows.filter((r) => r.status === "pending_admin" || r.status === "pending" || r.status === "pending_driver");
  const decided = rows.filter((r) => r.status === "approved" || r.status === "rejected");

  return (
    <div className="space-y-5">
      <div>
        <div className="overline text-primary mb-0.5 flex items-center gap-1.5"><ArrowLeftRight size={13} /> Richieste di cambio turno</div>
        <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter flex items-center gap-2.5">
          Scambi{" "}
          <span className="font-mono text-xs sm:text-sm px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">
            {actionable.length} da gestire
          </span>
        </h1>
      </div>

      {/* Legenda stati */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(STATUS).filter(([k]) => k !== "pending").map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${v.cls}`}>
            {v.icon} {v.label}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-muted-foreground bg-card">
          Nessuna richiesta di cambio.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Richieste attive in attesa */}
          {actionable.length > 0 && (
            <div className="space-y-3">
              <div className="overline text-muted-foreground text-[10px]">Da gestire</div>
              {actionable.map((r) => <SwapCard key={r.id} r={r} onDecide={decide} />)}
            </div>
          )}

          {/* Storico richieste concluse */}
          {decided.length > 0 && (
            <div className="space-y-3">
              <div className="overline text-muted-foreground text-[10px]">Storico</div>
              {decided.map((r) => <SwapCard key={r.id} r={r} onDecide={decide} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwapCard({ r, onDecide }) {
  const st = STATUS[r.status] || STATUS.pending;
  const canAdminAct = r.status === "pending_admin";

  return (
    <div className="group relative bg-card border border-border hover:border-foreground/40 rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all duration-200" data-testid={`swap-row-${r.id}`}>
      {/* Riga stato */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-full font-bold border shadow-2xs ${st.cls}`}>
            {st.icon} {st.label}
          </span>
          {r.kind === "week" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground shadow-2xs">
              📅 Tutta la Settimana
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground truncate">{r.shift_label}</span>
      </div>

      {/* Riga autisti coinvolti */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-1.5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center font-head font-bold text-xs shrink-0 shadow-2xs border border-border">{initials(r.from_name)}</div>
          <div>
            <div className="text-sm font-bold leading-none text-foreground">{r.from_name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">cedente</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1 sm:pl-0 font-medium">
          <ArrowLeftRight size={14} className="text-primary" />
          <span>vuole cedere a</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs shrink-0 shadow-2xs">{initials(r.to_name)}</div>
          <div>
            <div className="text-sm font-bold leading-none text-foreground">{r.to_name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">ricevente</div>
          </div>
        </div>
      </div>

      {/* Note e motivazioni */}
      {r.note && <div className="text-xs text-muted-foreground mt-2 italic bg-secondary/30 p-2 rounded-sm">"{r.note}"</div>}

      {/* Descrizione dettagliata dello stato */}
      {st.desc && (
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground bg-secondary/20 px-2.5 py-1.5 rounded-sm">
          <AlertCircle size={11} className="shrink-0" />
          {st.desc}
        </div>
      )}

      {/* Indicatore degli stati di avanzamento approvazione */}
      <div className="flex items-center gap-2 mt-3">
        <Step
          label="Collega"
          icon={<UserCheck size={12} />}
          state={r.driver_approved === true ? "done" : r.driver_approved === false ? "rejected" : "pending"}
        />
        <div className="flex-1 h-px bg-border" />
        <Step
          label={r.decided_by ? (r.decided_by_role === "assistant" ? "Assistente" : "Admin") : "Staff"}
          icon={<ShieldCheck size={12} />}
          state={r.admin_approved === true ? "done" : r.admin_approved === false ? "rejected" : r.driver_approved === true ? "ready" : "locked"}
        />
      </div>

      {/* Tracciabilità decisione coordinatore */}
      {r.decided_by && (
        <div className="text-[11px] text-muted-foreground mt-2 bg-secondary/40 px-2.5 py-1 rounded-sm border border-border/40 flex items-center justify-between flex-wrap gap-1">
          <span>
            {r.admin_approved ? "Approvato da:" : "Rifiutato da:"}{" "}
            <strong className="text-foreground">{r.decided_by}</strong> ({r.decided_by_role === "assistant" ? "Assistente" : "Amministratore"})
          </span>
          {r.decided_at && (
            <span className="font-mono text-[10px]">
              {new Date(r.decided_at).toLocaleString("it-IT", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
              })}
            </span>
          )}
        </div>
      )}

      {/* Pulsanti di azione per il coordinatore (visibili solo dopo l'accettazione del collega) */}
      {canAdminAct && (
        <div className="flex gap-2 mt-4 pt-2 border-t border-border/40">
          <Button
            size="sm"
            className="rounded-xl bg-primary hover:bg-primary/90 flex-1 h-10 font-semibold text-xs sm:text-sm shadow-sm"
            data-testid={`approve-swap-${r.id}`}
            onClick={() => onDecide(r.id, "approved")}
          >
            <Check size={14} className="mr-1.5" /> Approva definitivamente
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl text-destructive hover:bg-destructive/10 border-border/80 hover:border-destructive/30 flex-1 h-10 font-semibold text-xs sm:text-sm shadow-2xs"
            data-testid={`reject-swap-${r.id}`}
            onClick={() => onDecide(r.id, "rejected")}
          >
            <X size={14} className="mr-1.5" /> Rifiuta
          </Button>
        </div>
      )}
    </div>
  );
}

function Step({ label, icon, state }) {
  const styles = {
    done: "bg-primary text-primary-foreground",
    rejected: "bg-destructive/15 text-destructive border border-destructive/30",
    ready: "bg-secondary text-foreground border border-primary/40 animate-pulse",
    pending: "bg-secondary/50 text-muted-foreground",
    locked: "bg-secondary/30 text-muted-foreground/50",
  };
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-semibold ${styles[state] || styles.pending}`}>
      {icon}
      <span>{label}</span>
      {state === "done" && <Check size={9} />}
      {state === "rejected" && <X size={9} />}
    </div>
  );
}
