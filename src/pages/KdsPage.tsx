import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import { useKdsBoard } from "@/core/presentation/hooks/useKdsBoard";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { cashierLabel } from "@/lib/printing/cashier";
import { withOrderedBy } from "@/lib/printing/formatKdsTicket";

const STATION_KEY = "kds-station";
const POLL_MS = 5000;

const readStation = () => {
  try {
    return window.localStorage.getItem(STATION_KEY) || "";
  } catch {
    return "";
  }
};

const minutesSince = (value: string, nowMs: number) =>
  value ? Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60000)) : 0;

export function KdsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tickets, error, refresh, start, ready } = useKdsBoard();
  const { stations, listStations } = useKdsStationManagement();
  const [stationId, setStationId] = useState(readStation);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    void listStations({ page: 1, limit: 100 });
  }, [listStations]);

  useEffect(() => {
    const tick = () => {
      setNowMs(Date.now());
      if (document.visibilityState !== "visible") return;
      void refresh(stationId || undefined);
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, stationId]);

  /** The big line on a ticket: the table or room, or the pickup at the counter. */
  const placeTitle = (ticket: KdsTicket) => {
    const place = ticket.place;
    if (place?.kind === "TABLE" && place.number) return t("kds.table", { number: place.number });
    if (place?.kind === "SPA_ROOM" && place.number) return t("kds.spaRoom", { number: place.number });
    if (place?.kind === "KTV_ROOM" && place.number) return t("kds.ktvRoom", { number: place.number });
    if (ticket.pickupNumber) return t("kds.pickup", { number: ticket.pickupNumber });
    if (place?.kind === "COUNTER") return t("kds.counter");
    return ticket.ticketNumber;
  };

  const serviceLabel = (service?: string | null) => {
    if (!service) return "";
    const key = `kds.service.${service}`;
    const label = t(key);
    return label === key ? service.replaceAll("_", " ") : label;
  };

  const sender = (ticket: KdsTicket) =>
    ticket.sentFrom === "TABLET"
      ? t("kds.sentFromTablet", { device: ticket.deviceName || t("kds.roomTablet") })
      : cashierLabel(ticket.sentBy)
        ? t("kds.sentBy", { name: cashierLabel(ticket.sentBy) })
        : "";

  const chooseStation = (value: string) => {
    setStationId(value);
    try {
      window.localStorage.setItem(STATION_KEY, value);
    } catch {
      // Storage can be blocked; the choice then lasts until reload.
    }
  };

  const act = async (ticket: KdsTicket, action: "start" | "ready") => {
    setBusyId(ticket.id);
    try {
      if (action === "start") await start(ticket.id);
      else await ready(ticket.id);
    } finally {
      setBusyId("");
    }
  };

  const columns: { key: KdsTicket["status"]; title: string }[] = [
    { key: "PENDING", title: t("kds.new") },
    { key: "PREPARING", title: t("kds.preparing") },
  ];

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#080808] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{t("kds.title")}</h1>
          <p className="text-xs text-slate-500">{t("kds.subtitle", { count: tickets.length })}</p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <select
            value={stationId}
            onChange={(event) => chooseStation(event.target.value)}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm sm:max-w-xs sm:flex-none"
            aria-label={t("kds.station")}
          >
            <option value="">{t("kds.allStations")}</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => navigate("/")}>
            {t("kds.exit")}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="mx-5 mt-3 rounded border border-red-500/60 bg-red-950/50 p-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <section className="grid min-h-0 flex-1 grid-rows-2 gap-4 overflow-hidden p-4 sm:p-5 lg:grid-cols-2 lg:grid-rows-1">
        {columns.map((column) => {
          const list = tickets.filter((ticket) =>
            column.key === "PENDING"
              ? ticket.status === "PENDING"
              : ticket.status === "PREPARING" || ticket.status === "EXPEDITED"
          );
          return (
            <div key={column.key} className="flex min-h-0 flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {column.title} · {list.length}
              </h2>
              <div className="pos-pane-scroll flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:content-start">
                {list.length === 0 ? (
                  <p className="text-sm text-slate-600">{t("kds.empty")}</p>
                ) : (
                  list.map((ticket) => {
                    const age = minutesSince(ticket.firedAt, nowMs);
                    const sentBy = sender(ticket);
                    const details = [
                      ticket.place?.name,
                      ticket.place?.guestCount
                        ? t("kds.guests", { count: ticket.place.guestCount })
                        : "",
                      ticket.place?.kind === "COUNTER" ? serviceLabel(ticket.serviceType) : "",
                    ].filter(Boolean);
                    return (
                      <article
                        key={ticket.id}
                        className={`min-w-0 rounded-lg border p-4 ${
                          age >= 15
                            ? "border-red-500 bg-red-950/30"
                            : age >= 8
                              ? "border-orange-400 bg-orange-950/20"
                              : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-xl font-bold">{placeTitle(ticket)}</p>
                            {details.length ? (
                              <p className="break-words text-sm text-slate-300">{details.join(" · ")}</p>
                            ) : null}
                            <p className="break-words text-xs text-slate-400">
                              {[ticket.ticketNumber, ticket.orderNumber, ticket.courseType]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {sentBy ? (
                              <p className="mt-1 break-words text-xs font-medium text-sky-300">{sentBy}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {t("kds.minutes", { count: age })}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-1">
                          {(ticket.kdsTicketLines?.length
                            ? ticket.kdsTicketLines.map((line) => ({
                                key: line.id,
                                name: line.productName,
                                quantity: line.quantity,
                                modifiers: withOrderedBy(line.kitchenModifiers, line.orderedBy),
                                seat: line.seatNumber,
                              }))
                            : (ticket.lines || []).map((line, index) => ({
                                key: `${ticket.id}-${index}`,
                                name: line.name,
                                quantity: line.quantity,
                                modifiers: withOrderedBy(line.modifiers, line.orderedBy),
                                seat: undefined,
                              }))
                          ).map((line) => (
                            <li key={line.key} className="text-base">
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 break-words">
                                  {line.name}
                                  {line.seat ? (
                                    <span className="ml-2 text-xs text-slate-400">
                                      {t("kds.seat", { seat: line.seat })}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 font-bold">× {Number(line.quantity)}</span>
                              </div>
                              {line.modifiers ? (
                                <p className="break-words text-sm text-amber-300">{line.modifiers}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                          {ticket.status === "PENDING" ? (
                            <Button
                              variant="secondary"
                              fullWidth
                              isLoading={busyId === ticket.id}
                              onClick={() => void act(ticket, "start")}
                            >
                              {t("kds.start")}
                            </Button>
                          ) : (
                            <span className="hidden min-[420px]:block" />
                          )}
                          <Button
                            fullWidth
                            isLoading={busyId === ticket.id}
                            onClick={() => void act(ticket, "ready")}
                          >
                            {t("kds.ready")}
                          </Button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
