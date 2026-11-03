import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SalesOrderLine } from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { SpaRoom, SpaSession, SpaSessionQuote } from "@/core/domain/entities/Spa";
import type { RoomKind } from "@/core/presentation/hooks/useRoomPos";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { LadyPicker } from "../ktv/LadyPicker";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";
import { getKtvWarning } from "@/lib/ktv/session";
import { estimateCardCharge } from "@/lib/spa/payment";
import { BillLineGroup, groupBillLines, isGivenFree } from "@/lib/spa/billLines";
import { linePriceNote } from "@/lib/pos/linePrice";
import { bookedSessions } from "@/lib/spa/session";
import {
  focPending,
  PendingItem,
  pendingKey,
  pendingSaving,
  pendingTotal,
} from "@/lib/spa/pending";
import type { PromotionDiscount, RunningPromotion } from "@/core/domain/entities/Promotion";
import type { BillBreakdown } from "@/lib/pos/billBreakdown";
import { SeatingIcon } from "../cashier/SeatingIcon";
import { BillBreakdownRows } from "../cashier/BillBreakdownRows";

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const rowIconBase =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md border focus-visible:outline-blue-500 disabled:opacity-40";
const rowIconButton = `${rowIconBase} border-slate-600 text-slate-200 hover:bg-slate-800`;
const rowRemoveButton = `${rowIconBase} border-red-900 text-red-300 hover:bg-red-950/60`;

export function SpaBillPanel({
  kind = "spa",
  room,
  session,
  card,
  wallet,
  quote,
  lines,
  itemNames,
  nowMs,
  isBusy,
  tip = 0,
  billClosed,
  paid = false,
  onPrimary,
  primaryLabel,
  onTogglePause,
  onOpenBill,
  onMoveRoom,
  onSplitRoom,
  onMergeRoom,
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
  promotions = [],
  pendingDiscounts = {},
  promotionName = () => undefined,
  packageVariantIds,
  rentalVariantIds,
  breakdown,
  extraFeeLabel,
  onAddExtraFee,
  orderers = [],
  allLadies,
  onOrderedBy,
  orderedByName = () => undefined,
  menuPrice = () => undefined,
  onEditLine,
}: {
  kind?: RoomKind;
  room: SpaRoom | null;
  session: SpaSession;
  card: GuestCard | null;
  wallet: GuestWallet | null;
  quote: SpaSessionQuote | null;
  lines: SalesOrderLine[];
  itemNames: Record<string, string>;
  nowMs: number;
  isBusy: boolean;
  tip?: number;
  billClosed: boolean;
  paid?: boolean;
  onPrimary: () => void;
  primaryLabel: string;
  /** Restarts the clock of a room paused before pausing was taken away. */
  onTogglePause: () => void;
  /** Adjusts the bill as a whole (tax, service charge, discount, tip), as on the cashier. */
  onOpenBill?: () => void;
  /** Move the visit to a free room. */
  onMoveRoom?: () => void;
  /** Split items off or merge another room in; only on a bill paid at the end. */
  onSplitRoom?: () => void;
  onMergeRoom?: () => void;
  onChangeQuantity: (line: SalesOrderLine, delta: number) => void;
  onAddAnother: (line: SalesOrderLine) => void;
  /** Removes a row: every line it shows. */
  onRemoveLine: (lines: SalesOrderLine[]) => void;
  pending: PendingItem[];
  onPendingChange: (variantId: string, delta: number) => void;
  onClearPending: () => void;
  onCommitPending: () => void;
  onToggleFoc: (key: string) => void;
  onChangeCard: () => void;
  onExtend: () => void;
  promotions?: RunningPromotion[];
  pendingDiscounts?: Record<string, PromotionDiscount>;
  promotionName?: (id: string | undefined) => string | undefined;
  /** SPA package lines: booked treatments, shown by name and never edited. */
  packageVariantIds?: Set<string>;
  /**
   * KTV: every rate the room sells (its own rate, an hour, a half hour). They are
   * all room time, so a row of any of them is shown and never edited from the bill.
   */
  rentalVariantIds?: Set<string>;
  /** A bill paid at the end: how its total is made up, as on the cashier. */
  breakdown?: BillBreakdown;
  extraFeeLabel?: string;
  onAddExtraFee?: () => void;
  /** Hostesses with this room, who may order a dish or drink. */
  orderers?: { id: string; name: string }[];
  /** KTV: every lady on duty, so one not with this room can be named too. */
  allLadies?: Hostess[];
  onOrderedBy?: (key: string, hostess?: { id: string; name: string }) => void;
  /** The hostess who ordered a menu line, when one did. */
  orderedByName?: (line: SalesOrderLine) => string | undefined;
  /** What the menu charges for one of a line, to show a price changed on this bill. */
  menuPrice?: (line: SalesOrderLine) => number | undefined;
  /** A bill paid at the end: change a row's price, FOC or who ordered it, as on the cashier. */
  onEditLine?: (group: BillLineGroup) => void;
}) {
  const tr = useRoomText(kind);
  const { t } = useTranslation();
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [ladyFor, setLadyFor] = useState<PendingItem | null>(null);
  const warning = getKtvWarning(session.endsAt, nowMs);
  const discountBps = wallet?.discountBpsSnapshot || 0;
  const pendingDue = pendingTotal(pending) - pendingSaving(pending, pendingDiscounts);
  const runningTotal = Number(quote?.runningTotal || 0);
  const discount = (runningTotal * discountBps) / 10000;
  const minutesIn = Math.max(0, (quote?.elapsedMinutes || 0) - (quote?.pausedMinutes || 0));
  const isPaused = session.sessionState === "PAUSED";
  const pendingCount = pending.reduce((sum, item) => sum + item.quantity, 0);
  const freeCount = focPending(pending).reduce((sum, item) => sum + item.quantity, 0);
  const prepaid = Boolean(quote?.prepaid);
  // Time is bought (paid now, or on the bill to pay at the end), never run up on a clock.
  const canExtend = prepaid || quote?.paymentTiming === "PAY_AT_END";
  // Bill & table joins the row whenever the bill can still be adjusted; Extend
  // only when the room's time is bought rather than metered. Rooms are no longer
  // paused; one paused before that can still be resumed.
  const actionCount = (isPaused ? 1 : 0) + (onOpenBill ? 1 : 0) + (canExtend ? 1 : 0) + 1;
  const actionGrid =
    actionCount >= 4 ? "grid-cols-4" : actionCount === 3 ? "grid-cols-3" : "grid-cols-2";
  const visibleLines = groupBillLines(
    lines.filter(
      (line) => !["VOIDED", "COMPED"].includes(String(line.status || "").toUpperCase())
    )
  );

  const timeLine = [
    tr("startedShort", {
      time: new Date(session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }),
    session.plannedMinutes
      ? tr("minutesOfBooked", {
          count: minutesIn,
          booked: session.plannedMinutes,
          sessions: bookedSessions(session.plannedMinutes, room?.minimumMinutes || 60),
        })
      : tr("treatmentMinutes", { count: minutesIn }),
    tr("guestCount", { count: session.guestCount }),
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
            paid
              ? "border border-emerald-500/40 text-emerald-200"
              : billClosed
                ? "border border-amber-500/40 text-amber-200"
                : isPaused
                  ? "border border-slate-700 text-slate-400"
                  : "border border-slate-600 text-slate-200"
          }`}
        >
          {paid
            ? tr("status.paid")
            : billClosed
              ? tr("status.payment_pending")
              : tr(`status.${session.sessionState.toLowerCase()}`)}
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
                className="text-slate-300 underline underline-offset-2 hover:text-white"
                onClick={onChangeCard}
              >
                {tr("changeCard")}
              </button>
            </span>
            <span className={Number(wallet.balance) < 0 ? "text-amber-300" : "text-slate-200"}>
              {Number(wallet.balance) < 0
                ? tr("owes", { amount: money(-Number(wallet.balance)) })
                : tr("balance", { amount: money(wallet.balance) })}
            </span>
          </p>
        ) : (
          <p>{tr("noCardYet")}</p>
        )}
        <p className="flex justify-between gap-2">
          <span className="truncate">{timeLine}</span>
          {session.endsAt && !billClosed ? (
            <span
              className={`shrink-0 font-semibold ${
                warning.level === "EXPIRED"
                  ? "text-red-300"
                  : warning.level === "WARNING"
                    ? "text-amber-300"
                    : "text-slate-200"
              }`}
            >
              {warning.level === "EXPIRED"
                ? tr("timeUp")
                : tr("minutesLeft", { count: warning.remainingMinutes })}
            </span>
          ) : null}
        </p>
      </div>

      {promotions.length ? (
        <p className="shrink-0 rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-200">
          <span className="font-semibold">{tr("promotionsNow")}</span>{" "}
          {promotions
            .map((promotion) =>
              promotion.discountType === "FREE_TIME"
                ? `${promotion.name} (${tr("freeTimeDeal", {
                    buy: promotion.buyUnits ?? 1,
                    free: promotion.freeUnits ?? 1,
                  })})`
                : promotion.discountType === "PERCENT_OFF"
                  ? `${promotion.name} (${promotion.discountValue}%)`
                  : `${promotion.name} (−${money(promotion.discountValue)})`
            )
            .join(" · ")}
        </p>
      ) : null}

      <section className="min-h-[5rem] flex-1 divide-y divide-slate-800 overflow-y-auto border-y border-slate-800">
        {visibleLines.length === 0 ? (
          <p className="py-3 text-xs text-slate-500">{tr("noLines")}</p>
        ) : (
          visibleLines.map((group) => {
            const [line] = group.lines;
            const newest = group.lines[group.lines.length - 1];
            const { quantity, total } = group;
            const unitPrice = Number(line.unitPrice || 0);
            // A promotion can split one item into several copies of its own line,
            // so the promo badge belongs to whichever copy carries it.
            const promotedLine = group.lines.find((item) => item.appliedPromotionId);
            const isPackage = Boolean(packageVariantIds?.has(line.variantId));
            // Room time: the room's own rate, and any other rate the party bought
            // (an hour, a half hour) - the same time sold in another block.
            const isRoomTime =
              line.variantId === room?.rateVariantId ||
              Boolean(rentalVariantIds?.has(line.variantId));
            const isTreatment = isRoomTime || isPackage;
            const isFoc = isGivenFree(line);
            const listPrice = menuPrice(line);
            const priceNote =
              isFoc || promotedLine ? undefined : linePriceNote(line.unitPrice, listPrice);
            const lineName =
              isTreatment && !isPackage
                ? tr("treatmentCharge")
                : line.productName || itemNames[line.variantId] || tr("item");
            // Time a promotion gave free is the promotion's; changing it would charge it.
            const canEdit = Boolean(onEditLine) && !billClosed && !(isRoomTime && promotedLine);
            // What one of the row is charged: a copy a promotion gave away, or one
            // given free, reads 0 here instead of the menu or session price.
            const chargedUnit =
              (promotedLine || isFoc) && quantity > 0
                ? Math.max(0, total / quantity)
                : unitPrice;
            const editable = !billClosed && !isTreatment;
            const quantityLabel = Number(quantity.toFixed(4));
            const shownName = priceNote
              ? t(`cashier.orderPanel.priceNote.${priceNote}`, { name: lineName })
              : lineName;
            const isOpen = openRows[group.key] === true;
            const promoText = promotedLine ? promotionName(promotedLine.appliedPromotionId) : undefined;
            return (
              <div key={group.key} role="group" aria-label={shownName} className="py-1.5 text-sm">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-1.5 text-left"
                  aria-expanded={isOpen}
                  aria-label={t("cashier.orderPanel.lineDetails", { name: shownName })}
                  onClick={() => setOpenRows((current) => ({ ...current, [group.key]: !isOpen }))}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                      {quantityLabel}×
                    </span>
                    {promotedLine ? (
                      <span
                        className="shrink-0 rounded border border-emerald-600 px-1 text-[10px] font-semibold tracking-wide text-emerald-300"
                        title={promoText}
                      >
                        {tr("promo")}
                      </span>
                    ) : null}
                    {isFoc ? (
                      <span className="shrink-0 rounded border border-slate-500 px-1 text-[10px] font-semibold tracking-wide text-slate-300">
                        {tr("foc")}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate" title={shownName}>
                      {shownName}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {money(total)}
                    {prepaid && !isFoc ? (
                      <span className="ml-1 text-xs text-slate-500">✓</span>
                    ) : null}
                  </span>
                  <SeatingIcon
                    name="chevron"
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen ? (
                  <>
                    <p className="mt-0.5 truncate text-xs tabular-nums text-slate-500">
                      {"@ "}
                      {money(chargedUnit)}
                      {priceNote ? (
                        <span
                          className="ml-1 text-slate-600 line-through"
                          aria-label={t("cashier.orderPanel.menuPriceWas", {
                            amount: money(listPrice),
                          })}
                        >
                          {money(listPrice)}
                        </span>
                      ) : null}
                      {promoText ? ` · ${promoText}` : ""}
                    </p>
                    {orderedByName(line) ? (
                      <p className="truncate text-xs font-medium text-pink-300">
                        {tr("orderedBy", { name: orderedByName(line) })}
                      </p>
                    ) : null}
                    {editable || canEdit ? (
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {editable && !isFoc && !prepaid ? (
                            <button
                              type="button"
                              className={rowIconButton}
                              aria-label={tr("decrease")}
                              disabled={isBusy}
                              onClick={() => onChangeQuantity(newest, -1)}
                            >
                              <SeatingIcon name="minus" className="h-4 w-4" />
                            </button>
                          ) : null}
                          {editable && !isFoc ? (
                            <>
                              <span className="min-w-[2.5ch] text-center font-semibold tabular-nums">
                                {quantityLabel}
                              </span>
                              <button
                                type="button"
                                className={rowIconButton}
                                aria-label={tr("increase")}
                                disabled={isBusy}
                                onClick={() => onAddAnother(line)}
                              >
                                <SeatingIcon name="plus" className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit ? (
                            <button
                              type="button"
                              className={rowIconButton}
                              aria-label={t("cashier.orderPanel.editItem", { name: lineName })}
                              title={t("cashier.lineEdit.title")}
                              disabled={isBusy}
                              onClick={() => onEditLine?.(group)}
                            >
                              <SeatingIcon name="edit" className="h-4 w-4" />
                            </button>
                          ) : null}
                          {editable ? (
                            <button
                              type="button"
                              className={rowRemoveButton}
                              aria-label={prepaid && !isFoc ? tr("refundLine") : tr("removeLine")}
                              disabled={isBusy}
                              onClick={() => onRemoveLine(group.lines)}
                            >
                              <SeatingIcon name="remove" className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {onAddExtraFee ? (
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 self-start rounded border border-dashed border-slate-600 px-3 text-sm font-medium text-slate-300 hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
          disabled={isBusy}
          onClick={onAddExtraFee}
        >
          + {extraFeeLabel}
        </button>
      ) : null}

      {pending.length ? (
        <section className="flex shrink-0 flex-col gap-1 rounded border border-slate-700 bg-slate-900/70 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {tr("newItems")} · {pendingCount}
          </p>
          <div className="max-h-56 divide-y divide-slate-800/70 overflow-y-auto pr-1">
            {pending.map((item) => {
              const deal = item.foc ? undefined : pendingDiscounts[item.variantId];
              const full = item.unitPrice * item.quantity;
              return (
              <div key={pendingKey(item)} className="space-y-1 py-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium leading-snug">{item.name}</p>
                  <span className="shrink-0 text-right font-semibold">
                    {item.foc ? (
                      tr("free")
                    ) : deal?.discount ? (
                      <>
                        <span className="mr-1 text-xs font-normal text-slate-500 line-through">
                          {money(full)}
                        </span>
                        {money(full - deal.discount)}
                      </>
                    ) : (
                      money(full)
                    )}
                  </span>
                </div>
                {!item.service && (orderers.length || allLadies) && onOrderedBy ? (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="text-slate-500">{tr("orderedByLabel")}</span>
                    {[
                      undefined,
                      ...orderers,
                      ...(item.hostessId && !orderers.some((entry) => entry.id === item.hostessId)
                        ? [{ id: item.hostessId, name: item.hostessName || tr("aHostess") }]
                        : []),
                    ].map((hostess) => {
                      const chosen = (item.hostessId || undefined) === hostess?.id;
                      return (
                        <button
                          key={hostess?.id || "customer"}
                          type="button"
                          aria-pressed={chosen}
                          className={`min-h-7 rounded border px-2 ${
                            chosen
                              ? "border-pink-400 bg-pink-500/20 text-pink-100"
                              : "border-slate-700 text-slate-400"
                          }`}
                          onClick={() => onOrderedBy(pendingKey(item), hostess)}
                        >
                          {hostess?.name || tr("customer")}
                        </button>
                      );
                    })}
                    {allLadies ? (
                      <button
                        type="button"
                        className="min-h-7 rounded border border-dashed border-slate-600 px-2 text-slate-300"
                        onClick={() => setLadyFor(item)}
                      >
                        {tr("allLadies")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {deal?.discount ? (
                  <p className="text-xs text-emerald-300">
                    {tr("promoSaving", {
                      name: deal.names.join(", "),
                      amount: money(deal.discount),
                    })}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-slate-500">{money(item.unitPrice)}</span>
                  <button
                    type="button"
                    aria-pressed={Boolean(item.foc)}
                    aria-label={tr("focToggle", { name: item.name })}
                    className={`h-7 shrink-0 rounded px-1.5 text-[10px] font-bold ${
                      item.foc
                        ? "border border-slate-200 bg-slate-200 text-slate-900"
                        : "border border-slate-700 text-slate-400"
                    }`}
                    onClick={() => onToggleFoc(pendingKey(item))}
                  >
                    {tr("foc")}
                  </button>
                  <div className="flex shrink-0 items-center rounded bg-slate-800">
                    <button
                      type="button"
                      aria-label={tr("decreaseNew")}
                      className="h-7 w-7 text-base"
                      onClick={() => onPendingChange(pendingKey(item), -1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={tr("increaseNew")}
                      className="h-7 w-7 text-base"
                      onClick={() => onPendingChange(pendingKey(item), 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={tr("removeNew")}
                    className="h-7 w-6 shrink-0 rounded text-slate-500 hover:bg-red-950/60 hover:text-red-300"
                    onClick={() => onPendingChange(pendingKey(item), -item.quantity)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
            <Button variant="secondary" disabled={isBusy} onClick={onClearPending}>
              {tr("clear")}
            </Button>
            <Button disabled={isBusy} onClick={onCommitPending}>
              {freeCount === pendingCount
                ? tr("giveFreeCount", { count: freeCount })
                : freeCount
                  ? tr("addToBillWithFree", {
                      count: pendingCount - freeCount,
                      amount: money(pendingDue),
                      free: freeCount,
                    })
                  : tr("addToBill", {
                      count: pendingCount,
                      amount: money(pendingDue),
                    })}
            </Button>
          </div>
        </section>
      ) : null}

      {breakdown ? (
        <section className="shrink-0 space-y-1 text-sm">
          <BillBreakdownRows breakdown={breakdown} dark />
          <p className="flex justify-between border-t border-slate-800 pt-1.5 text-base font-bold">
            <span>{tr("estimatedTotal")}</span>
            <span>{money(breakdown.total)}</span>
          </p>
        </section>
      ) : (
      <section className="shrink-0 space-y-0.5 text-sm">
        <p className="flex justify-between text-slate-300">
          <span>{billClosed ? tr("treatmentCharge") : tr("treatmentSoFar")}</span>
          <span>{money(quote?.treatmentCharge)}</span>
        </p>
        <p className="flex justify-between text-slate-300">
          <span>{tr("servicesCharge")}</span>
          <span>{money(quote?.servicesCharge)}</span>
        </p>
        {prepaid ? (
          <p className="flex justify-between border-t border-slate-800 pt-1.5 text-base font-semibold text-white">
            <span>{tr("paidSoFar")}</span>
            <span>{money(quote?.paidTotal)}</span>
          </p>
        ) : null}
        {!prepaid && discount > 0 ? (
          <p className="flex justify-between text-slate-300">
            <span>{tr("discountLine", { percent: discountBps / 100 })}</span>
            <span>−{money(discount)}</span>
          </p>
        ) : null}
        {!prepaid && tip > 0 ? (
          <p className="flex justify-between text-slate-300">
            <span>{tr("tip")}</span>
            <span>{money(tip)}</span>
          </p>
        ) : null}
        {!prepaid ? (
          <>
            <p className="flex justify-between pt-1 text-base font-bold">
              <span>{tr("estimatedTotal")}</span>
              <span>{money(estimateCardCharge({ runningTotal, discountBps, tip }))}</span>
            </p>
            <p className="text-[11px] text-slate-500">{tr("taxNote")}</p>
          </>
        ) : null}
      </section>
      )}

      {!billClosed && onMoveRoom ? (
        <div className="grid shrink-0 grid-cols-3 gap-2">
          {(
            [
              ["move", onMoveRoom, "floor.move"],
              ["split", onSplitRoom, "floor.split"],
              ["merge", onMergeRoom, "floor.merge"],
            ] as const
          ).map(([icon, onClick, label]) => (
            <button
              key={icon}
              type="button"
              disabled={isBusy || !onClick}
              onClick={onClick}
              title={onClick ? tr(label) : tr("floor.paidAsItGoes")}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded border border-slate-700 bg-slate-900 px-1 text-[11px] font-semibold text-slate-100 transition-colors hover:border-blue-500 hover:bg-blue-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SeatingIcon name={icon} />
              {tr(label)}
            </button>
          ))}
        </div>
      ) : null}

      {!billClosed ? (
        <div className={`grid shrink-0 gap-2 ${actionGrid}`}>
          {onOpenBill ? (
            <Button
              variant="secondary"
              className="min-w-0 px-2 leading-tight"
              disabled={isBusy}
              onClick={onOpenBill}
            >
              {t("cashier.billOptions.titleWithTable")}
            </Button>
          ) : null}
          {isPaused ? (
            <Button
              variant="secondary"
              className="min-w-0 px-2 leading-tight"
              disabled={isBusy}
              onClick={onTogglePause}
            >
              {tr("resume")}
            </Button>
          ) : null}
          {canExtend ? (
            <Button
              variant="secondary"
              className="min-w-0 px-2 leading-tight"
              disabled={isBusy}
              onClick={onExtend}
            >
              {tr("extend")}
            </Button>
          ) : null}
          <Button
            className="min-w-0 px-2 leading-tight"
            disabled={isBusy}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
        </div>
      ) : (
        <p className="rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300">
          {paid ? tr("billPaid") : tr("billClosed")}
        </p>
      )}
      {ladyFor && allLadies && onOrderedBy ? (
        <LadyPicker
          itemName={ladyFor.name}
          ladies={allLadies}
          roomNumber={room?.roomNumber}
          onPick={(hostess) => {
            onOrderedBy(pendingKey(ladyFor), {
              id: hostess.id,
              name: hostess.nickname || hostess.name,
            });
            setLadyFor(null);
          }}
          onCancel={() => setLadyFor(null)}
        />
      ) : null}
    </aside>
  );
}
