import { formatKm } from "@/lib/geo";

// Copy for the Trip Planner status bar.
export function statusMessage(status, fallbackLabel) {
  const fromFallback = `showing distances from ${fallbackLabel}.`;
  switch (status?.state) {
    case "locating":
      return "Finding you…";
    case "device":
      return "Distances from your location";
    case "far":
      return `You're ${formatKm(status.km)} away — ${fromFallback}`;
    case "denied":
      return `Location blocked — ${fromFallback}`;
    case "error":
      return `Couldn't find you — ${fromFallback}`;
    default:
      return `Distances from ${fallbackLabel}`;
  }
}
