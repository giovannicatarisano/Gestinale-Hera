import { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { Bell, BellRing, CheckCheck, ArrowLeftRight, CalendarClock, X } from "lucide-react";
import { Button } from "./ui/button";

const KIND_ICON = {
  swap: <ArrowLeftRight size={13} className="text-primary flex-shrink-0" />,
  shift: <CalendarClock size={13} className="text-primary flex-shrink-0" />,
};

export default function NotificationsPanel() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/notifications");
      setNotifs(r.data || []);
    } catch { /* silently fail */ }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const unread = notifs.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unreadIds = notifs.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    try {
      await api.post("/notifications/read", { ids: unreadIds });
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* silently fail */ }
  };

  const markOne = async (id) => {
    try {
      await api.post("/notifications/read", { ids: [id] });
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch { /* silently fail */ }
  };

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "ora";
    if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        id="notifications-btn"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className="relative h-9 w-9 rounded-sm flex items-center justify-center border border-border bg-card hover:bg-secondary transition-colors"
        aria-label="Notifiche"
      >
        {unread > 0 ? (
          <BellRing size={17} className="text-primary animate-[wiggle_0.5s_ease-in-out]" />
        ) : (
          <Bell size={17} className="text-muted-foreground" />
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          id="notifications-panel"
          className="absolute right-0 top-11 z-50 w-[340px] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-sm shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-primary" />
              <span className="font-head font-bold text-sm tracking-tight">Notifiche</span>
              {unread > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-1 rounded-sm hover:bg-secondary">
                  <CheckCheck size={12} /> Segna lette
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-sm hover:bg-secondary text-muted-foreground">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                Nessuna notifica
              </div>
            ) : (
              notifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markOne(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/50 ${n.read ? "opacity-60" : "bg-primary/5"}`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {KIND_ICON[n.kind] || KIND_ICON.shift}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${n.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
