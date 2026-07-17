import { format, startOfWeek, addWeeks } from "date-fns";
import { it } from "date-fns/locale";

export const SLOT_ORDER = ["presto", "standard", "pomeriggio", "domenica"];

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const DAY_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export function mondayOf(date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function weekKey(date) {
  return format(mondayOf(date), "yyyy-MM-dd");
}

export function shiftWeek(date, delta) {
  return addWeeks(date, delta);
}

export function weekLabel(date) {
  const m = mondayOf(date);
  const sun = addWeeks(m, 1);
  sun.setDate(sun.getDate() - 1);
  return `${format(m, "d MMM", { locale: it })} – ${format(sun, "d MMM yyyy", { locale: it })}`;
}

export function initials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
