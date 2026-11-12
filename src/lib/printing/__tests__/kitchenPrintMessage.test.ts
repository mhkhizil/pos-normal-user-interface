import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { kitchenPrintMessage } from "../kitchenPrintMessage";
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
