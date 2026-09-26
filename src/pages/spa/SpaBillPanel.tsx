import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession, SpaSessionQuote } from "@/core/domain/entities/Spa";
import { getKtvWarning } from "@/lib/ktv/session";
import { estimateCardCharge } from "@/lib/spa/payment";
import { bookedSessions } from "@/lib/spa/session";
import { focPending, PendingItem, pendingKey, pendingTotal } from "@/lib/spa/pending";

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SpaBillPanel({
  room,
  session,
  card,
  wallet,
  quote,
  lines,
  itemNames,
  nowMs,
  isBusy,
  billClosed,
  onPrimary,
  primaryLabel,
  onTogglePause,
  onChangeQuantity,
  onAddAnother,
  onRemoveLine,
  pending,
  onPendingChange,
  onClearPending,
  onCommitPending,
  onToggleFoc,
  onChangeCard,
  onExtend,
}: {
  room: SpaRoom | null;
  session: SpaSession;
  card: GuestCard | null;
  wallet: GuestWallet | null;
  quote: SpaSessionQuote | null;
  lines: SalesOrderLine[];
  itemNames: Record<string, string>;
  nowMs: number;
  isBusy: boolean;
  billClosed: boolean;
  onPrimary: () => void;
  primaryLabel: string;
  onTogglePause: () => void;
  onChangeQuantity: (line: SalesOrderLine, delta: number) => void;
  onAddAnother: (line: SalesOrderLine) => void;
  onRemoveLine: (line: SalesOrderLine) => void;
  pending: PendingItem[];
  onPendingChange: (variantId: string, delta: number) => void;
  onClearPending: () => void;
  onCommitPending: () => void;
  onToggleFoc: (key: string) => void;
  onChangeCard: () => void;
  onExtend: () => void;
}) {
  const { t } = useTranslation();
  const warning = getKtvWarning(session.endsAt, nowMs);
  const discountBps = wallet?.discountBpsSnapshot || 0;
  const runningTotal = Number(quote?.runningTotal || 0);
  const discount = (runningTotal * discountBps) / 10000;
  const minutesIn = Math.max(0, (quote?.elapsedMinutes || 0) - (quote?.pausedMinutes || 0));
  const isPaused = session.sessionState === "PAUSED";
  const pendingCount = pending.reduce((sum, item) => sum + item.quantity, 0);
  const freeCount = focPending(pending).reduce((sum, item) => sum + item.quantity, 0);
  const prepaid = Boolean(quote?.prepaid);
  const visibleLines = lines.filter(
    (line) => !["VOIDED", "COMPED"].includes(String(line.status || "").toUpperCase())
  );

  const timeLine = [
    t("spa.startedShort", {
      time: new Date(session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }),
    session.plannedMinutes
      ? t("spa.minutesOfBooked", {
          count: minutesIn,
          booked: session.plannedMinutes,
          sessions: bookedSessions(session.plannedMinutes, room?.minimumMinutes || 60),
        })
      : t("spa.treatmentMinutes", { count: minutesIn }),
    t("spa.guestCount", { count: session.guestCount }),
  ].join(" · ");

  return (
    <aside className="flex min-h-0 flex-col gap-3 rounded-lg border border-slate-800 p-3 lg:overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-lg font-bold">
          {room?.roomNumber || quote?.roomNumber}
          {room?.name ? (
            <span className="ml-2 text-sm font-normal text-slate-400">{room.name}</span>
          ) : null}
        </p>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
            billClosed
              ? "bg-amber-900/60 text-amber-200"
              : isPaused
                ? "bg-slate-700 text-slate-200"
                : "bg-teal-900/60 text-teal-200"
          }`}
        >
          {billClosed
            ? t("spa.status.payment_pending")
            : t(`spa.status.${session.sessionState.toLowerCase()}`)}
        </span>
      </div>

      <div className="space-y-0.5 text-xs text-slate-400">
        {wallet ? (
          <p className="flex justify-between gap-2">
            <span className="truncate">
              <span className="font-semibold text-slate-200">{wallet.guestName}</span>
              {" · "}
              {wallet.tierNameSnapshot}
              {discountBps ? ` ${discountBps / 100}%` : ""}
              {card ? ` · …${card.cardUid.slice(-4)} ✓` : ""}
              {" "}
              <button
                type="button"
                className="text-teal-300 underline-offset-2 hover:underline"
                onClick={onChangeCard}
              >
                {t("spa.changeCard")}
              </button>
            </span>
            <span className={Number(wallet.balance) < 0 ? "text-amber-300" : "text-emerald-300"}>
              {Number(wallet.balance) < 0
                ? t("spa.owes", { amount: money(-Number(wallet.balance)) })
                : t("spa.balance", { amount: money(wallet.balance) })}
            </span>
          </p>
        ) : (
          <p>{t("spa.noCardYet")}</p>
        )}
        <p className="flex justify-between gap-2">
          <span className="truncate">{timeLine}</span>
          {session.endsAt && !billClosed ? (
            <span
              className={`shrink-0 font-semibold ${
                warning.level === "EXPIRED"
                  ? "text-red-300"
                  : warning.level === "WARNING"
                    ? "text-orange-300"
                    : "text-slate-200"
              }`}
            >
              {warning.level === "EXPIRED"
                ? t("spa.timeUp")
                : t("spa.minutesLeft", { count: warning.remainingMinutes })}
            </span>
          ) : null}
        </p>
      </div>

      <section className="min-h-[5rem] flex-1 divide-y divide-slate-800 overflow-y-auto border-y border-slate-800">
        {visibleLines.length === 0 ? (
          <p className="py-3 text-xs text-slate-500">{t("spa.noLines")}</p>
        ) : (
          visibleLines.map((line) => {
            const quantity = Number(line.quantity || 0);
            const unitPrice = Number(line.unitPrice || 0);
            const total = quantity * unitPrice - Number(line.lineDiscount || 0);
            const isTreatment = line.variantId === room?.rateVariantId;
            const isFoc = Boolean(line.compReasonId);
            const editable = !billClosed && !isTreatment;
            return (
              <div key={line.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {isFoc ? (
                      <span className="mr-1 rounded bg-fuchsia-900/70 px-1 text-[10px] font-bold text-fuchsia-200">
                        {t("spa.foc")}
                      </span>
                    ) : null}
                    {isTreatment
                      ? t("spa.treatmentCharge")
                      : line.productName || itemNames[line.variantId] || t("spa.item")}
                  </p>
                  <p className="text-xs text-slate-500">{money(unitPrice)}</p>
                </div>
                {editable && isFoc ? (
                  <span className="shrink-0 text-xs text-slate-400">
                    × {Number(quantity.toFixed(4))}
                  </span>
                ) : editable && prepaid ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-slate-400">× {Number(quantity.toFixed(4))}</span>
                    <button
                      type="button"
                      aria-label={t("spa.increase")}
                      className="h-7 w-7 rounded bg-slate-800 text-base disabled:opacity-40"
                      disabled={isBusy}
                      onClick={() => onAddAnother(line)}
                    >
                      +
                    </button>
                  </div>
                ) : editable ? (
                  <div className="flex shrink-0 items-center rounded bg-slate-800">
                    <button
                      type="button"
                      aria-label={t("spa.decrease")}
                      className="h-7 w-7 text-base disabled:opacity-40"
                      disabled={isBusy}
                      onClick={() => onChangeQuantity(line, -1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold">
                      {Number(quantity.toFixed(4))}
                    </span>
                    <button
                      type="button"
                      aria-label={t("spa.increase")}
                      className="h-7 w-7 text-base disabled:opacity-40"
                      disabled={isBusy}
                      onClick={() => onAddAnother(line)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">
                    × {Number(quantity.toFixed(4))}
                  </span>
                )}
                <span className="w-16 shrink-0 text-right font-semibold">
                  {money(total)}
                  {prepaid && !isFoc ? (
                    <span className="ml-1 text-xs text-emerald-400">✓</span>
                  ) : null}
                </span>
                {editable ? (
                  <button
                    type="button"
                    aria-label={prepaid && !isFoc ? t("spa.refundLine") : t("spa.removeLine")}
                    className="h-7 w-6 shrink-0 rounded text-slate-500 hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
                    disabled={isBusy}
                    onClick={() => onRemoveLine(line)}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {pending.length ? (
        <section className="flex shrink-0 flex-col gap-1 rounded border border-teal-700/70 bg-teal-950/20 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
            {t("spa.newItems")} · {pendingCount}
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {pending.map((item) => (
              <div key={pendingKey(item)} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">{money(item.unitPrice)}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={Boolean(item.foc)}
                  aria-label={t("spa.focToggle", { name: item.name })}
                  className={`h-7 shrink-0 rounded px-1.5 text-[10px] font-bold ${
                    item.foc
                      ? "bg-fuchsia-700 text-white"
                      : "border border-slate-700 text-slate-400"
                  }`}
                  onClick={() => onToggleFoc(pendingKey(item))}
                >
                  {t("spa.foc")}
                </button>
                <div className="flex shrink-0 items-center rounded bg-slate-800">
                  <button
                    type="button"
                    aria-label={t("spa.decreaseNew")}
                    className="h-7 w-7 text-base"
                    onClick={() => onPendingChange(pendingKey(item), -1)}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label={t("spa.increaseNew")}
                    className="h-7 w-7 text-base"
                    onClick={() => onPendingChange(pendingKey(item), 1)}
                  >
                    +
                  </button>
                </div>
                <span className="w-16 shrink-0 text-right font-semibold">
                  {item.foc ? t("spa.free") : money(item.unitPrice * item.quantity)}
                </span>
                <button
                  type="button"
                  aria-label={t("spa.removeNew")}
                  className="h-7 w-6 shrink-0 rounded text-slate-500 hover:bg-red-950/60 hover:text-red-300"
                  onClick={() => onPendingChange(pendingKey(item), -item.quantity)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
            <Button variant="secondary" disabled={isBusy} onClick={onClearPending}>
              {t("spa.clear")}
            </Button>
            <Button disabled={isBusy} onClick={onCommitPending}>
              {freeCount === pendingCount
                ? t("spa.giveFreeCount", { count: freeCount })
                : freeCount
                  ? t("spa.addToBillWithFree", {
                      count: pendingCount - freeCount,
                      amount: money(pendingTotal(pending)),
                      free: freeCount,
                    })
                  : t("spa.addToBill", {
                      count: pendingCount,
                      amount: money(pendingTotal(pending)),
                    })}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="shrink-0 space-y-0.5 text-sm">
        <p className="flex justify-between text-slate-300">
          <span>{billClosed ? t("spa.treatmentCharge") : t("spa.treatmentSoFar")}</span>
          <span>{money(quote?.treatmentCharge)}</span>
        </p>
        <p className="flex justify-between text-slate-300">
          <span>{t("spa.servicesCharge")}</span>
          <span>{money(quote?.servicesCharge)}</span>
        </p>
        {prepaid ? (
          <p className="flex justify-between pt-1 text-base font-bold text-emerald-300">
            <span>{t("spa.paidSoFar")}</span>
            <span>{money(quote?.paidTotal)}</span>
          </p>
        ) : null}
        {!prepaid && discount > 0 ? (
          <p className="flex justify-between text-teal-300">
            <span>{t("spa.discountLine", { percent: discountBps / 100 })}</span>
            <span>−{money(discount)}</span>
          </p>
        ) : null}
        {!prepaid ? (
          <>
            <p className="flex justify-between pt-1 text-base font-bold">
              <span>{t("spa.estimatedTotal")}</span>
              <span>{money(estimateCardCharge({ runningTotal, discountBps }))}</span>
            </p>
            <p className="text-[11px] text-slate-500">{t("spa.taxNote")}</p>
          </>
        ) : null}
      </section>

      {!billClosed ? (
        <div className={`grid shrink-0 gap-2 ${prepaid ? "grid-cols-3" : "grid-cols-2"}`}>
          <Button variant="secondary" disabled={isBusy} onClick={onTogglePause}>
            {isPaused ? t("spa.resume") : t("spa.pause")}
          </Button>
          {prepaid ? (
            <Button variant="secondary" disabled={isBusy} onClick={onExtend}>
              {t("spa.extend")}
            </Button>
          ) : null}
          <Button disabled={isBusy} onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      ) : (
        <p className="rounded border border-amber-500/60 bg-amber-950/40 p-2 text-xs text-amber-200">
          {t("spa.billClosed")}
        </p>
      )}
    </aside>
  );
}
