import { useCallback, useEffect, useRef, useState } from "react";
import { RoomOrderView } from "../../domain/entities/RoomTablet";
import { IRoomTabletService } from "../../domain/services/IRoomTabletService";
import container from "../../infrastructure/di/container";

const POLL_MS = 15000;

export function useRoomOrderAlerts({
  enabled,
  onNewOrder,
}: {
  enabled: boolean;
  onNewOrder?: (
    order: RoomOrderView,
    claimPrint: (id: string) => Promise<{ claimed: boolean; order: RoomOrderView }>
  ) => void;
}) {
  const service = container.resolve<IRoomTabletService>("roomTabletService");
  const [alerts, setAlerts] = useState<RoomOrderView[]>([]);
  const seen = useRef(new Set<string>());
  const onNewOrderRef = useRef(onNewOrder);

  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  const refresh = useCallback(async () => {
    const pending = await service.listRoomOrders(true);
    setAlerts(pending);
    for (const order of pending) {
      if (seen.current.has(order.id)) continue;
      seen.current.add(order.id);
      onNewOrderRef.current?.(order, (id) => service.claimRoomOrderPrint(id));
    }
    return pending;
  }, [service]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const acknowledge = useCallback(
    async (id: string) => {
      await service.acknowledgeRoomOrder(id);
      setAlerts((current) => current.filter((order) => order.id !== id));
    },
    [service]
  );

  const deliver = useCallback(
    async (id: string) => {
      await service.deliverRoomOrder(id);
      setAlerts((current) => current.filter((order) => order.id !== id));
    },
    [service]
  );

  const claimPrint = useCallback((id: string) => service.claimRoomOrderPrint(id), [service]);

  return { alerts, refresh, acknowledge, deliver, claimPrint };
}
