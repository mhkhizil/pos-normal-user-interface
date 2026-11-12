import type { TFunction } from "i18next";
import { KitchenPrintPlan, NoKitchenPrinterError } from "./routeKitchenPrint";

const unique = (values: string[]) => Array.from(new Set(values));

/** What staff are told when kitchen tickets did not print. */
export function kitchenPrintMessage(errors: unknown[], t: TFunction): string | null {
  if (!errors.length) return null;
  const missing = errors.filter(
    (error): error is NoKitchenPrinterError => error instanceof NoKitchenPrinterError
  );
  const messages: string[] = [];
  if (missing.length) {
    messages.push(
      t("kds.noPrinter", {
        items: unique(missing.flatMap((error) => error.items)).join(", "),
        stations: unique(missing.flatMap((error) => error.stations)).join(", "),
      })
    );
  }
  for (const error of errors) {
    if (error instanceof NoKitchenPrinterError) continue;
    messages.push(
      t("kds.printFailed", {
        error: error instanceof Error ? error.message : t("roomOrders.printFailed"),
      })
    );
  }
  return unique(messages).join(" ");
}

/**
 * What staff are told about a kitchen print that left items or printers out.
 * A delete slip passes `reportNoStation: false`: an item no station takes never
 * reached the kitchen, so there is nothing to call back.
 */
export function kitchenPlanMessage(
  plan: KitchenPrintPlan,
  t: TFunction,
  { reportNoStation = true }: { reportNoStation?: boolean } = {}
): string | null {
  const items = unique(plan.unrouted.map((line) => line.name)).join(", ");
  const stations = unique(plan.missingPrinterRoutes.map((route) => route.stationName)).join(", ");
  if (plan.unrouted.length && plan.missingPrinterRoutes.length) {
    return t("kds.noPrinter", { items, stations });
  }
  if (plan.unrouted.length) {
    return reportNoStation ? t("kds.noStation", { items }) : null;
  }
  if (plan.missingPrinterRoutes.length) {
    return t("kds.somePrinterMissing", { stations });
  }
  return null;
}
