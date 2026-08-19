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
    <div className="space-y-5">
      <div>
        <div className="overline text-primary mb-0.5 flex items-center gap-1.5"><ArrowLeftRight size={13} /> Richieste di cambio turno</div>
        <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter flex items-center gap-2.5">
          Scambi <span className="font-mono text-xs sm:text-sm px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">{pending.length} in attesa</span>
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
              <div key={r.id} className="border border-border bg-card rounded-sm p-3.5 sm:p-4 shadow-xs" data-testid={`swap-row-${r.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`overline text-[10px] px-2 py-0.5 rounded-sm font-semibold ${st.cls}`}>{st.label}</span>
                  <span className="font-mono text-xs text-muted-foreground truncate">{r.shift_label}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3 py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-sm bg-secondary flex items-center justify-center font-head font-bold text-xs">{initials(r.from_name)}</div>
                    <span className="text-sm font-semibold">{r.from_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-2 sm:pl-0">
                    <ArrowLeftRight size={14} className="text-primary" />
                    <span>propone lo scambio a</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-xs">{initials(r.to_name)}</div>
                    <span className="text-sm font-semibold">{r.to_name}</span>
                  </div>
                </div>
                {r.note && <div className="text-xs text-muted-foreground mt-2 italic bg-secondary/30 p-2 rounded-sm">"{r.note}"</div>}
                {r.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" className="rounded-sm bg-primary hover:bg-primary/90 flex-1 h-10 font-semibold text-xs sm:text-sm" data-testid={`approve-swap-${r.id}`} onClick={() => decide(r.id, "approved")}>
                      <Check size={14} className="mr-1.5" /> Approva
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-sm text-destructive hover:bg-destructive/10 flex-1 h-10 font-semibold text-xs sm:text-sm" data-testid={`reject-swap-${r.id}`} onClick={() => decide(r.id, "rejected")}>
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
