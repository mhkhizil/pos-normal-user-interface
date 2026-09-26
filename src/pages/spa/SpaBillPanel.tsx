import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession, SpaSessionQuote } from "@/core/domain/entities/Spa";
import { getKtvWarning } from "@/lib/ktv/session";
import { estimateCardCharge } from "@/lib/spa/payment";

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
  onRemoveLine,
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
  onRemoveLine: (line: SalesOrderLine) => void;
}) {
  const { t } = useTranslation();
  const warning = getKtvWarning(session.endsAt, nowMs);
  const discountBps = wallet?.discountBpsSnapshot || 0;
  const runningTotal = Number(quote?.runningTotal || 0);
  const discount = (runningTotal * discountBps) / 10000;
  const minutesIn = Math.max(0, (quote?.elapsedMinutes || 0) - (quote?.pausedMinutes || 0));
  const isPaused = session.sessionState === "PAUSED";
  const visibleLines = lines.filter(
    (line) => !["VOIDED", "COMPED"].includes(String(line.status || "").toUpperCase())
  );

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-bold">{room?.roomNumber || quote?.roomNumber}</p>
          {room?.name ? <p className="text-sm text-slate-400">{room.name}</p> : null}
        </div>
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${
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

      {wallet ? (
        <section className="space-y-1 rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
          <p className="font-semibold">{wallet.guestName}</p>
          <p className="text-slate-400">
            {t("spa.tier", { tier: wallet.tierNameSnapshot, percent: discountBps / 100 })}
          </p>
          {card ? <p className="text-slate-500">{t("spa.cardLabel", { uid: card.cardUid })}</p> : null}
          <p className={Number(wallet.balance) < 0 ? "text-amber-300" : "text-emerald-300"}>
            {wallet.isPostpaidSnapshot
              ? t("spa.tabBalance", { amount: money(wallet.balance) })
              : t("spa.balance", { amount: money(wallet.balance) })}
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
        <span className="text-slate-400">{t("spa.startedAt")}</span>
        <span className="text-right">{new Date(session.openedAt).toLocaleTimeString()}</span>
        <span className="text-slate-400">{t("spa.timeIn")}</span>
        <span className="text-right">{t("spa.treatmentMinutes", { count: minutesIn })}</span>
        {session.plannedMinutes ? (
          <>
            <span className="text-slate-400">{t("spa.booked")}</span>
            <span className="text-right">
              {t("spa.treatmentMinutes", { count: session.plannedMinutes })}
            </span>
          </>
        ) : null}
        {session.endsAt && !billClosed ? (
          <>
            <span className="text-slate-400">{t("spa.remaining")}</span>
            <span
              className={`text-right font-semibold ${
                warning.level === "EXPIRED"
                  ? "text-red-300"
                  : warning.level === "WARNING"
                    ? "text-orange-300"
                    : ""
              }`}
            >
              {warning.level === "EXPIRED"
                ? t("spa.timeUp")
                : t("spa.treatmentMinutes", { count: warning.remainingMinutes })}
            </span>
          </>
        ) : null}
        <span className="text-slate-400">{t("spa.guestCountLabel")}</span>
        <span className="text-right">{session.guestCount}</span>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-300">{t("spa.billLines")}</p>
        {visibleLines.length === 0 ? (
          <p className="text-xs text-slate-500">{t("spa.noLines")}</p>
        ) : (
          visibleLines.map((line) => {
            const quantity = Number(line.quantity || 0);
            const unitPrice = Number(line.unitPrice || 0);
            const total = quantity * unitPrice - Number(line.lineDiscount || 0);
            const isTreatment = line.variantId === room?.rateVariantId;
            const editable = !billClosed && !isTreatment;
            return (
              <div key={line.id} className="rounded border border-slate-800 p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {isTreatment
                      ? t("spa.treatmentCharge")
                      : line.productName || itemNames[line.variantId] || t("spa.item")}
                  </span>
                  <span className="font-semibold">{money(total)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    {money(unitPrice)} × {Number(quantity.toFixed(4))}
                  </span>
                  {editable ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("spa.decrease")}
                        className="h-7 w-7 rounded bg-slate-800 text-base text-white disabled:opacity-40"
                        disabled={isBusy}
                        onClick={() => onChangeQuantity(line, -1)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={t("spa.increase")}
                        className="h-7 w-7 rounded bg-slate-800 text-base text-white disabled:opacity-40"
                        disabled={isBusy}
                        onClick={() => onChangeQuantity(line, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={t("spa.removeLine")}
                        className="h-7 rounded px-2 text-red-300 hover:bg-red-950/60 disabled:opacity-40"
                        disabled={isBusy}
                        onClick={() => onRemoveLine(line)}
                      >
                        {t("spa.remove")}
                      </button>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-1 border-t border-slate-800 pt-2 text-sm">
        <p className="flex justify-between">
          <span>{billClosed ? t("spa.treatmentCharge") : t("spa.treatmentSoFar")}</span>
          <span>{money(quote?.treatmentCharge)}</span>
        </p>
        <p className="flex justify-between">
          <span>{t("spa.servicesCharge")}</span>
          <span>{money(quote?.servicesCharge)}</span>
        </p>
        {discount > 0 ? (
          <p className="flex justify-between text-teal-300">
            <span>{t("spa.discountLine", { percent: discountBps / 100 })}</span>
            <span>−{money(discount)}</span>
          </p>
        ) : null}
        <p className="flex justify-between text-base font-bold">
          <span>{t("spa.estimatedTotal")}</span>
          <span>
            {money(estimateCardCharge({ runningTotal, discountBps }))}
          </span>
        </p>
        <p className="text-xs text-slate-500">{t("spa.taxNote")}</p>
      </section>

      {!billClosed ? (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={isBusy} onClick={onTogglePause}>
            {isPaused ? t("spa.resume") : t("spa.pause")}
          </Button>
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
