export function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object") {
    const timestamp = value as { toDate?: unknown; seconds?: unknown; _seconds?: unknown; milliseconds?: unknown };
    if (typeof timestamp.toDate === "function") {
      try {
        const date = timestamp.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
      } catch {
        return null;
      }
    }
    if (typeof timestamp.seconds === "number") {
      const date = new Date(timestamp.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof timestamp._seconds === "number") {
      const date = new Date(timestamp._seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof timestamp.milliseconds === "number") {
      const date = new Date(timestamp.milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

export function formatDateSafe(value: unknown, fallback = "N/A"): string {
  const date = normalizeDate(value);
  return date ? date.toLocaleDateString() : fallback;
}

export function formatDateTimeSafe(value: unknown, fallback = "N/A"): string {
  const date = normalizeDate(value);
  return date ? date.toLocaleString() : fallback;
}
