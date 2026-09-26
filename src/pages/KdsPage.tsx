import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { KdsTicket } from "@/core/domain/entities/Cashier";
import { useKdsBoard } from "@/core/presentation/hooks/useKdsBoard";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { useSpaManagement } from "@/core/presentation/hooks/useSpaManagement";

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
  const { rooms, fetchBoard } = useSpaManagement();
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
      void fetchBoard().catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [fetchBoard, refresh, stationId]);

  const roomByOrder = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of rooms) {
      for (const session of room.sessions) {
        if (session.salesOrderId) map[session.salesOrderId] = room.roomNumber;
      }
    }
    return map;
  }, [rooms]);

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
    <main className="flex min-h-screen flex-col bg-[#080808] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div>
          <h1 className="text-xl font-bold">{t("kds.title")}</h1>
          <p className="text-xs text-slate-500">{t("kds.subtitle", { count: tickets.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={stationId}
            onChange={(event) => chooseStation(event.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
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

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-5 lg:grid-cols-2">
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
              <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-2">
                {list.length === 0 ? (
                  <p className="text-sm text-slate-600">{t("kds.empty")}</p>
                ) : (
                  list.map((ticket) => {
                    const age = minutesSince(ticket.firedAt, nowMs);
                    const room = roomByOrder[ticket.salesOrderId];
                    return (
                      <article
                        key={ticket.id}
                        className={`rounded-lg border p-4 ${
                          age >= 15
                            ? "border-red-500 bg-red-950/30"
                            : age >= 8
                              ? "border-orange-400 bg-orange-950/20"
                              : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold">
                              {room ? t("kds.room", { room }) : ticket.ticketNumber}
                            </p>
                            <p className="text-xs text-slate-400">
                              {ticket.ticketNumber}
                              {ticket.courseType ? ` · ${ticket.courseType}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold">
                            {t("kds.minutes", { count: age })}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-1">
                          {(ticket.kdsTicketLines?.length
                            ? ticket.kdsTicketLines.map((line) => ({
                                key: line.id,
                                name: line.productName,
                                quantity: line.quantity,
                              }))
                            : (ticket.lines || []).map((line, index) => ({
                                key: `${ticket.id}-${index}`,
                                name: line.name,
                                quantity: line.quantity,
                              }))
                          ).map((line) => (
                            <li key={line.key} className="flex justify-between text-base">
                              <span>{line.name}</span>
                              <span className="font-bold">× {Number(line.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {ticket.status === "PENDING" ? (
                            <Button
                              variant="secondary"
                              isLoading={busyId === ticket.id}
                              onClick={() => void act(ticket, "start")}
                            >
                              {t("kds.start")}
                            </Button>
                          ) : (
                            <span />
                          )}
                          <Button
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
