import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { RoomOrderView } from "@/core/domain/entities/RoomTablet";
import { useRoomOrderAlerts } from "@/core/presentation/hooks/useRoomOrderAlerts";
import { KitchenSlip } from "@/lib/printing/formatKdsTicket";
import { toTabletSlip } from "@/lib/spa/tabletSlip";

const PRINT_KEY = "print-tablet-orders";

const readPrintSetting = () => {
  try {
    return window.localStorage.getItem(PRINT_KEY) === "true";
  } catch {
    return false;
  }
};

const money = (value: string) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export function RoomOrderAlerts({
  enabled,
  printKitchen,
}: {
  enabled: boolean;
  printKitchen: (slip: KitchenSlip) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [printHere, setPrintHere] = useState(readPrintSetting);
  const [error, setError] = useState<string | null>(null);

  const { alerts, acknowledge, deliver } = useRoomOrderAlerts({
    enabled,
    onNewOrder: useCallback(
      (
        order: RoomOrderView,
        claimPrint: (id: string) => Promise<{ claimed: boolean; order: RoomOrderView }>
      ) => {
        if (!printHere || order.kind !== "ITEMS") return;
        void (async () => {
          try {
            const claim = await claimPrint(order.id);
            if (claim.claimed) await printKitchen(toTabletSlip(claim.order));
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : t("roomOrders.printFailed"));
          }
        })();
      },
      [printHere, printKitchen, t]
    ),
  });

  if (!enabled) return null;

  const togglePrint = (value: boolean) => {
    setPrintHere(value);
    try {
      window.localStorage.setItem(PRINT_KEY, String(value));
    } catch {
      // Storage can be blocked; the choice then lasts until reload.
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {alerts.slice(0, 3).map((order) => (
        <div
          key={order.id}
          role="alert"
          className="rounded-lg border border-teal-500 bg-slate-950 p-3 text-sm text-white shadow-xl"
        >
          <p className="font-bold">
            🔔 {t("roomOrders.newOrder", { room: order.roomNumber, number: order.orderNumber })}
          </p>
          <p className="text-xs text-slate-400">
            {order.deviceName || t("roomOrders.tablet")} ·{" "}
            {new Date(order.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {money(order.amount)}
          </p>
          <ul className="mt-1">
            {order.kind === "SESSIONS" ? (
              <li>{t("roomOrders.timeAdded")}</li>
            ) : (
              order.items.map((item, index) => (
                <li key={`${order.id}-${index}`}>
                  {item.name} × {item.quantity}
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void acknowledge(order.id)}>
              {t("roomOrders.seen")}
            </Button>
            <Button onClick={() => void deliver(order.id)}>{t("roomOrders.delivered")}</Button>
          </div>
        </div>
      ))}
      {alerts.length > 3 ? (
        <p className="rounded bg-slate-900 p-2 text-center text-xs text-slate-300">
          {t("roomOrders.more", { count: alerts.length - 3 })}
        </p>
      ) : null}
      {error ? (
        <p className="rounded bg-red-950 p-2 text-xs text-red-200">{error}</p>
      ) : null}
      <label className="flex items-center justify-end gap-2 self-end rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={printHere}
          onChange={(event) => togglePrint(event.target.checked)}
        />
        {t("roomOrders.printHere")}
      </label>
    </aside>
  );
}
