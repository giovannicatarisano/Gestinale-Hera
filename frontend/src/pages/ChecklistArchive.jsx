import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { weekKey, weekLabel } from "../lib/dates";
import { Button } from "../components/ui/button";
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Search,
  Filter,
  Users,
  Truck,
  Fuel,
  Printer,
  ChevronDown,
  X,
  Gauge,
  Clock,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";

export default function ChecklistArchive() {
  const [shifts, setShifts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtri
  const [selectedDriver, setSelectedDriver] = useState("");
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [search, setSearch] = useState("");

  // Dettaglio Scheda
  const [selectedShift, setSelectedShift] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [drvRes, vehRes, rtsRes, archRes] = await Promise.all([
        api.get("/drivers"),
        api.get("/vehicles"),
        api.get("/routes"),
        api.get(`/shifts/checklist-archive${onlyAnomalies ? "?only_anomalies=true" : ""}`),
      ]);

      setDrivers(drvRes.data || []);
      setVehicles(vehRes.data || []);
      setRoutes(rtsRes.data || []);
      setShifts(archRes.data || []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore nel caricamento dell'archivio");
    } finally {
      setLoading(false);
    }
  }, [onlyAnomalies]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const driverById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));

  // Filtro client-side per autista e ricerca libera
  const filteredShifts = shifts.filter((s) => {
    if (selectedDriver && s.driver_id !== selectedDriver) return false;
    if (search.trim()) {
      const query = search.toLowerCase();
      const drvName = (driverById[s.driver_id]?.name || "").toLowerCase();
      const vehName = (vehicleById[s.vehicle_id]?.name || "").toLowerCase();
      const ruteName = (routeById[s.route_id]?.name || "").toLowerCase();
      if (!drvName.includes(query) && !vehName.includes(query) && !ruteName.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const openDetail = (s) => {
    setSelectedShift(s);
    setModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-5 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
              <ClipboardCheck size={13} />
              Registro Digitale Verifiche Mezzi
            </span>
          </div>
          <h1 className="font-head font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight text-foreground">
            Archivio Checklist & Fine Turno
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Archivio storico delle 15 verifiche di inizio/fine servizio, chilometraggi, rifornimenti e completamento giri.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="rounded-xl font-medium h-9 px-3 gap-1.5 text-xs shadow-2xs border-border hover:bg-secondary"
          >
            Ricarica
          </Button>
        </div>
      </div>

      {/* Barra Filtri */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 no-print">
        {/* Ricerca per testo */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cerca autista, mezzo o giro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 text-xs sm:text-sm rounded-xl border border-border bg-card shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtro per Autista */}
        <select
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="h-10 px-3 text-xs sm:text-sm rounded-xl border border-border bg-card text-foreground font-medium shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Tutti gli Autisti</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {/* Toggle Solo Anomalie */}
        <button
          type="button"
          onClick={() => setOnlyAnomalies(!onlyAnomalies)}
          className={`h-10 px-3.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
            onlyAnomalies
              ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 shadow-2xs"
              : "bg-card border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <AlertTriangle size={14} />
          <span>Solo con Anomalie</span>
        </button>
      </div>

      {/* Tabella o Card Lista */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredShifts.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center bg-card">
          <ClipboardCheck size={32} className="mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm font-semibold text-foreground">Nessuna scheda checklist registrata per i filtri selezionati</p>
          <p className="text-xs text-muted-foreground mt-1">
            Le schede vengono archiviate automaticamente non appena gli autisti compilano l'inizio o la fine del turno dall'applicazione.
          </p>
        </div>
      ) : (
        <div className="border border-border/80 bg-card rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto board-scroll">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4">Data & Settimana</th>
                  <th className="py-3 px-4">Autista</th>
                  <th className="py-3 px-4">Giro / Mezzo</th>
                  <th className="py-3 px-4 text-center">Inizio Servizio</th>
                  <th className="py-3 px-4 text-center">Fine Servizio</th>
                  <th className="py-3 px-4 text-center">Km Percorsi</th>
                  <th className="py-3 px-4 text-center">Rifornimento</th>
                  <th className="py-3 px-4 text-center">Esito</th>
                  <th className="py-3 px-4 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredShifts.map((s) => {
                  const drv = driverById[s.driver_id];
                  const veh = vehicleById[s.vehicle_id];
                  const rute = routeById[s.route_id];
                  const start = s.start_checklist;
                  const end = s.end_checklist;

                  const hasAnomalies = start?.has_anomalies || end?.has_anomalies;

                  return (
                    <tr key={s.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        <div>Settimana {s.week_start}</div>
                        <div className="text-[11px] text-muted-foreground">Giorno {Number(s.day) + 1}</div>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} className="text-primary shrink-0" />
                          <span>{drv?.name || "Autista non assegnato"}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground">{rute?.name || "Giro non indicato"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                          <Truck size={12} />
                          <span>{veh?.name || "Mezzo fisso"} ({veh?.plate || "-"})</span>
                        </div>
                      </td>

                      {/* Inizio Servizio */}
                      <td className="py-3.5 px-4 text-center">
                        {start ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            start.has_anomalies
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          }`}>
                            {start.has_anomalies ? "⚠️ Con NC" : "✓ Conforme"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">Non registrato</span>
                        )}
                      </td>

                      {/* Fine Servizio */}
                      <td className="py-3.5 px-4 text-center">
                        {end ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            end.has_anomalies
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          }`}>
                            {end.has_anomalies ? "⚠️ Con Note" : "✓ Chiuso"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">In corso</span>
                        )}
                      </td>

                      {/* Km Percorsi */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-foreground">
                        {end?.km_percorsi !== undefined && end?.km_percorsi !== null ? (
                          <span>{end.km_percorsi} km</span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        )}
                      </td>

                      {/* Rifornimento */}
                      <td className="py-3.5 px-4 text-center">
                        {end ? (
                          end.fuel_done ? (
                            <span className="text-emerald-600 font-bold text-xs">✓ Sì</span>
                          ) : (
                            <span className="text-rose-600 font-bold text-xs" title={end.fuel_notes}>✗ No</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        )}
                      </td>

                      {/* Esito Generale */}
                      <td className="py-3.5 px-4 text-center">
                        {hasAnomalies ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600">
                            Anomalia
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600">
                            Regolare
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetail(s)}
                          className="rounded-xl h-8 text-xs font-semibold hover:bg-primary hover:text-primary-foreground"
                        >
                          Apri Scheda
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODALE SCHEDA UFFICIALE HERA STAMPABILE ================= */}
      {selectedShift && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden bg-card border-border shadow-2xl">
            <DialogHeader className="p-4 sm:p-5 border-b border-border bg-secondary/30 flex flex-row items-center justify-between shrink-0 no-print">
              <div>
                <DialogTitle className="text-base sm:text-lg font-head font-black tracking-tight text-foreground flex items-center gap-2">
                  <span>Scheda Ufficiale Controlli Mezzo HERA</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Visualizzazione conforme al registro di bordo cartaceo
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handlePrint} className="rounded-xl text-xs gap-1.5 font-semibold">
                  <Printer size={14} /> Stampa Scheda
                </Button>
              </div>
            </DialogHeader>

            {/* Contenuto Scheda */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 board-scroll print-area">
              {/* Intestazione Tabella */}
              <div className="border border-border/80 rounded-xl p-3.5 bg-secondary/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase font-bold">Autista In Servizio</div>
                  <div className="font-bold text-foreground text-sm">{driverById[selectedShift.driver_id]?.name || "Non assegnato"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase font-bold">Mezzo & Targa</div>
                  <div className="font-bold text-foreground text-sm font-mono">
                    {vehicleById[selectedShift.vehicle_id]?.name || "Mezzo"} - {vehicleById[selectedShift.vehicle_id]?.plate || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase font-bold">Giro di Raccolta</div>
                  <div className="font-bold text-foreground text-sm">{routeById[selectedShift.route_id]?.name || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase font-bold">Chilometri Registrati</div>
                  <div className="font-mono font-bold text-foreground text-xs">
                    Inizio: {selectedShift.start_checklist?.km_start ?? "-"} | Fine: {selectedShift.end_checklist?.km_end ?? "-"} ({selectedShift.end_checklist?.km_percorsi ?? 0} km)
                  </div>
                </div>
              </div>

              {/* Tabella 15 Controlli Hera (Identica al foglio cartaceo) */}
              <div className="border border-slate-700/60 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 bg-secondary/50 font-bold uppercase text-[10px] tracking-wider text-muted-foreground">
                      <th className="py-2.5 px-3 w-10 text-center">N°</th>
                      <th className="py-2.5 px-3">Controlli Effettuati</th>
                      <th className="py-2.5 px-2 text-center w-14 border-l border-slate-700/50">Inizio (C)</th>
                      <th className="py-2.5 px-2 text-center w-14">Inizio (NC)</th>
                      <th className="py-2.5 px-2 text-center w-14 border-l border-slate-700/50">Fine (C)</th>
                      <th className="py-2.5 px-2 text-center w-14">Fine (NC)</th>
                      <th className="py-2.5 px-3 border-l border-slate-700/50">Note / Segnalazione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(selectedShift.start_checklist?.items || selectedShift.end_checklist?.items || []).map((it, idx) => {
                      const startIt = selectedShift.start_checklist?.items?.find((x) => x.id === it.id);
                      const endIt = selectedShift.end_checklist?.items?.find((x) => x.id === it.id);

                      const isStartC = startIt?.status === "C";
                      const isStartNC = startIt?.status === "NC";
                      const isEndC = endIt?.status === "C";
                      const isEndNC = endIt?.status === "NC";

                      const note = startIt?.notes || endIt?.notes || "";

                      return (
                        <tr key={it.id} className="hover:bg-secondary/20">
                          <td className="py-2 px-3 font-mono font-bold text-center text-muted-foreground">{it.id}</td>
                          <td className="py-2 px-3 font-medium text-foreground leading-snug">{it.title}</td>

                          {/* Inizio C */}
                          <td className="py-2 px-2 text-center border-l border-border/50">
                            {isStartC && <span className="text-emerald-600 font-bold">✓</span>}
                          </td>
                          {/* Inizio NC */}
                          <td className="py-2 px-2 text-center">
                            {isStartNC && <span className="text-rose-600 font-black">NC</span>}
                          </td>

                          {/* Fine C */}
                          <td className="py-2 px-2 text-center border-l border-border/50">
                            {isEndC && <span className="text-emerald-600 font-bold">✓</span>}
                          </td>
                          {/* Fine NC */}
                          <td className="py-2 px-2 text-center">
                            {isEndNC && <span className="text-rose-600 font-black">NC</span>}
                          </td>

                          {/* Note */}
                          <td className="py-2 px-3 border-l border-border/50 text-[11px] italic text-muted-foreground">
                            {note || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Box Rifornimento & Servizio */}
              {selectedShift.end_checklist && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className={`p-3 rounded-xl border ${selectedShift.end_checklist.fuel_done ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                    <div className="font-bold text-foreground">⛽ Rifornimento Mezzo:</div>
                    <div className="mt-0.5">
                      {selectedShift.end_checklist.fuel_done ? "Effettuato regolarmente" : `NON effettuato (${selectedShift.end_checklist.fuel_notes || "Nessun motivo indicato"})`}
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${selectedShift.end_checklist.service_completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                    <div className="font-bold text-foreground">🗺️ Completamento Giro:</div>
                    <div className="mt-0.5">
                      {selectedShift.end_checklist.service_completed ? "Tutte le vie servite al 100%" : `Vie saltate / Anomalia: ${selectedShift.end_checklist.service_notes || "Nessun dettaglio"}`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
