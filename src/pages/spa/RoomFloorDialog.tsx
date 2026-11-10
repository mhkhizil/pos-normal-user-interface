import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { SpaRoom, SpaSession } from "@/core/domain/entities/Spa";
import type {
  RoomSplitLine,
  RoomSplitTarget,
} from "@/core/infrastructure/repositories/ApiRoomFloorRepository";
import { RoomKind } from "@/core/presentation/hooks/useRoomPos";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";
import { findActiveSpaSession } from "@/lib/spa/session";
import { lineDisplayName } from "@/lib/pos/orderListDisplay";

export type RoomFloorMode = "move" | "split" | "merge";

interface RoomFloorDialogProps {
  kind: RoomKind;
  mode: RoomFloorMode;
  room: SpaRoom;
  session: SpaSession;
  rooms: SpaRoom[];
  lines: SalesOrderLine[];
  itemNames: Record<string, string>;
  isBusy?: boolean;
  onMove: (roomId: string) => void;
  onMerge: (sourceSessionId: string) => void;
  onSplit: (target: RoomSplitTarget, lines: RoomSplitLine[]) => void;
  onClose: () => void;
}

const tileClass =
  "min-h-14 rounded-md border px-2 py-2 text-left text-sm font-semibold transition";
const stepClass =
  "h-11 w-11 rounded-md border border-slate-700 bg-slate-900 text-lg disabled:opacity-40";

const keyOf = (target: RoomSplitTarget) =>
  "sessionId" in target ? `s:${target.sessionId}` : `r:${target.roomId}`;

/** Move the visit to a free room, bring another room's bill in, or split items off. */
export function RoomFloorDialog({
  kind,
  mode,
  room,
  session,
  rooms,
  lines,
  itemNames,
  isBusy = false,
  onMove,
  onMerge,
  onSplit,
  onClose,
}: RoomFloorDialogProps) {
  const { t } = useTranslation();
  const tr = useRoomText(kind);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<RoomSplitTarget | null>(null);

  const others = rooms.filter((item) => item.id !== room.id);
  const inUse = others
    .map((item) => ({ room: item, session: findActiveSpaSession(item) }))
    .filter(
      (entry): entry is { room: SpaRoom; session: SpaSession } =>
        Boolean(entry.session) && entry.session!.id !== session.id
    );
  const free = others.filter(
    (item) => item.status === "AVAILABLE" && !findActiveSpaSession(item)
  );
  const splittable = lines.filter(
    (line) =>
      line.id &&
      !["VOIDED", "COMPED"].includes(String(line.status || "").toUpperCase()) &&
      Number(line.quantity) > 0
  );
  const chosen = splittable
    .map((line) => ({ lineId: line.id, quantity: picked[line.id] ?? 0 }))
    .filter((line) => line.quantity > 0);

  const nameOf = (line: SalesOrderLine) =>
    lineDisplayName(line) || itemNames[line.variantId] || tr("item");
  const setQuantity = (line: SalesOrderLine, quantity: number) =>
    setPicked((current) => ({
      ...current,
      [line.id]: Math.min(Number(line.quantity), Math.max(0, quantity)),
    }));

  const tile = (candidate: RoomSplitTarget, label: string, detail: string) => {
    const selected = target !== null && keyOf(target) === keyOf(candidate);
    return (
      <button
        key={keyOf(candidate)}
        type="button"
        disabled={isBusy}
        aria-pressed={selected}
        onClick={() => setTarget(candidate)}
        className={[
          tileClass,
          selected
            ? "border-blue-500 bg-blue-600/20"
            : "border-slate-700 bg-slate-900 hover:border-blue-500",
        ].join(" ")}
      >
        {label}
        <span className="block text-[10px] font-normal text-slate-400">{detail}</span>
      </button>
    );
  };

  const candidates = [
    ...(mode !== "move"
      ? inUse.map((entry) =>
          tile({ sessionId: entry.session.id }, entry.room.roomNumber, tr("floor.inUse"))
        )
      : []),
    ...(mode !== "merge"
      ? free.map((item) => tile({ roomId: item.id }, item.roomNumber, tr("floor.free")))
      : []),
  ];

  const confirm = () => {
    if (!target) return;
    if (mode === "move" && "roomId" in target) onMove(target.roomId);
    if (mode === "merge" && "sessionId" in target) onMerge(target.sessionId);
    if (mode === "split") onSplit(target, chosen);
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-floor-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5 text-slate-100"
      >
        <div>
          <h2 id="room-floor-title" className="text-lg font-bold">
            {tr(`floor.${mode}Title`, { room: room.roomNumber })}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{tr(`floor.${mode}Hint`)}</p>
        </div>

        {mode === "split" ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("cashier.seating.itemsToMove")}
            </h3>
            {splittable.length ? (
              <ul className="divide-y divide-slate-800 rounded border border-slate-800">
                {splittable.map((line) => {
                  const quantity = picked[line.id] ?? 0;
                  const max = Number(line.quantity);
                  return (
                    <li key={line.id} className="flex items-center gap-3 p-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{nameOf(line)}</span>
                        <span className="text-xs text-slate-400">
                          {t("cashier.seating.onBill", { count: max })}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={stepClass}
                        aria-label={t("cashier.orderPanel.decreaseQuantity")}
                        disabled={isBusy || quantity <= 0}
                        onClick={() => setQuantity(line, quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-8 text-center tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        className={stepClass}
                        aria-label={t("cashier.orderPanel.increaseQuantity")}
                        disabled={isBusy || quantity >= max}
                        onClick={() => setQuantity(line, quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="h-11 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-semibold disabled:opacity-40"
                        disabled={isBusy || quantity === max}
                        onClick={() => setQuantity(line, max)}
                      >
                        {t("cashier.seating.all")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("cashier.seating.noItems")}</p>
            )}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {tr(`floor.${mode}To`)}
          </h3>
          {candidates.length ? (
            <div className="grid grid-cols-3 gap-2 min-[500px]:grid-cols-4">{candidates}</div>
          ) : (
            <p className="text-sm text-slate-500">{tr("floor.noRooms")}</p>
          )}
        </section>

        <Button
          fullWidth
          isLoading={isBusy}
          disabled={!target || (mode === "split" && !chosen.length)}
          onClick={confirm}
        >
          {mode === "split"
            ? t("cashier.seating.moveItems", { count: chosen.length })
            : tr(`floor.${mode}`)}
        </Button>
        <Button variant="outline" fullWidth disabled={isBusy} onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
