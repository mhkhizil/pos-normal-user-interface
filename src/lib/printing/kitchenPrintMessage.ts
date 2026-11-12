import type { TFunction } from "i18next";
import { NoKitchenPrinterError } from "./routeKitchenPrint";

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
