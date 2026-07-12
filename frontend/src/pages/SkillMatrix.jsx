import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { initials } from "../lib/dates";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { Truck, Route as RouteIcon, GraduationCap } from "lucide-react";

export default function SkillMatrix() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    Promise.all([api.get("/drivers"), api.get("/vehicles"), api.get("/routes")]).then(([d, v, r]) => {
      setDrivers(d.data); setVehicles(v.data); setRoutes(r.data);
    });
  }, []);

  const persist = async (driver) => {
    try {
      await api.put(`/drivers/${driver.id}/skills`, {
        vehicle_skills: driver.vehicle_skills,
        route_skills: driver.route_skills,
      });
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const toggle = (driverId, kind, id) => {
    setDrivers((prev) => {
      const next = prev.map((d) => {
        if (d.id !== driverId) return d;
        const key = kind === "vehicle" ? "vehicle_skills" : "route_skills";
        const has = d[key].includes(id);
        const updated = { ...d, [key]: has ? d[key].filter((x) => x !== id) : [...d[key], id] };
        persist(updated);
        return updated;
      });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="overline text-primary mb-1 flex items-center gap-1.5"><GraduationCap size={13} /> Formazioni interne completate</div>
        <h1 className="font-head font-black text-3xl sm:text-4xl tracking-tighter">Matrice abilitazioni</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Un autista può coprire un giro solo se possiede l'abilitazione sia al <b>mezzo</b> richiesto sia al <b>giro</b>.
        </p>
      </div>

      <div className="board-scroll overflow-x-auto border border-border bg-card rounded-sm">
        <table className="min-w-max border-collapse w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-secondary border-b border-r border-border p-3 text-left min-w-[200px]">
                <span className="overline text-muted-foreground">Autista</span>
              </th>
              <th className="border-b border-r-2 border-border bg-primary/5 p-2 text-center" colSpan={vehicles.length}>
                <span className="inline-flex items-center gap-1 overline text-primary"><Truck size={12} /> Abilitazioni Mezzo</span>
              </th>
              <th className="border-b border-border bg-primary/5 p-2 text-center" colSpan={routes.length}>
                <span className="inline-flex items-center gap-1 overline text-primary"><RouteIcon size={12} /> Abilitazioni Giro</span>
              </th>
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-secondary border-b border-r border-border p-2" />
              {vehicles.map((v) => (
                <th key={v.id} className="border-b border-r border-border p-2 align-bottom" style={{ height: 130 }}>
                  <div className="font-mono text-xs font-semibold whitespace-nowrap" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{v.name}</div>
                </th>
              ))}
              {routes.map((r) => (
                <th key={r.id} className="border-b border-r border-border p-2 align-bottom" style={{ height: 130 }}>
                  <div className="font-mono text-xs font-semibold whitespace-nowrap" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{r.code} · {r.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="hover:bg-secondary/40 transition-colors duration-150" data-testid={`matrix-row-${d.id}`}>
                <td className="sticky left-0 z-10 bg-card border-b border-r border-border p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-head font-bold text-[10px]">{initials(d.name)}</div>
                    <span className="text-sm font-medium whitespace-nowrap">{d.name}</span>
                  </div>
                </td>
                {vehicles.map((v) => (
                  <td key={v.id} className="border-b border-r border-border text-center p-0">
                    <div className="flex items-center justify-center h-11">
                      <Checkbox
                        data-testid={`skill-v-${d.id}-${v.id}`}
                        checked={d.vehicle_skills.includes(v.id)}
                        onCheckedChange={() => toggle(d.id, "vehicle", v.id)}
                        className="rounded-sm data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                  </td>
                ))}
                {routes.map((r) => (
                  <td key={r.id} className="border-b border-r border-border text-center p-0">
                    <div className="flex items-center justify-center h-11">
                      <Checkbox
                        data-testid={`skill-r-${d.id}-${r.id}`}
                        checked={d.route_skills.includes(r.id)}
                        onCheckedChange={() => toggle(d.id, "route", r.id)}
                        className="rounded-sm data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
