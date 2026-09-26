import { useCallback, useState } from "react";
import { TabletExtendDTO, TabletOrderDTO } from "../../application/dtos/RoomTabletDTO";
import {
  TabletHistoryEntry,
  TabletMenuCategory,
  TabletVisit,
} from "../../domain/entities/RoomTablet";
import { IRoomTabletService } from "../../domain/services/IRoomTabletService";
import container from "../../infrastructure/di/container";

export function useRoomTablet() {
  const service = container.resolve<IRoomTabletService>("roomTabletService");
  const [visit, setVisit] = useState<TabletVisit | null>(null);
  const [menu, setMenu] = useState<TabletMenuCategory[]>([]);
  const [history, setHistory] = useState<TabletHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    try {
      return await operation();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadVisit = useCallback(
    (cardUid: string) =>
      run(async () => {
        const result = await service.getVisit(cardUid);
        setVisit(result);
        return result;
      }),
    [run, service]
  );

  const refreshVisit = useCallback(
    async (cardUid: string) => {
      const result = await service.getVisit(cardUid);
      setVisit(result);
      return result;
    },
    [service]
  );

  const loadMenu = useCallback(
    () =>
      run(async () => {
        const result = await service.getMenu();
        setMenu(result);
        return result;
      }),
    [run, service]
  );

  const loadHistory = useCallback(
    (cardUid: string) =>
      run(async () => {
        const result = await service.getHistory(cardUid);
        setHistory(result);
        return result;
      }),
    [run, service]
  );

  const placeOrder = useCallback(
    (payload: TabletOrderDTO) => run(() => service.placeOrder(payload)),
    [run, service]
  );

  const addTime = useCallback(
    (payload: TabletExtendDTO) => run(() => service.addTime(payload)),
    [run, service]
  );

  const clear = useCallback(() => {
    setVisit(null);
    setHistory([]);
  }, []);

  return {
    visit,
    menu,
    history,
    isLoading,
    loadVisit,
    refreshVisit,
    loadMenu,
    loadHistory,
    placeOrder,
    addTime,
    clear,
  };
}
