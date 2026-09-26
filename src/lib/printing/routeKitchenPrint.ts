import { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import { PrintLine } from "./formatKdsTicket";

export interface StationRoute {
  id: string;
  name: string;
  printerId?: string;
  categoryIds: string[];
}

export interface PrinterJob {
  binding: PrinterBinding;
  lines: PrintLine[];
}

export interface KitchenPrintPlan {
  jobs: PrinterJob[];
  unrouted: PrintLine[];
}

const bindingForStation = (
  station: StationRoute,
  bindings: PrinterBinding[]
) =>
  bindings.find(
    (binding) =>
      (station.printerId && binding.backendPrinterId === station.printerId) ||
      binding.stationId === station.id
  ) || null;

const planFromStations = (
  lines: PrintLine[],
  bindings: PrinterBinding[],
  stations: StationRoute[],
  defaultBinding: PrinterBinding | null
): KitchenPrintPlan => {
  const jobs = new Map<string, PrinterJob>();
  const unrouted: PrintLine[] = [];

  for (const line of lines) {
    const station = stations.find((item) =>
      item.categoryIds.includes(line.categoryId || "")
    );
    const binding =
      (station && bindingForStation(station, bindings)) || defaultBinding;
    if (!binding) {
      unrouted.push(line);
      continue;
    }
    const current = jobs.get(binding.id) || { binding, lines: [] };
    current.lines.push(line);
    jobs.set(binding.id, current);
  }

  return { jobs: Array.from(jobs.values()), unrouted };
};

const bindingForLine = (
  line: PrintLine,
  bindings: PrinterBinding[],
  stationBinding: PrinterBinding | null,
  defaultBinding: PrinterBinding | null
) => {
  if (line.categoryId) {
    const routed = bindings.find((binding) =>
      binding.categoryIds?.includes(line.categoryId || "")
    );
    if (routed) return routed;
  }
  return stationBinding || defaultBinding;
};

export function groupKitchenJobs(
  lines: PrintLine[],
  bindings: PrinterBinding[],
  defaultBinding: PrinterBinding | null,
  stationId?: string,
  stations: StationRoute[] = []
): KitchenPrintPlan {
  const stationBinding =
    bindings.find((binding) => stationId && binding.stationId === stationId) ||
    null;
  const jobs = new Map<string, PrinterJob>();

  const add = (binding: PrinterBinding, line?: PrintLine) => {
    const current = jobs.get(binding.id) || { binding, lines: [] };
    if (line) current.lines.push(line);
    jobs.set(binding.id, current);
  };

  if (stationId && stations.length) {
    const station = stations.find((item) => item.id === stationId);
    if (station) {
      const binding = bindingForStation(station, bindings) || defaultBinding;
      if (!binding) throw new Error(`Connect a printer for ${station.name}`);
      return {
        jobs: [{ binding, lines }],
        unrouted: [],
      };
    }
  }

  if (stations.length) {
    return planFromStations(lines, bindings, stations, defaultBinding);
  }

  if (!lines.length) {
    const target = stationBinding || defaultBinding;
    if (!target) throw new Error("No default printer is connected");
    add(target);
    return { jobs: Array.from(jobs.values()), unrouted: [] };
  }

  for (const line of lines) {
    const target = bindingForLine(line, bindings, stationBinding, defaultBinding);
    if (!target) throw new Error("No default printer is connected");
    add(target, line);
  }

  return { jobs: Array.from(jobs.values()), unrouted: [] };
}
