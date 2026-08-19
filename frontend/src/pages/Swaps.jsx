import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { ArrowLeftRight, Check, X, Clock, UserCheck, ShieldCheck, AlertCircle } from "lucide-react";

// Multi-step approval statuses
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
  // Legacy fallback
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

      {/* Legend */}
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
          {/* Active requests */}
          {actionable.length > 0 && (
            <div className="space-y-3">
              <div className="overline text-muted-foreground text-[10px]">Da gestire</div>
              {actionable.map((r) => <SwapCard key={r.id} r={r} onDecide={decide} />)}
            </div>
          )}

          {/* Decided */}
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
    <div className="border border-border bg-card rounded-sm p-3.5 sm:p-4 shadow-sm" data-testid={`swap-row-${r.id}`}>
      {/* Status row */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm font-bold ${st.cls}`}>
            {st.icon} {st.label}
          </span>
          {r.kind === "week" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm font-bold bg-primary text-primary-foreground">
              📅 Tutta la Settimana
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground truncate">{r.shift_label}</span>
      </div>

      {/* Driver row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-1">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-sm bg-secondary flex items-center justify-center font-head font-bold text-xs shrink-0">{initials(r.from_name)}</div>
          <div>
            <div className="text-sm font-semibold leading-none">{r.from_name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">cedente</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1 sm:pl-0">
          <ArrowLeftRight size={14} className="text-primary" />
          <span>vuole cedere a</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs shrink-0">{initials(r.to_name)}</div>
          <div>
            <div className="text-sm font-semibold leading-none">{r.to_name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">ricevente</div>
          </div>
        </div>
      </div>

      {/* Note */}
      {r.note && <div className="text-xs text-muted-foreground mt-2 italic bg-secondary/30 p-2 rounded-sm">"{r.note}"</div>}

      {/* Status description */}
      {st.desc && (
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground bg-secondary/20 px-2.5 py-1.5 rounded-sm">
          <AlertCircle size={11} className="shrink-0" />
          {st.desc}
        </div>
      )}

      {/* Approval steps indicator */}
      <div className="flex items-center gap-2 mt-3">
        <Step
          label="Collega"
          icon={<UserCheck size={12} />}
          state={r.driver_approved === true ? "done" : r.driver_approved === false ? "rejected" : "pending"}
        />
        <div className="flex-1 h-px bg-border" />
        <Step
          label="Admin"
          icon={<ShieldCheck size={12} />}
          state={r.admin_approved === true ? "done" : r.admin_approved === false ? "rejected" : r.driver_approved === true ? "ready" : "locked"}
        />
      </div>

      {/* Admin action buttons — only shown when driver has accepted */}
      {canAdminAct && (
        <div className="flex gap-2 mt-4">
          <Button
            size="sm"
            className="rounded-sm bg-primary hover:bg-primary/90 flex-1 h-10 font-semibold text-xs sm:text-sm"
            data-testid={`approve-swap-${r.id}`}
            onClick={() => onDecide(r.id, "approved")}
          >
            <Check size={14} className="mr-1.5" /> Approva definitivamente
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm text-destructive hover:bg-destructive/10 flex-1 h-10 font-semibold text-xs sm:text-sm"
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
