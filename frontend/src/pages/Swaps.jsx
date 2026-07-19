import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { ArrowLeftRight, Check, X, Clock } from "lucide-react";

const STATUS = {
  pending: { label: "In attesa", cls: "bg-orange-100 text-orange-700" },
  approved: { label: "Approvato", cls: "bg-primary/15 text-primary" },
  rejected: { label: "Rifiutato", cls: "bg-destructive/15 text-destructive" },
};

export default function Swaps() {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/swap-requests").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const decide = async (id, status) => {
    try {
      await api.patch(`/swap-requests/${id}`, { status });
      toast.success(status === "approved" ? "Cambio approvato" : "Cambio rifiutato");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <div className="overline text-primary mb-1 flex items-center gap-1.5"><ArrowLeftRight size={13} /> Richieste di cambio turno</div>
        <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tighter flex items-center gap-3">
          Scambi <span className="font-mono text-base text-muted-foreground">{pending.length} in attesa</span>
        </h1>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-muted-foreground bg-card">
          Nessuna richiesta di cambio.
        </div>
      ) : (
        <div className="space-y-3">
          {[...pending, ...decided].map((r) => {
            const st = STATUS[r.status] || STATUS.pending;
            return (
              <div key={r.id} className="border border-border bg-card rounded-sm p-4" data-testid={`swap-row-${r.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`overline px-1.5 py-0.5 rounded-sm ${st.cls}`}>{st.label}</span>
                  <span className="font-mono text-xs text-muted-foreground truncate">{r.shift_label}</span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-sm bg-secondary flex items-center justify-center font-head font-bold text-[10px]">{initials(r.from_name)}</div>
                    <span className="text-sm font-medium">{r.from_name}</span>
                  </div>
                  <ArrowLeftRight size={16} className="text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-[10px]">{initials(r.to_name)}</div>
                    <span className="text-sm font-medium">{r.to_name}</span>
                  </div>
                </div>
                {r.note && <div className="text-xs text-muted-foreground mt-2 italic">"{r.note}"</div>}
                {r.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" className="rounded-sm bg-primary hover:bg-primary/90 flex-1" data-testid={`approve-swap-${r.id}`} onClick={() => decide(r.id, "approved")}>
                      <Check size={14} className="mr-1.5" /> Approva
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-sm text-destructive hover:bg-destructive/10 flex-1" data-testid={`reject-swap-${r.id}`} onClick={() => decide(r.id, "rejected")}>
                      <X size={14} className="mr-1.5" /> Rifiuta
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
