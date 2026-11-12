import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { kitchenPlanMessage, kitchenPrintMessage } from "../kitchenPrintMessage";
import { NoKitchenPrinterError } from "../routeKitchenPrint";

const t = ((key: string, values?: Record<string, string>) =>
  `${key}${values ? JSON.stringify(values) : ""}`) as unknown as TFunction;

describe("kitchenPrintMessage", () => {
  it("is null when everything printed", () => {
    expect(kitchenPrintMessage([], t)).toBeNull();
  });

  it("names every item and station that had no printer in one message", () => {
    expect(
      kitchenPrintMessage(
        [
          new NoKitchenPrinterError(["KitchenStation"], ["Rice"]),
          new NoKitchenPrinterError(["BarStation"], ["Beer"]),
        ],
        t
      )
    ).toBe('kds.noPrinter{"items":"Rice, Beer","stations":"KitchenStation, BarStation"}');
  });

  it("keeps other print problems", () => {
    expect(kitchenPrintMessage([new Error("Paper out")], t)).toBe(
      'kds.printFailed{"error":"Paper out"}'
    );
  });
});

describe("kitchenPlanMessage", () => {
  const line = (name: string) => ({ name, quantity: "1" });
  const route = (stationName: string) => ({ stationId: stationName, stationName, printerIds: [] });

  it("names the items and the station that has no printer", () => {
    expect(
      kitchenPlanMessage(
        { jobs: [], unrouted: [line("Beer")], missingPrinterRoutes: [route("BarStation")] },
        t
      )
    ).toBe('kds.noPrinter{"items":"Beer","stations":"BarStation"}');
  });

  it("names items no station takes, unless the caller does not want them", () => {
    const plan = { jobs: [], unrouted: [line("Cake")], missingPrinterRoutes: [] };
    expect(kitchenPlanMessage(plan, t)).toBe('kds.noStation{"items":"Cake"}');
    expect(kitchenPlanMessage(plan, t, { reportNoStation: false })).toBeNull();
  });

  it("says when a station printed on some printers but not all", () => {
    expect(
      kitchenPlanMessage({ jobs: [], unrouted: [], missingPrinterRoutes: [route("KitchenStation")] }, t)
    ).toBe('kds.somePrinterMissing{"stations":"KitchenStation"}');
  });

  it("is null when everything printed", () => {
    expect(kitchenPlanMessage({ jobs: [], unrouted: [], missingPrinterRoutes: [] }, t)).toBeNull();
  });
});
