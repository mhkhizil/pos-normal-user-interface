import { SpaRoom } from "@/core/domain/entities/Spa";
import type { RoomKind } from "@/core/presentation/hooks/useRoomPos";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";
import { getKtvWarning } from "@/lib/ktv/session";
import { findActiveSpaSession } from "@/lib/spa/session";

export function SpaRoomTile({
  kind = "spa",
  room,
  nowMs,
  hostessNames,
  onSelect,
  onReady,
  onManage,
}: {
  kind?: RoomKind;
  room: SpaRoom;
  nowMs: number;
  /** KTV: the hostesses in this room now. */
  hostessNames?: string[];
  onSelect: () => void;
  onReady: () => void;
  onManage: () => void;
}) {
  const tr = useRoomText(kind);
  const session = findActiveSpaSession(room);
  const warning = getKtvWarning(session?.endsAt, nowMs);
  const status = String(room.status || "AVAILABLE").toUpperCase();
  const isCleaning = status === "CLEANING";
  // In use with nobody in it (its party was deleted): it can only be freed.
  const isStuck = status === "OCCUPIED" && !session;
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
            {tr(`status.${(session?.sessionState || status).toLowerCase()}`)}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300">
          {/* A SPA room has no price: the service package sold sets it. KTV sells by the hour. */}
          {kind === "ktv" ? (
            <span>
              {room.sessionPrice !== undefined ? (
                <span className="mr-1 text-sm font-semibold text-slate-100">
                  {Number(room.sessionPrice).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              ) : null}
              {tr("perSession", { count: room.minimumMinutes })}
            </span>
          ) : (
            <span />
          )}
          <span className="text-right">
            {session
              ? tr("guestCount", { count: session.guestCount })
              : tr("capacity", { count: room.capacity })}
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
              ? tr("timeUp")
              : tr("minutesRemaining", { count: warning.remainingMinutes })}
          </p>
        ) : null}
        {hostessNames?.length ? (
          <p className="mt-1 truncate text-sm text-pink-200">
            {tr("hostessesInRoom", { names: hostessNames.join(", ") })}
          </p>
        ) : null}
      </button>
      {isCleaning || isStuck ? (
        <button
          type="button"
          className="mt-4 w-full rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5"
          onClick={onReady}
        >
          {tr("markReady")}
        </button>
      ) : null}
      <button
        type="button"
        className="mt-2 w-full rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
        onClick={onManage}
      >
        {tr("manageRoom")}
      </button>
    </article>
  );
}
