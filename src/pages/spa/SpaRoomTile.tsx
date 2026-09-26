import { useTranslation } from "react-i18next";
import { SpaRoom } from "@/core/domain/entities/Spa";
import { getKtvWarning } from "@/lib/ktv/session";
import { findActiveSpaSession } from "@/lib/spa/session";

export function SpaRoomTile({
  room,
  nowMs,
  onSelect,
  onReady,
  onManage,
}: {
  room: SpaRoom;
  nowMs: number;
  onSelect: () => void;
  onReady: () => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const session = findActiveSpaSession(room);
  const warning = getKtvWarning(session?.endsAt, nowMs);
  const status = String(room.status || "AVAILABLE").toUpperCase();
  const isCleaning = status === "CLEANING";
  const isOutOfService = status === "OUT_OF_SERVICE";
  const tone =
    warning.level === "EXPIRED"
      ? "border-red-500/70 bg-slate-900"
      : warning.level === "WARNING"
        ? "border-amber-500/70 bg-slate-900"
        : session
          ? "border-slate-500 bg-slate-900"
          : isOutOfService
            ? "border-slate-800 bg-slate-900/40 opacity-60"
            : "border-slate-800 bg-slate-900/60";
  const dot = session
    ? "bg-emerald-400"
    : isCleaning
      ? "bg-amber-400"
      : isOutOfService
        ? "bg-slate-600"
        : "bg-slate-400";

  return (
    <article className={`rounded-lg border p-4 ${tone}`}>
      <button
        type="button"
        className="w-full text-left disabled:cursor-not-allowed"
        onClick={onSelect}
        disabled={isOutOfService}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-white">{room.roomNumber}</p>
            <p className="text-sm text-slate-300">{room.name}</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {t(`spa.status.${(session?.sessionState || status).toLowerCase()}`)}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300">
          <span>
            {room.sessionPrice !== undefined ? (
              <span className="mr-1 text-sm font-semibold text-slate-100">
                {Number(room.sessionPrice).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            ) : null}
            {t("spa.perSession", { count: room.minimumMinutes })}
          </span>
          <span className="text-right">
            {session
              ? t("spa.guestCount", { count: session.guestCount })
              : t("spa.capacity", { count: room.capacity })}
          </span>
        </div>
        {session?.endsAt ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              warning.level === "EXPIRED"
                ? "text-red-300"
                : warning.level === "WARNING"
                  ? "text-amber-300"
                  : "text-slate-300"
            }`}
          >
            {warning.level === "EXPIRED"
              ? t("spa.timeUp")
              : t("spa.minutesRemaining", { count: warning.remainingMinutes })}
          </p>
        ) : null}
      </button>
      {isCleaning ? (
        <button
          type="button"
          className="mt-4 w-full rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5"
          onClick={onReady}
        >
          {t("spa.markReady")}
        </button>
      ) : null}
      <button
        type="button"
        className="mt-2 w-full rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
        onClick={onManage}
      >
        {t("spa.manageRoom")}
      </button>
    </article>
  );
}
