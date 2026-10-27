import { useEffect, useState, useCallback, useMemo } from "react";
import api, { apiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Scale,
  CalendarDays,
  Search,
  Filter,
  Users,
  Truck,
  Building2,
  Clock,
  Printer,
  FileSpreadsheet,
  Trash2,
  Edit2,
  RefreshCw,
  X,
  TrendingUp,
  Tag
} from "lucide-react";

const ALL_WASTE_TYPES = [
  "Carta",
  "Cartone",
  "Plastica",
  "Vetro e Lattine",
  "Indifferenziato",
  "Verde e Sfalci",
  "Ingombranti",
  "Legno",
  "Altro"
];

export default function WeighingsArchive() {
  const [weighings, setWeighings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtri
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("");
  const [selectedWasteType, setSelectedWasteType] = useState("");
  const [search, setSearch] = useState("");

  // Modale Modifica Record (Staff)
  const [editingItem, setEditingItem] = useState(null);
  const [editWeight, setEditWeight] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editWasteType, setEditWasteType] = useState("");
  const [editEntryTime, setEditEntryTime] = useState("");
  const [editExitTime, setEditExitTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [drvRes, vehRes, wghRes] = await Promise.all([
        api.get("/drivers"),
        api.get("/vehicles"),
        api.get("/weighings", {
          params: {
            start_date: startDate || undefined,
            end_date: endDate || undefined,
            driver_id: selectedDriver || undefined,
            vehicle_id: selectedVehicle || undefined,
            destination: selectedDestination || undefined,
            waste_type: selectedWasteType || undefined,
          }
        }),
      ]);

      setDrivers(drvRes.data || []);
      setVehicles(vehRes.data || []);
      setWeighings(wghRes.data || []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Errore nel caricamento dell'archivio pesate");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedDriver, selectedVehicle, selectedDestination, selectedWasteType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtro locale rapido tramite barra di ricerca
  const filteredWeighings = useMemo(() => {
    if (!search.trim()) return weighings;
    const q = search.toLowerCase();
    return weighings.filter((w) => {
      const drv = (w.driver_name || "").toLowerCase();
      const veh = (w.vehicle_plate || w.vehicle_name || "").toLowerCase();
      const rt = (w.route_code || w.route_name || "").toLowerCase();
      const dst = (w.destination || "").toLowerCase();
      const wst = (w.waste_type || "").toLowerCase();
      const nts = (w.notes || "").toLowerCase();
      return drv.includes(q) || veh.includes(q) || rt.includes(q) || dst.includes(q) || wst.includes(q) || nts.includes(q);
    });
  }, [weighings, search]);

  // Statistiche e KPI
  const stats = useMemo(() => {
    const totalKg = filteredWeighings.reduce((sum, w) => sum + (w.net_weight || 0), 0);
    const count = filteredWeighings.length;
    const durations = filteredWeighings
      .map((w) => w.duration_minutes)
      .filter((d) => typeof d === "number" && d > 0);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    const uniqueFacilities = new Set(filteredWeighings.map((w) => w.destination).filter(Boolean)).size;

    return {
      totalKg,
      totalTon: (totalKg / 1000).toFixed(2),
      count,
      avgDuration,
      uniqueFacilities,
    };
  }, [filteredWeighings]);

  // Opzioni uniche per i filtri ricavate dai dati esistenti
  const destinationOptions = useMemo(() => {
    const fromData = weighings.map((w) => w.destination).filter(Boolean);
    return Array.from(new Set(["Akron", ...fromData])).sort();
  }, [weighings]);

  const wasteTypeOptions = useMemo(() => {
    const fromData = weighings.map((w) => w.waste_type).filter(Boolean);
    return Array.from(new Set([...ALL_WASTE_TYPES, ...fromData])).sort();
  }, [weighings]);

  // Filtri temporali rapidi
  const setQuickRange = (type) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === "today") {
      const todayStr = fmt(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === "week") {
      const curr = new Date(now);
      const first = curr.getDate() - (curr.getDay() === 0 ? 6 : curr.getDay() - 1);
      const firstDay = new Date(curr.setDate(first));
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);
      setStartDate(fmt(firstDay));
      setEndDate(fmt(lastDay));
    } else if (type === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(fmt(firstDay));
      setEndDate(fmt(lastDay));
    } else if (type === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  // Modifica record
  const handleOpenEdit = (w) => {
    setEditingItem(w);
    setEditWeight(String(w.net_weight || ""));
    setEditDestination(w.destination || "");
    setEditWasteType(w.waste_type || "");
    setEditEntryTime(w.entry_time || "");
    setEditExitTime(w.exit_time || "");
    setEditNotes(w.notes || "");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const wNum = parseFloat(editWeight.replace(",", "."));
    if (isNaN(wNum) || wNum <= 0) {
      toast.error("Inserisci un peso netto valido maggiore di 0");
      return;
    }

    if (!editWasteType.trim()) {
      toast.error("La tipologia di rifiuto è obbligatoria");
      return;
    }

    setSavingEdit(true);
    try {
      await api.patch(`/weighings/${editingItem.id}`, {
        net_weight: wNum,
        destination: (editDestination.trim() || "Akron"),
        waste_type: editWasteType.trim(),
        entry_time: editEntryTime,
        exit_time: editExitTime,
        notes: editNotes.trim(),
      });
      toast.success("Scarico aggiornato con successo");
      setEditingItem(null);
      await loadData();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Errore nella modifica dello scarico");
    } finally {
      setSavingEdit(false);
    }
  };

  // Eliminazione record
  const handleDelete = async (wid) => {
    if (!window.confirm("Sei sicuro di voler eliminare definitivamente questa pesata dall'archivio?")) return;
    try {
      await api.delete(`/weighings/${wid}`);
      toast.success("Scarico eliminato con successo");
      await loadData();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Errore durante l'eliminazione dello scarico");
    }
  };

  // Esportazione CSV
  const handleExportCSV = () => {
    if (filteredWeighings.length === 0) {
      toast.error("Nessun dato da esportare con i filtri correnti");
      return;
    }

    const headers = [
      "ID",
      "Data",
      "Progressivo Scarico",
      "Autista",
      "Targa Mezzo",
      "Modello Mezzo",
      "Codice Giro",
      "Impianto / CDR",
      "Tipologia Rifiuto",
      "Peso Netto (kg)",
      "Orario Ingresso",
      "Orario Uscita",
      "Minuti in Pesa",
      "Note",
      "Registrato Da",
    ];

    const rows = filteredWeighings.map((w) => [
      `"${w.id}"`,
      `"${w.date || ""}"`,
      `"Scarico #${w.discharge_number || 1}"`,
      `"${w.driver_name || ""}"`,
      `"${w.vehicle_plate || ""}"`,
      `"${w.vehicle_name || ""}"`,
      `"${w.route_code || ""}"`,
      `"${w.destination || ""}"`,
      `"${w.waste_type || ""}"`,
      w.net_weight || 0,
      `"${w.entry_time || ""}"`,
      `"${w.exit_time || ""}"`,
      w.duration_minutes !== null && w.duration_minutes !== undefined ? w.duration_minutes : "",
      `"${(w.notes || "").replace(/"/g, '""')}"`,
      `"${w.created_by || ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Archivio_Pesi_Scarichi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Esportazione CSV completata!");
  };

  // Stampa A4
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Intestazione pagina */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider mb-1">
            <Scale size={16} />
            <span>Registro Conferimenti & Logistica Rifiuti</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-head font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
            <span>Archivio Pesi & Scarichi</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-3xl">
            Registro storico di tutti gli scarichi e pesate nette inseriti dagli autisti, tonnellaggi conferiti e tempi trascorsi negli impianti e Centri di Raccolta (CDR).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Aggiorna</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Esporta CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5"
          >
            <Printer size={14} />
            <span>Stampa A4</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards in testata */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>Tonnellaggio Netto</span>
            <Scale size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-head font-black text-foreground font-mono">
              {stats.totalKg.toLocaleString("it-IT")} <span className="text-xs font-normal text-muted-foreground">kg</span>
            </div>
            <div className="text-xs font-semibold text-primary mt-0.5">
              ≈ {stats.totalTon} tonnellate
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>Scarichi Registrati</span>
            <TrendingUp size={16} className="text-blue-500" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-head font-black text-foreground font-mono">
              {stats.count}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              conferimenti nel periodo
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>Tempo Medio in Pesa</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-head font-black text-foreground font-mono">
              {stats.avgDuration !== null ? `${stats.avgDuration} min` : "N/D"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              attesa media scarico
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>Impianti / CDR</span>
            <Building2 size={16} className="text-purple-500" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-head font-black text-foreground font-mono">
              {stats.uniqueFacilities}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              destinazioni raggiunte
            </div>
          </div>
        </div>
      </div>

      {/* Pannello Filtri Avanzati */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Filter size={14} className="text-primary" />
            <span>Filtra Registrazioni</span>
          </div>

          {/* Pulsanti date veloci */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">Periodo:</span>
            <button
              onClick={() => setQuickRange("today")}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium hover:bg-secondary/60 bg-background"
            >
              Oggi
            </button>
            <button
              onClick={() => setQuickRange("week")}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium hover:bg-secondary/60 bg-background"
            >
              Questa Settimana
            </button>
            <button
              onClick={() => setQuickRange("month")}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium hover:bg-secondary/60 bg-background"
            >
              Mese Corrente
            </button>
            <button
              onClick={() => setQuickRange("all")}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium hover:bg-secondary/60 bg-background"
            >
              Tutti
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Da data */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Da Data</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* A data */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">A Data</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Autista */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Autista</label>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tutti gli autisti</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Mezzo */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Mezzo / Targa</label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tutti i mezzi</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate} - {v.name}</option>
              ))}
            </select>
          </div>

          {/* Impianto / CDR */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Impianto / CDR</label>
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tutti gli impianti</option>
              {destinationOptions.map((dst) => (
                <option key={dst} value={dst}>{dst}</option>
              ))}
            </select>
          </div>

          {/* Tipologia Rifiuto */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Tipo Rifiuto</label>
            <select
              value={selectedWasteType}
              onChange={(e) => setSelectedWasteType(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Tutti i tipi</option>
              {wasteTypeOptions.map((wst) => (
                <option key={wst} value={wst}>{wst}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Barra di ricerca libera */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per autista, targa mezzo, codice giro, impianto, note..."
            className="w-full h-9 pl-9 pr-9 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tabella Dati */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Data & Scarico</th>
                <th className="py-3 px-3">Autista</th>
                <th className="py-3 px-3">Mezzo / Targa</th>
                <th className="py-3 px-3">Giro / Servizio</th>
                <th className="py-3 px-3">Impianto / CDR</th>
                <th className="py-3 px-3">Tipo Rifiuto</th>
                <th className="py-3 px-4 text-right">Peso Netto (kg)</th>
                <th className="py-3 px-3 text-center">Tempo in Pesa</th>
                <th className="py-3 px-3">Note</th>
                <th className="py-3 px-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-xs text-muted-foreground">
                    Caricamento archivio pesate in corso...
                  </td>
                </tr>
              ) : filteredWeighings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-xs text-muted-foreground">
                    Nessuna pesata trovata con i filtri selezionati.
                  </td>
                </tr>
              ) : (
                filteredWeighings.map((w) => (
                  <tr key={w.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <div className="font-bold text-foreground">{w.date || "-"}</div>
                      <div className="text-[10px] text-muted-foreground">Scarico #{w.discharge_number || 1}</div>
                    </td>

                    <td className="py-3 px-3 font-medium whitespace-nowrap">
                      {w.driver_name || "Autista"}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-foreground font-mono">{w.vehicle_plate || "-"}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{w.vehicle_name || ""}</div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-foreground font-mono">{w.route_code || "-"}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{w.route_name || ""}</div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {w.destination ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium text-[11px]">
                          <Building2 size={11} className="text-primary" />
                          <span>{w.destination}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {w.waste_type ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium text-[10px]">
                          <Tag size={10} />
                          <span>{w.waste_type}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      <span className="text-sm text-foreground bg-primary/10 text-primary px-2.5 py-1 rounded-lg">
                        {w.net_weight.toLocaleString("it-IT")} kg
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {w.duration_minutes !== null && w.duration_minutes !== undefined ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[11px]">
                          <Clock size={11} /> {w.duration_minutes} min
                        </span>
                      ) : w.entry_time || w.exit_time ? (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {w.entry_time || "?"} - {w.exit_time || "?"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3 max-w-[160px] truncate text-[11px] text-muted-foreground italic" title={w.notes}>
                      {w.notes ? `"${w.notes}"` : "-"}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleOpenEdit(w)}
                          title="Modifica pesata"
                        >
                          <Edit2 size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(w.id)}
                          title="Elimina pesata"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer tabella con totale */}
        <div className="py-3 px-4 bg-secondary/30 border-t border-border flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="text-muted-foreground">
            Visualizzati <b className="text-foreground">{filteredWeighings.length}</b> scarichi su {weighings.length} totali.
          </div>
          <div className="font-bold text-foreground flex items-center gap-2">
            <span>Totale Selezionato:</span>
            <span className="font-mono text-sm bg-primary/10 text-primary px-3 py-1 rounded-full font-extrabold">
              {stats.totalKg.toLocaleString("it-IT")} kg ({stats.totalTon} t)
            </span>
          </div>
        </div>
      </div>

      {/* Modale Modifica Scarico per Staff */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="w-[95vw] sm:max-w-md p-4 sm:p-6 rounded-2xl">
          <DialogHeader className="text-left pb-2 border-b border-border">
            <DialogTitle className="text-lg font-head font-extrabold flex items-center gap-2">
              <Scale size={18} className="text-primary" />
              <span>Modifica Registrazione Scarico</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Aggiorna il peso netto, la destinazione o gli orari registrati per questo scarico.
            </DialogDescription>
          </DialogHeader>

          {editingItem && (
            <form onSubmit={handleSaveEdit} className="space-y-3.5 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Peso Netto Rifiuti (kg) *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="w-full h-10 pl-3 pr-10 text-sm font-bold font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground">KG</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">Impianto di Scarico</label>
                  <button
                    type="button"
                    onClick={() => setEditDestination("Akron")}
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    Imposta "Akron"
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={editDestination}
                  onChange={(e) => setEditDestination(e.target.value)}
                  placeholder="Es. Akron (o altro impianto)..."
                  className="w-full h-9 px-3 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Tipologia Rifiuto *</label>
                <select
                  required
                  value={editWasteType}
                  onChange={(e) => setEditWasteType(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="">Seleziona tipologia rifiuto...</option>
                  {ALL_WASTE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Orario Ingresso</label>
                  <input
                    type="time"
                    value={editEntryTime}
                    onChange={(e) => setEditEntryTime(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Orario Uscita</label>
                  <input
                    type="time"
                    value={editExitTime}
                    onChange={(e) => setEditExitTime(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Note / Osservazioni</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                  className="h-10 text-xs font-bold rounded-xl"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="h-10 px-5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {savingEdit ? "Salvataggio..." : "Salva Modifiche"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
