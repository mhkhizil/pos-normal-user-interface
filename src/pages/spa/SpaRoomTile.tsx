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
      ? "border-red-500 bg-red-950/50"
      : warning.level === "WARNING"
        ? "border-orange-400 bg-orange-950/40"
        : session
          ? "border-teal-500 bg-teal-950/35"
          : isOutOfService
            ? "border-slate-800 bg-slate-900/40 opacity-60"
            : "border-slate-700 bg-slate-900";

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
          <span className="rounded bg-black/40 px-2 py-1 text-xs font-semibold text-slate-200">
            {t(`spa.status.${(session?.sessionState || status).toLowerCase()}`)}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300">
          <span>{t("spa.perSession", { count: room.minimumMinutes })}</span>
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
                  ? "text-orange-300"
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
          className="mt-4 w-full rounded border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300"
          onClick={onReady}
        >
          {t("spa.markReady")}
        </button>
      ) : null}
      <button
        type="button"
        className="mt-2 w-full rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300"
        onClick={onManage}
      >
        {t("spa.manageRoom")}
      </button>
    </article>
  );
}
