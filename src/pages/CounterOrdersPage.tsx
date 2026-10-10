import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import type { KdsTicketStatus } from "@/core/application/dtos/CashierDTO";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";

const PAGE_LIMIT = 50;

const statusTone: Record<KdsTicketStatus, string> = {
  PENDING: "bg-orange-500 text-white",
  PREPARING: "bg-amber-400 text-slate-950",
  READY: "bg-emerald-500 text-white",
  EXPEDITED: "bg-red-500 text-white",
};

function clockTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function shortStation(stationId?: string): string {
  if (!stationId) return "";
  return stationId.length > 8 ? stationId.slice(0, 8) : stationId;
}

export function CounterOrdersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activePosRegisterId, activeLocationId } = usePosWorkspace();
  const { stations: kdsStations, listStations } = useKdsStationManagement();
  const { error, listKdsTickets, getKdsTicketById } = useCashier();
  const printerConnection = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId,
    activeLocationId
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [stationId, setStationId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<KdsTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTickets = useCallback(async () => {
    const result = await listKdsTickets({
      page,
      limit: PAGE_LIMIT,
      ...(stationId ? { stationId } : {}),
      activeOnly: true,
    });
    setTickets(result.tickets);
    setTotalPages(Math.max(1, result.totalPages || 1));
  }, [listKdsTickets, page, stationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async initial/filter load
    void loadTickets().catch((caught) => {
      setLocalError(
        caught instanceof Error ? caught.message : t("counterOrders.ticketsFailed")
      );
    });
  }, [loadTickets, t]);

  const stations = useMemo(() => {
    const ids = new Set<string>();
    tickets.forEach((ticket) => {
      if (ticket.stationId) ids.add(ticket.stationId);
    });
    return Array.from(ids);
  }, [tickets]);

  // Tickets only carry the station id, so load the KDS stations to show their names.
  useEffect(() => {
    void listStations({
      page: 1,
      limit: 100,
      ...(activeLocationId ? { locationId: activeLocationId } : {}),
    }).catch(() => undefined);
  }, [activeLocationId, listStations]);

  const stationNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const station of kdsStations) map[station.id] = station.name;
    // The ticket list can embed the station too; use it when the fetch is empty.
    for (const ticket of tickets) {
      const id = ticket.stationId || ticket.station?.id;
      if (id && ticket.station?.name && !map[id]) map[id] = ticket.station.name;
    }
    return map;
  }, [kdsStations, tickets]);

  /** The station name, falling back to the ticket's embedded name, then a short id. */
  const stationLabel = (stationId?: string, embeddedName?: string) => {
    if (!stationId) return t("counterOrders.noStation");
    return (
      embeddedName ||
      stationNameById[stationId] ||
      `${t("counterOrders.station")} ${shortStation(stationId)}`
    );
  };

  const unlinkedCount = tickets.filter((ticket) => !ticket.stationId).length;

  const openTicketDetails = async (ticket: KdsTicket) => {
    setLocalError(null);
    setDetailTicket(ticket);
    if (!ticket.id) return;
    setDetailLoading(true);
    try {
      const detail = await getKdsTicketById(ticket.id);
      setDetailTicket(detail);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("counterOrders.ticketFailed")
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const printTicket = async (ticket: KdsTicket) => {
    setLocalError(null);
    try {
      const detail = ticket.id ? await getKdsTicketById(ticket.id) : ticket;
      const listed = activeLocationId
        ? await listStations({ page: 1, limit: 100, locationId: activeLocationId })
        : { stations: [] };
      await printerConnection.printTicket(
        detail,
        listed.stations.map((station) => ({
          id: station.id,
          name: station.name,
          printerIds: station.printerIds,
          categoryIds: station.routingRules.categoryIds,
        }))
      );
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("counterOrders.ticketFailed")
      );
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
        <p className="min-w-0 flex-1 px-1 text-sm font-semibold text-slate-800">
          {t("counterOrders.queues.printJob", { count: tickets.length })}
        </p>
        <span className="mr-2 max-w-44 truncate text-xs text-slate-500">
          {printerConnection.defaultBinding
            ? printerConnection.defaultBinding.displayName
            : t("counterOrders.noPrinter")}
        </span>
        <button
          type="button"
          aria-label={t("counterOrders.refresh")}
          onClick={() => {
            setLocalError(null);
            void loadTickets().catch((caught) => {
              setLocalError(
                caught instanceof Error
                  ? caught.message
                  : t("counterOrders.ticketsFailed")
              );
            });
          }}
          className="grid h-9 w-9 place-items-center rounded text-lg text-slate-500 hover:bg-slate-100"
        >
          ↻
        </button>
      </header>

      {(error || localError || printerConnection.error) && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {localError || error || printerConnection.error}
        </p>
      )}

      <div className="pos-split grid min-h-0 flex-1 grid-cols-1 min-[900px]:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="pos-pane-scroll border-r border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setStationId("");
              setPage(1);
            }}
            className={[
              "flex w-full items-center px-4 py-3 text-left text-sm",
              stationId ? "text-slate-700" : "bg-slate-200 font-semibold",
            ].join(" ")}
          >
            {t("counterOrders.allStations")}
          </button>
          {stations.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setStationId(id);
                setPage(1);
              }}
              className={[
                "flex w-full items-center px-4 py-3 text-left text-sm",
                stationId === id ? "bg-white font-semibold" : "text-slate-700",
              ].join(" ")}
            >
              <span className="truncate">
                {stationLabel(id)}
              </span>
            </button>
          ))}
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="pos-pane-scroll">
            {tickets.length ? (
              tickets.map((ticket) => (
                <article
                  key={ticket.id || ticket.ticketNumber}
                  className="grid grid-cols-[auto_4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-4 py-3"
                >
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                      statusTone[ticket.status] || "bg-slate-200 text-slate-800",
                    ].join(" ")}
                  >
                    {t(`counterOrders.statuses.${ticket.status.toLowerCase()}`)}
                  </span>
                  <time className="text-sm text-slate-500">
                    {clockTime(ticket.firedAt || ticket.createdAt)}
                  </time>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {ticket.ticketNumber || ticket.id}
                      {ticket.courseType ? ` | ${ticket.courseType}` : ""}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {stationLabel(
                        ticket.stationId || ticket.station?.id,
                        ticket.station?.name
                      )}
                    </p>
                    {ticket.lines?.length ? (
                      <p className="truncate text-xs text-slate-700">
                        {ticket.lines
                          .map((line) => `${Number(line.quantity) || line.quantity} ${line.name}`)
                          .join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openTicketDetails(ticket)}
                      className="min-h-9 rounded-full border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {t("counterOrders.details")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("counterOrders.printTicket", {
                        ticket: ticket.ticketNumber || ticket.id,
                      })}
                      onClick={() => void printTicket(ticket)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white"
                    >
                      ⎙
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="p-6 text-sm text-slate-500">{t("counterOrders.noTickets")}</p>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm">
            <span className={unlinkedCount ? "text-red-600" : "text-slate-400"}>
              {t("counterOrders.unlinked", { count: unlinkedCount })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t("counterOrders.previous")}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="px-2 disabled:opacity-30"
              >
                ‹
              </button>
              <span>
                {t("counterOrders.pageLabel", { page, pages: totalPages })}
              </span>
              <button
                type="button"
                aria-label={t("counterOrders.next")}
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="px-2 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </footer>
        </div>
      </div>

      {detailTicket ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kds-ticket-details-title"
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p
                  id="kds-ticket-details-title"
                  className="truncate text-base font-semibold"
                >
                  {detailTicket.ticketNumber || detailTicket.id}
                </p>
                <p className="text-xs text-slate-500">
                  {stationLabel(
                    detailTicket.stationId || detailTicket.station?.id,
                    detailTicket.station?.name
                  )}
                  {detailTicket.courseType ? ` · ${detailTicket.courseType}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("counterOrders.closeDetails")}
                onClick={() => setDetailTicket(null)}
                className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                    statusTone[detailTicket.status] || "bg-slate-200 text-slate-800",
                  ].join(" ")}
                >
                  {t(`counterOrders.statuses.${detailTicket.status.toLowerCase()}`)}
                </span>
                <span className="text-xs text-slate-500">
                  {clockTime(detailTicket.firedAt || detailTicket.createdAt)}
                </span>
              </div>
              {detailLoading ? (
                <p className="text-xs text-slate-500">{t("common.loading")}</p>
              ) : null}
              {detailTicket.lines?.length ? (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {detailTicket.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{line.name}</span>
                        <span className="tabular-nums text-slate-600">
                          {Number(line.quantity) || line.quantity}
                        </span>
                      </div>
                      {line.modifiers ? (
                        <p className="mt-0.5 text-xs text-slate-500">{line.modifiers}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t("counterOrders.noLines")}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setDetailTicket(null)}
                className="min-h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100"
              >
                {t("counterOrders.closeDetails")}
              </button>
              <button
                type="button"
                onClick={() => void printTicket(detailTicket)}
                className="min-h-9 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white"
              >
                {t("counterOrders.printTicket", {
                  ticket: detailTicket.ticketNumber || detailTicket.id,
                })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
