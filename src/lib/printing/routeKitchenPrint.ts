import { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import { PrintLine } from "./formatKdsTicket";

export interface StationRoute {
  id: string;
  name: string;
  printerIds: string[];
  categoryIds: string[];
}

export interface PrinterJob {
  binding: PrinterBinding;
  lines: PrintLine[];
  station?: StationRoute;
}

export interface KitchenPrintPlan {
  jobs: PrinterJob[];
  unrouted: PrintLine[];
  missingPrinterRoutes: Array<{
    stationId: string;
    stationName: string;
    printerIds: string[];
  }>;
}

/** A kitchen ticket whose station has no printer this device can reach. */
export class NoKitchenPrinterError extends Error {
  constructor(
    readonly stations: string[],
    readonly items: string[]
  ) {
    super(`No printer is connected for ${stations.join(", ")}`);
    this.name = "NoKitchenPrinterError";
  }
}

export interface KitchenRoutingOptions {
  requireStationRouting?: boolean;
}

const bindingsForStation = (
  station: StationRoute,
  bindings: PrinterBinding[]
) => {
  const printerIds = new Set(station.printerIds);
  return bindings.filter(
    (binding) =>
      Boolean(binding.backendPrinterId) &&
      printerIds.has(binding.backendPrinterId!)
  );
};

const planFromStations = (
  lines: PrintLine[],
  bindings: PrinterBinding[],
  stations: StationRoute[]
): KitchenPrintPlan => {
  const jobs = new Map<string, PrinterJob>();
  const unrouted: PrintLine[] = [];
  const missing = new Map<
    string,
    { stationId: string; stationName: string; printerIds: string[] }
  >();

  for (const line of lines) {
    // Several stations may share a category (a kitchen line and an expo screen):
    // each prints the item, but one printer shared by two of them prints it once.
    const matchingStations = stations.filter((item) =>
      item.categoryIds.includes(line.categoryId || "")
    );
    const printedOn = new Set<string>();
    for (const station of matchingStations) {
      routeToStation(line, station, printedOn);
    }
    if (!printedOn.size) unrouted.push(line);
  }

  function routeToStation(line: PrintLine, station: StationRoute, printedOn: Set<string>) {
    const stationBindings = bindingsForStation(station, bindings);
    const configuredIds = Array.from(new Set(station.printerIds));
    const locallyBoundIds = new Set(
      stationBindings
        .map((binding) => binding.backendPrinterId)
        .filter((id): id is string => Boolean(id))
    );
    const missingIds = configuredIds.filter((id) => !locallyBoundIds.has(id));

    if (missingIds.length) {
      missing.set(station.id, {
        stationId: station.id,
        stationName: station.name,
        printerIds: missingIds,
      });
    }

    for (const binding of stationBindings) {
      if (printedOn.has(binding.id)) continue;
      printedOn.add(binding.id);
      const key = `${binding.id}:${station.id}`;
      const current = jobs.get(key) || { binding, lines: [], station };
      current.lines.push(line);
      jobs.set(key, current);
    }
  }

  return {
    jobs: Array.from(jobs.values()),
    unrouted,
    missingPrinterRoutes: Array.from(missing.values()),
  };
};

const bindingForLine = (
  line: PrintLine,
  bindings: PrinterBinding[],
  defaultBinding: PrinterBinding | null
) => {
  if (line.categoryId) {
    const routed = bindings.find((binding) =>
      binding.categoryIds?.includes(line.categoryId || "")
    );
    if (routed) return routed;
  }
  return defaultBinding;
};

export function groupKitchenJobs(
  lines: PrintLine[],
  bindings: PrinterBinding[],
  defaultBinding: PrinterBinding | null,
  stationId?: string,
  stations: StationRoute[] = [],
  options: KitchenRoutingOptions = {}
): KitchenPrintPlan {
  const jobs = new Map<string, PrinterJob>();

  const add = (binding: PrinterBinding, line?: PrintLine) => {
    const current = jobs.get(binding.id) || { binding, lines: [] };
    if (line) current.lines.push(line);
    jobs.set(binding.id, current);
  };

  if (stationId && stations.length) {
    const station = stations.find((item) => item.id === stationId);
    if (station) {
      const stationBindings = bindingsForStation(station, bindings);
      const configuredIds = Array.from(new Set(station.printerIds));
      const locallyBoundIds = new Set(
        stationBindings
          .map((binding) => binding.backendPrinterId)
          .filter((id): id is string => Boolean(id))
      );
      const missingPrinterIds = configuredIds.filter(
        (id) => !locallyBoundIds.has(id)
      );
      if (!stationBindings.length) {
        return {
          jobs: [],
          unrouted: lines,
          missingPrinterRoutes: [
            {
              stationId: station.id,
              stationName: station.name,
              printerIds: missingPrinterIds.length
                ? missingPrinterIds
                : configuredIds,
            },
          ],
        };
      }
      const printers = stationBindings.filter(
        (binding, index) =>
          stationBindings.findIndex((other) => other.id === binding.id) === index
      );
      return {
        jobs: printers.map((binding) => ({ binding, lines, station })),
        unrouted: [],
        missingPrinterRoutes: missingPrinterIds.length
          ? [
              {
                stationId: station.id,
                stationName: station.name,
                printerIds: missingPrinterIds,
              },
            ]
          : [],
      };
    }
  }

  if (stations.length) {
    return planFromStations(lines, bindings, stations);
  }

  if (options.requireStationRouting) {
    return { jobs: [], unrouted: lines, missingPrinterRoutes: [] };
  }

  if (!lines.length) {
    const target = defaultBinding;
    if (!target) throw new Error("No default printer is connected");
    add(target);
    return { jobs: Array.from(jobs.values()), unrouted: [], missingPrinterRoutes: [] };
  }

  for (const line of lines) {
    const target = bindingForLine(line, bindings, defaultBinding);
    if (!target) throw new Error("No default printer is connected");
    add(target, line);
  }

  return { jobs: Array.from(jobs.values()), unrouted: [], missingPrinterRoutes: [] };
}
