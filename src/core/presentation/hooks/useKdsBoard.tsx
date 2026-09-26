import { useCallback, useState } from "react";
import { KdsTicket } from "../../domain/entities/Cashier";
import { ICashierService } from "../../domain/services/ICashierService";
import container from "../../infrastructure/di/container";

export function useKdsBoard() {
  const service = container.resolve<ICashierService>("cashierService");
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (stationId?: string) => {
      try {
        const result = await service.listKdsTickets({
          activeOnly: true,
          limit: 100,
          ...(stationId ? { stationId } : {}),
        });
        setTickets(result.tickets);
        setError(null);
        return result.tickets;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load tickets");
        return [];
      }
    },
    [service]
  );

  const replace = (updated: KdsTicket) =>
    setTickets((current) =>
      updated.status === "READY"
        ? current.filter((ticket) => ticket.id !== updated.id)
        : current.map((ticket) => (ticket.id === updated.id ? updated : ticket))
    );

  const start = useCallback(
    async (id: string) => replace(await service.startKdsTicket(id)),
    [service]
  );

  const ready = useCallback(
    async (id: string) => replace(await service.readyKdsTicket(id)),
    [service]
  );

  return { tickets, error, refresh, start, ready };
}
