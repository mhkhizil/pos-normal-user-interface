import { useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import {
  DiningTableStatus,
  TableSessionState,
} from "@/core/application/dtos/CashierDTO";
import {
  AdjustmentReason,
  DiningTable,
  PaymentMethod,
  Product,
  ProductVariant,
  SalesOrder,
  SalesOrderLine,
  TableSession,
} from "@/core/domain/entities/Cashier";
import { OrderTabs } from "./OrderTabs";
import { OrderAdjustments } from "./OrderAdjustments";
import { LineEditDialog, type LineEdit } from "./LineEditDialog";
import { BillOptionsDialog } from "./BillOptionsDialog";
import { isSettledSalesOrder } from "@/lib/pos/orderStatus";
import { modifierPrintText } from "@/lib/printing/modifierText";
import { isPendingKdsLine } from "@/lib/pos/kdsLines";
import { isFocLine } from "@/lib/pos/checkoutAdjustments";
import type { BillBreakdown } from "@/lib/pos/billBreakdown";
import { BillBreakdownRows } from "./BillBreakdownRows";
import { linePriceNote } from "@/lib/pos/linePrice";
import type {
  PromotionDiscount,
  RunningPromotion,
} from "@/core/domain/entities/Promotion";
import {
  appliedPromotionDiscount,
  linePromotionSaving,
  promotionSummary,
} from "@/lib/pos/promotions";
import { SeatingIcon } from "./SeatingIcon";
import {
  formatPosMoney,
  lineDisplayName,
  variantDisplayName,
} from "@/lib/pos/orderListDisplay";

export type GroupedSalesOrderLine = SalesOrderLine & {
  groupedLines?: SalesOrderLine[];
  groupedLineIds?: string[];
};

/**
 * One row for one ordered item. Post-KDS additions stay as separate pending
 * bill lines so the kitchen receives them, while the cashier still sees a
 * single combined quantity.
 */
export function groupOrderLines(
  lines: SalesOrderLine[],
  isFee: (line: SalesOrderLine) => boolean = () => false
): GroupedSalesOrderLine[] {
  const groups = new Map<string, SalesOrderLine[]>();
  for (const line of lines) {
    const key = JSON.stringify([
      line.variantId,
      // Two "Other" fees with different names stay apart.
      isFee(line) ? line.productName ?? "" : "",
      Number(line.unitPrice || 0).toFixed(4),
      line.selectedModifiers ?? null,
      // Each hostess's items stay hers.
      line.hostessId ?? "",
      // A note for the kitchen keeps its item apart.
      line.note ?? "",
      // A free item remains separate from the paid quantity of the same item.
      line.compReasonId ? "FOC" : "",
      line.status === "VOIDED" || line.status === "COMPED" ? line.status : "",
    ]);
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const pending = group.find(isPendingKdsLine);
    const representative = pending ?? group[0];
    const quantity = group.reduce(
      (total, line) => total + Number(line.quantity || 0),
      0
    );
    return Object.assign(new SalesOrderLine(representative), {
      quantity: quantity.toFixed(4),
      groupedLines: group,
      groupedLineIds: group.map((line) => line.id),
    });
  });
}

interface OrderPanelProps {
  selectedOrder: SalesOrder | null;
  selectedOrderLines: SalesOrderLine[];
  billLines?: SalesOrderLine[];
  products: Product[];
  variantsByProductId: Record<string, ProductVariant[]>;
  paymentMethods: PaymentMethod[];
  paymentMethodId: string;
  paymentAmount: string;
  total: string;
  /** How the total is made up, from the subtotal through each discount and charge. */
  breakdown?: BillBreakdown;
  selectedTable: DiningTable | null;
  selectedSession: TableSession | null;
  paymentInputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  checkoutBlocked?: boolean;
  canCreateOrder?: boolean;
  isDineInService?: boolean;
  feedback?: string | null;
  errorMessage?: string | null;
  tableOrderIds?: string[];
  hasActiveTableOrder?: boolean;
  onCreateOrder: () => void;
  onSelectTableOrder?: (orderId: string) => void;
  onAddTableOrder?: () => void;
  onManageTableOrders?: () => void;
  onIncreaseLineQuantity: (line: SalesOrderLine) => void;
  onDecreaseLineQuantity: (line: SalesOrderLine) => void;
  onRemoveLine: (line: SalesOrderLine) => void;
  /** Whether this bill charges tax and service charge, as on the pay screen. */
  chargeOptions?: {
    includeTax: boolean;
    includeServiceCharge: boolean;
    onChange: (field: "includeTax" | "includeServiceCharge", value: boolean) => void;
  };
  /** Save an item's details: its price on this bill only, and FOC. */
  onEditLine?: (line: GroupedSalesOrderLine, edit: LineEdit) => void;
  /** What the menu charges for a line, to show when the bill charges something else. */
  menuPrice?: (line: SalesOrderLine) => number | undefined;
  /** Hostesses working now, who may have ordered an item. */
  orderers?: { id: string; name: string }[];
  /** The shop's quick notes, offered when an item is edited. */
  quickNotes?: string[];
  /** The hostess a line names, and whether she gave it (a service) or ordered it. */
  lineHostess?: (line: SalesOrderLine) => { name: string; gave: boolean } | undefined;
  /** Promotions running at this till, as the server tells them. */
  promotions?: RunningPromotion[];
  /** What the running promotions take off the lines they have not priced yet. */
  promotionDiscounts?: Record<string, PromotionDiscount>;
  /** The name of a promotion already applied to a line, when it still exists. */
  promotionName?: (id: string | undefined) => string | undefined;
  discountAmount?: string;
  discountReasonId?: string;
  discountReasons?: AdjustmentReason[];
  serviceCharge?: string;
  tipAmount?: string;
  memberCardUid?: string;
  memberPointsLabel?: string;
  memberCardError?: string | null;
  isMemberCardLoading?: boolean;
  onDiscountAmountChange?: (value: string) => void;
  onDiscountReasonChange?: (value: string) => void;
  onRemoveDiscount?: () => void;
  onTipAmountChange?: (value: string) => void;
  onMemberCardUidChange?: (value: string) => void;
  onLookupMemberCard?: () => void;
  onPaymentAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  isSplitMode?: boolean;
  splitTenderCount?: number;
  splitRemaining?: number;
  isPayView?: boolean;
  requiresTableAssignment?: boolean;
  /** Whether Confirm pay prints the bill; the till ticks it when the guest wants one. */
  printBillOnConfirm?: boolean;
  onPrintBillOnConfirmChange?: (value: boolean) => void;
  onOpenPay?: () => void;
  /** False for staff who take orders but not money, such as waiters. */
  canTakePayment?: boolean;
  onCheckout: () => void;
  onPrintFinance?: () => void;
  onFireKds: () => void;
  onCancelOrder?: () => void;
  onPickup: () => void;
  onTableStatusChange: (status: DiningTableStatus) => void;
  onSessionStateChange: (state: TableSessionState) => void;
  /** Tables pushed together with this one for the same party. */
  joinedTables?: DiningTable[];
  onChangeTable?: () => void;
  onCombineTables?: () => void;
  onSplitItems?: () => void;
  onReleaseTable?: (tableId: string) => void;
  /** Opens the extra fee picker; no button without it. */
  onAddExtraFee?: () => void;
  isFeeLine?: (line: SalesOrderLine) => boolean;
}

const lineIconBase =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md border focus-visible:outline-blue-500 disabled:opacity-40";
const lineIconButton = `${lineIconBase} border-slate-300 text-slate-700 hover:bg-slate-100`;
const lineRemoveButton = `${lineIconBase} border-red-200 text-red-600 hover:bg-red-50`;

export function OrderPanel({
  selectedOrder,
  selectedOrderLines,
  billLines,
  products,
  variantsByProductId,
  paymentMethodId,
  paymentAmount,
  total,
  breakdown,
  selectedTable,
  selectedSession,
  isLoading,
  checkoutBlocked = false,
  canCreateOrder = true,
  isDineInService = false,
  feedback,
  errorMessage,
  tableOrderIds = [],
  hasActiveTableOrder = false,
  onCreateOrder,
  onSelectTableOrder,
  onAddTableOrder,
  onManageTableOrders,
  onIncreaseLineQuantity,
  onDecreaseLineQuantity,
  onRemoveLine,
  onEditLine,
  chargeOptions,
  menuPrice = () => undefined,
  orderers = [],
  quickNotes = [],
  lineHostess = () => undefined,
  promotions = [],
  promotionDiscounts = {},
  promotionName = () => undefined,
  discountAmount = "0.0000",
  discountReasonId = "",
  discountReasons = [],
  serviceCharge = "0.0000",
  tipAmount = "0.0000",
  memberCardUid = "",
  memberPointsLabel,
  memberCardError,
  isMemberCardLoading = false,
  onDiscountAmountChange,
  onDiscountReasonChange,
  onRemoveDiscount,
  onTipAmountChange,
  onMemberCardUidChange,
  onLookupMemberCard,
  isSplitMode = false,
  splitTenderCount = 0,
  splitRemaining = 0,
  isPayView = false,
  requiresTableAssignment = false,
  printBillOnConfirm = false,
  onPrintBillOnConfirmChange,
  onOpenPay,
  canTakePayment = true,
  onCheckout,
  onPrintFinance,
  onFireKds,
  onCancelOrder,
  onPickup,
  onTableStatusChange,
  onSessionStateChange,
  joinedTables = [],
  onAddExtraFee,
  isFeeLine,
  onChangeTable,
  onCombineTables,
  onSplitItems,
  onReleaseTable,
}: OrderPanelProps) {
  const { t } = useTranslation();
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false);
  // Rows stay compact like a bill; the price, options and actions open per row.
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});
  const [billOptions, setBillOptions] = useState<{
    orderId: string | undefined;
  } | null>(null);
  const [editing, setEditing] = useState<{
    orderId: string | undefined;
    lineId: string;
    promo?: string;
  } | null>(null);
  const groupedOrderLines = useMemo(
    () => groupOrderLines(selectedOrderLines, isFeeLine),
    [isFeeLine, selectedOrderLines]
  );
  const variants = Object.values(variantsByProductId).flat();
  const hasActiveOrder = !!selectedOrder || selectedOrderLines.length > 0;
  const hasMenuLines = selectedOrderLines.length > 0;
  const isSettledOrder = isSettledSalesOrder(selectedOrder);
  const checkoutReady = isSplitMode
    ? splitTenderCount > 0 && splitRemaining <= 0.009
    : Boolean(paymentMethodId) && Number(paymentAmount) > 0;
  /** The savings the server already credited, so they are inside the total. */
  const promotionDiscount = appliedPromotionDiscount(selectedOrderLines);

  useEffect(() => {
    if (!hasActiveOrder) setConfirmCancelOrder(false);
  }, [hasActiveOrder]);

  const resolveLineName = (line: SalesOrderLine) => {
    const variant = variants.find((item) => item.id === line.variantId);
    const product = variant
      ? products.find((item) => item.id === variant.productId)
      : undefined;
    // The name the order was saved with survives a refresh; the loaded menu is
    // only a fallback for lines built in this session, which carry no name yet.
    return (
      lineDisplayName(line) ||
      product?.name ||
      variant?.variantSku ||
      line.variantId.slice(0, 8)
    );
  };

  /** In the expanded details: which variant of the item this line is. */
  const resolveLineVariant = (line: SalesOrderLine) => {
    const variant = variants.find((item) => item.id === line.variantId);
    return variantDisplayName(line) || variantDisplayName(variant ?? {});
  };

  const hasTable = Boolean(selectedTable || selectedSession);
  const canAdjustBill = Boolean(onDiscountAmountChange && onTipAmountChange);
  const showBillOptions =
    billOptions !== null && billOptions.orderId === selectedOrder?.id;
  const billOptionsTitle = t(
    hasTable ? "cashier.billOptions.titleWithTable" : "cashier.billOptions.title"
  );
  const billOptionsSummary = [
    chargeOptions && !chargeOptions.includeTax ? t("cashier.billOptions.noTax") : null,
    chargeOptions && !chargeOptions.includeServiceCharge
      ? t("cashier.billOptions.noServiceCharge")
      : null,
    Number(discountAmount) > 0 ? `−${formatPosMoney(discountAmount)}` : null,
    Number(tipAmount) > 0
      ? t("cashier.billOptions.tipSummary", { amount: formatPosMoney(tipAmount) })
      : null,
    memberPointsLabel || null,
    selectedTable
      ? selectedTable.tableNumber ||
        t(`cashier.orderPanel.tableStatuses.${selectedTable.status}`)
      : null,
    selectedSession
      ? t(`cashier.orderPanel.sessionStates.${selectedSession.sessionState}`)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const tableControls = hasTable ? (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {selectedTable ? (
          <label
            className={[
              "min-w-0 space-y-1",
              selectedSession ? "" : "col-span-2",
            ].join(" ")}
          >
            <span className="text-xs text-slate-300">
              {t("cashier.orderPanel.tableStatusLabel")}
            </span>
            <select
              aria-label={t("cashier.orderPanel.tableStatus")}
              value={selectedTable.status}
              onChange={(event) =>
                onTableStatusChange(event.target.value as DiningTableStatus)
              }
              className="min-h-11 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              {(["AVAILABLE", "OCCUPIED", "DIRTY", "RESERVED"] as const).map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={
                      status === "AVAILABLE" && (hasMenuLines || hasActiveTableOrder)
                    }
                  >
                    {t(`cashier.orderPanel.tableStatuses.${status}`)}
                  </option>
                )
              )}
            </select>
          </label>
        ) : null}
        {selectedSession ? (
          <label
            className={[
              "min-w-0 space-y-1",
              selectedTable ? "" : "col-span-2",
            ].join(" ")}
          >
            <span className="text-xs text-slate-300">
              {t("cashier.orderPanel.sessionStateLabel")}
            </span>
            <select
              aria-label={t("cashier.orderPanel.sessionState")}
              value={selectedSession.sessionState}
              onChange={(event) =>
                onSessionStateChange(event.target.value as TableSessionState)
              }
              className="min-h-11 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              {(
                [
                  "SEATED",
                  "ORDERING",
                  "SERVED",
                  "PAYMENT_PENDING",
                  "CLOSED",
                ] as const
              ).map((state) => (
                <option key={state} value={state}>
                  {t(`cashier.orderPanel.sessionStates.${state}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {selectedSession && onChangeTable && onCombineTables ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["move", onChangeTable, "cashier.seating.changeTable"],
                ["split", onSplitItems, "cashier.seating.split"],
                ["merge", onCombineTables, "cashier.seating.combine"],
              ] as const
            ).map(([icon, onClick, label]) => (
              <button
                key={icon}
                type="button"
                disabled={isLoading || !onClick}
                onClick={onClick}
                title={t(label)}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded border border-slate-700 bg-slate-900 px-1 text-[11px] font-semibold text-slate-100 transition-colors hover:border-blue-500 hover:bg-blue-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SeatingIcon name={icon} />
                {t(label)}
              </button>
            ))}
          </div>
          {joinedTables.length && onReleaseTable ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">
                {t("cashier.seating.joinedTables")}:
              </span>
              {joinedTables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onReleaseTable(table.id)}
                  title={t("cashier.seating.release", {
                    table: table.tableNumber,
                  })}
                  aria-label={t("cashier.seating.release", {
                    table: table.tableNumber,
                  })}
                  className="min-h-11 rounded-full border border-slate-700 bg-slate-900 px-3 font-semibold text-slate-200 transition-colors hover:border-red-400 hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {table.tableNumber} ×
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const editingLine =
    editing && editing.orderId === selectedOrder?.id && !isSettledOrder
      ? groupedOrderLines.find((line) => line.id === editing.lineId)
      : undefined;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-3 text-slate-900 min-[1100px]:p-4">
      {tableOrderIds.length && onSelectTableOrder && onAddTableOrder && onManageTableOrders ? (
        <OrderTabs
          orderIds={tableOrderIds}
          activeOrderId={selectedOrder?.id}
          disabled={isLoading}
          onSelect={onSelectTableOrder}
          onAdd={onAddTableOrder}
          onManage={onManageTableOrders}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasActiveOrder ? (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {t("cashier.currentOrder")}
                </p>
                <p className="truncate font-semibold">
                  {selectedOrder?.orderNumber ||
                    selectedOrder?.id ||
                    t("cashier.orderPanel.quickCheckout")}
                </p>
                {selectedTable ? (
                  <p className="text-xs text-slate-500">
                    {t("cashier.table")}{" "}
                    {[selectedTable, ...joinedTables]
                      .map((table) => table.tableNumber)
                      .join(" + ")}
                  </p>
                ) : null}
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold">
                {selectedSession?.sessionState || selectedOrder?.status || "CART"}
              </span>
            </div>

            {promotions.length ? (
              <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                <span className="font-semibold">
                  {t("cashier.orderPanel.promotionsNow")}
                </span>{" "}
                {promotions
                  .map((promotion) =>
                    promotionSummary(promotion, {
                      freeTime: (buy, free) =>
                        t("cashier.orderPanel.promoFreeTime", { buy, free }),
                      money: formatPosMoney,
                    })
                  )
                  .join(" · ")}
              </p>
            ) : null}

            <div className="my-3 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
              {groupedOrderLines.map((line) => {
                const lineName = resolveLineName(line);
                const lineOptions = modifierPrintText(line.selectedModifiers).names;
                const lineVariant = resolveLineVariant(line);
                const groupLines = line.groupedLines ?? [line];
                const pricedLines = groupLines.map(
                  (entry) =>
                    billLines?.find((priced) => priced.id === entry.id) || entry
                );
                // A row shows what the item itself costs. Tax is a bill-level row
                // in the breakdown, so it is never added to — or taken out of — a
                // single item's price here.
                const lineTotal = pricedLines.reduce(
                  (sum, pricedLine) =>
                    sum +
                    Number(pricedLine.quantity || 0) *
                      Number(pricedLine.unitPrice || 0) -
                    Number(pricedLine.lineDiscount || 0),
                  0
                );
                const quantity = Number(line.quantity || 0);
                const quantityLabel =
                  Number.isFinite(quantity) && quantity % 1 === 0
                    ? String(Math.round(quantity))
                    : String(line.quantity || "0");
                // What the promotions take off this line: what the server already
                // credited it, or what the running rules would take off it.
                const savings = groupLines
                  .map((entry) =>
                    linePromotionSaving(entry, promotionDiscounts)
                  )
                  .filter((entry) => entry !== null);
                const saving = savings.length
                  ? {
                      amount: savings.reduce(
                        (sum, entry) => sum + entry.amount,
                        0
                      ),
                      names: [...new Set(savings.flatMap((entry) => entry.names))],
                    }
                  : null;
                const previewSaving = groupLines
                  .filter((entry) => !entry.appliedPromotionId)
                  .reduce((sum, entry) => {
                    const entrySaving = linePromotionSaving(
                      entry,
                      promotionDiscounts
                    );
                    return sum + (entrySaving?.amount || 0);
                  }, 0);
                const promoLabel =
                  (line.appliedPromotionId
                    ? promotionName(line.appliedPromotionId)
                    : undefined) ||
                  saving?.names.join(", ") ||
                  (saving ? t("cashier.orderPanel.promo") : "");
                // A previewed saving is not on the bill yet, so take it off here.
                const lineDue = lineTotal - previewSaving;
                const isPendingKds = isPendingKdsLine(line);
                const isFee = isFeeLine?.(line) ?? false;
                const listPrice = menuPrice(line);
                const priceNote = isFee ? undefined : linePriceNote(line.unitPrice, listPrice);
                const priceChanged = priceNote !== undefined;
                const hostess = lineHostess(line);
                const shownName = priceNote
                  ? t(`cashier.orderPanel.priceNote.${priceNote}`, { name: lineName })
                  : lineName;
                const isLocked = isLoading || isSettledOrder;
                const lineOpen = openLines[line.id] === true;
                return (
                  <div key={line.id} role="group" aria-label={shownName} className="bg-white px-2 py-1.5">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-1.5 text-left"
                      aria-expanded={lineOpen}
                      aria-label={t("cashier.orderPanel.lineDetails", { name: shownName })}
                      onClick={() =>
                        setOpenLines((current) => ({ ...current, [line.id]: !lineOpen }))
                      }
                    >
                      {!isFee && isPendingKds ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-emerald-500 bg-emerald-500"
                          aria-label={t("cashier.orderPanel.kdsPending")}
                          title={t("cashier.orderPanel.kdsPending")}
                        />
                      ) : null}
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                          {quantityLabel}×
                        </span>
                        {saving ? (
                          <span
                            className="shrink-0 rounded border border-emerald-600 px-1 text-[10px] font-semibold tracking-wide text-emerald-700"
                            title={promoLabel}
                          >
                            {t("cashier.orderPanel.promo")}
                          </span>
                        ) : null}
                        {isFee ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                            {t("cashier.extraFee.tag")}
                          </span>
                        ) : null}
                        {isFocLine(line) ? (
                          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-600">
                            {t("cashier.orderPanel.foc")}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate" title={shownName}>{shownName}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatPosMoney(lineDue)}
                      </span>
                      <SeatingIcon
                        name="chevron"
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          lineOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {lineOpen ? (
                      <>
                    <p
                      className="mt-0.5 truncate text-xs tabular-nums text-slate-500"
                      title={[lineVariant !== lineName ? lineVariant : "", lineOptions].filter(Boolean).join(" · ")}
                    >
                      {"@ "}
                      {formatPosMoney(line.unitPrice)}
                      {priceChanged ? (
                        <span
                          className="ml-1 text-slate-400 line-through"
                          aria-label={t("cashier.orderPanel.menuPriceWas", {
                            amount: formatPosMoney(listPrice),
                          })}
                        >
                          {formatPosMoney(listPrice)}
                        </span>
                      ) : null}
                      {lineVariant && lineVariant !== lineName ? ` · ${lineVariant}` : ""}
                      {lineOptions ? ` · ${lineOptions}` : ""}
                      {hostess?.gave ? ` · ${hostess.name}` : ""}
                    </p>
                    {hostess && !hostess.gave ? (
                      <p className="truncate text-xs font-medium text-pink-700">
                        {t("cashier.orderPanel.orderedBy", { name: hostess.name })}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="truncate text-xs italic text-slate-600">* {line.note}</p>
                    ) : null}
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={lineIconButton}
                          aria-label={t("cashier.orderPanel.decreaseQuantity")}
                          onClick={() => onDecreaseLineQuantity(line)}
                          disabled={isLocked}
                        >
                          <SeatingIcon name="minus" className="h-4 w-4" />
                        </button>
                        <span
                          className="min-w-[2.5ch] text-center text-sm font-semibold tabular-nums"
                          aria-label={t("cashier.orderPanel.lineQuantity", {
                            count: quantityLabel,
                          })}
                        >
                          {quantityLabel}
                        </span>
                        <button
                          type="button"
                          className={lineIconButton}
                          aria-label={t("cashier.orderPanel.increaseQuantity")}
                          onClick={() => onIncreaseLineQuantity(line)}
                          disabled={isLocked}
                        >
                          <SeatingIcon name="plus" className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={lineIconButton}
                          aria-label={t("cashier.orderPanel.editItem", { name: lineName })}
                          title={t("cashier.lineEdit.title")}
                          onClick={() =>
                            setEditing({
                              orderId: selectedOrder?.id,
                              lineId: line.id,
                              promo: saving
                                ? t("cashier.orderPanel.promoSaving", {
                                    name: promoLabel,
                                    amount: formatPosMoney(saving.amount),
                                  })
                                : undefined,
                            })
                          }
                          disabled={isLocked || !onEditLine}
                        >
                          <SeatingIcon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={lineRemoveButton}
                          aria-label={t("cashier.orderPanel.removeItem", { name: lineName })}
                          title={t("cashier.orderPanel.remove")}
                          onClick={() => onRemoveLine(line)}
                          disabled={isLocked}
                        >
                          <SeatingIcon name="remove" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
              {selectedOrderLines.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="mx-auto h-20 w-20 rounded-full bg-slate-100" />
                  <p className="mt-3 text-sm text-slate-400">
                    {t("cashier.orderPanel.emptyLines")}
                  </p>
                </div>
              ) : null}
            </div>
            {onAddExtraFee && !isSettledOrder ? (
              <button
                type="button"
                className="mb-3 inline-flex min-h-10 items-center gap-1 rounded border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-600 hover:border-blue-500 hover:text-blue-700 disabled:opacity-50"
                disabled={isLoading}
                onClick={onAddExtraFee}
              >
                + {t("cashier.extraFee.button")}
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center text-center">
            <div>
              <div className="mx-auto h-24 w-24 rounded-full bg-slate-100" />
              <p className="mt-3 text-sm text-slate-400">
                {t("cashier.orderPanel.noOrder")}
              </p>
            </div>
          </div>
        )}
      </div>

      {hasActiveOrder ? (
        <div className="max-h-[48%] shrink-0 space-y-2 overflow-y-auto border-t border-slate-200 pt-3">
          {breakdown ? (
            <BillBreakdownRows breakdown={breakdown} />
          ) : promotionDiscount > 0 ? (
            <p className="flex items-center justify-between text-sm text-emerald-700">
              <span>{t("cashier.orderPanel.promotionDiscount")}</span>
              <span className="tabular-nums">−{formatPosMoney(promotionDiscount)}</span>
            </p>
          ) : null}
          <div className="flex items-center justify-between font-semibold">
            <span>{t("cashier.total")}</span>
            <span className="tabular-nums">{formatPosMoney(total)}</span>
          </div>
          {isSplitMode || isPayView ? (
            <p className="text-xs text-slate-500">
              {isSplitMode
                ? splitTenderCount > 0 && splitRemaining <= 0.009
                  ? t("cashier.payment.splitCovered")
                  : t("cashier.payment.splitTenderCount", {
                      count: splitTenderCount,
                    })
                : t("cashier.payment.chooseMethod")}
            </p>
          ) : null}
          <div
            className={[
              "grid gap-2",
              selectedOrder?.serviceType === "PICK_UP" ? "grid-cols-3" : "grid-cols-2",
            ].join(" ")}
          >
            <Button
              variant="secondary"
              disabled={
                !selectedOrderLines.length ||
                isLoading ||
                isSettledOrder ||
                requiresTableAssignment
              }
              title={
                requiresTableAssignment
                  ? t("cashier.orderPanel.assignTableToContinue")
                  : undefined
              }
              onClick={onFireKds}
            >
              {t("cashier.orderPanel.sendKds")}
            </Button>
            {canAdjustBill || hasTable ? (
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-800 transition-colors hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-haspopup="dialog"
                onClick={() => setBillOptions({ orderId: selectedOrder?.id })}
              >
                <span className="flex max-w-full items-center gap-1.5">
                  <SeatingIcon name="options" className="h-4 w-4 shrink-0" />
                  <span className="truncate">{billOptionsTitle}</span>
                </span>
                {billOptionsSummary ? (
                  <span className="max-w-full truncate text-[11px] font-medium text-slate-500">
                    {billOptionsSummary}
                  </span>
                ) : null}
              </button>
            ) : (
              <span />
            )}
            {selectedOrder?.serviceType === "PICK_UP" ? (
              <Button
                variant="secondary"
                disabled={isLoading}
                onClick={onPickup}
              >
                {t("cashier.orderPanel.pickedUp")}
              </Button>
            ) : null}
          </div>
          {isPayView && canTakePayment ? (
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={printBillOnConfirm}
                disabled={isLoading}
                onChange={(event) =>
                  onPrintBillOnConfirmChange?.(event.target.checked)
                }
              />
              {t("cashier.payment.printBillOnConfirm")}
            </label>
          ) : null}
          {!canTakePayment ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-xs text-slate-600">
              {t("cashier.orderPanel.paymentAtCashier")}
            </p>
          ) : (
          <Button
            fullWidth
            disabled={
              isSettledOrder ||
              checkoutBlocked ||
              !selectedOrderLines.length ||
              isLoading ||
              requiresTableAssignment ||
              (isPayView && !checkoutReady)
            }
            title={
              requiresTableAssignment
                ? t("cashier.orderPanel.assignTableToContinue")
                : undefined
            }
            isLoading={isLoading}
            onClick={() => {
              if (!isPayView && onOpenPay) {
                onOpenPay();
                return;
              }
              onCheckout();
            }}
          >
            {isPayView ? t("cashier.confirmPay") : t("cashier.payNow")}
          </Button>
          )}
          {isPayView && onPrintFinance ? (
            <Button
              fullWidth
              className="!border-emerald-600 !bg-emerald-600 !text-white hover:!border-emerald-700 hover:!bg-emerald-700"
              disabled={isLoading || checkoutBlocked}
              onClick={onPrintFinance}
            >
              {t("cashier.printFinance")}
            </Button>
          ) : null}
          {onCancelOrder ? (
            confirmCancelOrder ? (
              <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
                <p className="text-xs text-rose-900">
                  {selectedTable
                    ? t("cashier.orderPanel.cancelOrderConfirmTable")
                    : t("cashier.orderPanel.cancelOrderConfirm")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isLoading}
                    onClick={() => setConfirmCancelOrder(false)}
                  >
                    {t("cashier.orderPanel.keepOrder")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isLoading}
                    isLoading={isLoading}
                    onClick={() => {
                      setConfirmCancelOrder(false);
                      onCancelOrder();
                    }}
                  >
                    {t("cashier.orderPanel.confirmCancelOrder")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                fullWidth
                variant="destructive"
                disabled={
                  isLoading ||
                  selectedOrder?.status === "CANCELLED" ||
                  selectedOrder?.status === "VOIDED"
                }
                onClick={() => setConfirmCancelOrder(true)}
              >
                {t("cashier.orderPanel.cancelOrder")}
              </Button>
            )
          ) : null}
        </div>
      ) : (
        <Button
          fullWidth
          isLoading={isLoading}
          disabled={!canCreateOrder || isLoading}
          onClick={onCreateOrder}
        >
          {isDineInService
            ? t("cashier.orderPanel.newDineInOrder")
            : t("cashier.newOrder")}
        </Button>
      )}

      {feedback || errorMessage ? (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3" aria-live="polite">
          {feedback ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
            >
              {feedback}
            </p>
          ) : null}
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {showBillOptions ? (
        <BillOptionsDialog
          title={billOptionsTitle}
          bill={onDiscountAmountChange && onTipAmountChange ? (
            <>
              {chargeOptions ? (
                <fieldset
                  className="space-y-1 rounded-md border border-slate-800 bg-slate-900/60 p-2"
                  disabled={isLoading || isSettledOrder}
                >
                  <legend className="sr-only">{t("cashier.payment.options")}</legend>
                  {(["includeTax", "includeServiceCharge"] as const).map((field) => (
                    <label
                      key={field}
                      className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={chargeOptions[field]}
                        onChange={(event) => chargeOptions.onChange(field, event.target.checked)}
                        className="h-5 w-5 accent-blue-500"
                      />
                      {t(`cashier.payment.${field}`)}
                    </label>
                  ))}
                  <p className="px-1 pb-1 text-xs text-slate-400">
                    {t("cashier.payment.optionsHint")}
                  </p>
                </fieldset>
              ) : null}
              <OrderAdjustments
                discountAmount={discountAmount}
                discountReasonId={discountReasonId}
                discountReasons={discountReasons}
                serviceCharge={serviceCharge}
                tipAmount={tipAmount}
                memberCardUid={memberCardUid}
                memberPointsLabel={memberPointsLabel}
                memberCardError={memberCardError}
                isMemberCardLoading={isMemberCardLoading}
                disabled={isLoading || isSettledOrder}
                onDiscountAmountChange={onDiscountAmountChange}
                onDiscountReasonChange={onDiscountReasonChange || (() => undefined)}
                onRemoveDiscount={onRemoveDiscount || (() => undefined)}
                onTipAmountChange={onTipAmountChange}
                onMemberCardUidChange={onMemberCardUidChange || (() => undefined)}
                onLookupMemberCard={onLookupMemberCard || (() => undefined)}
              />
            </>
          ) : undefined}
          table={tableControls}
          tableTitle={[
            t("cashier.billOptions.table"),
            selectedTable?.tableNumber,
          ]
            .filter(Boolean)
            .join(" ")}
          onClose={() => setBillOptions(null)}
        />
      ) : null}
      {editingLine ? (
        <LineEditDialog
          key={editingLine.id}
          name={resolveLineName(editingLine)}
          variant={resolveLineVariant(editingLine)}
          options={modifierPrintText(editingLine.selectedModifiers).names}
          promo={editing?.promo}
          quantity={Number(editingLine.quantity || 0)}
          unitPrice={Number(editingLine.unitPrice || 0)}
          menuPrice={menuPrice(editingLine)}
          isFoc={isFocLine(editingLine)}
          isFee={isFeeLine?.(editingLine) ?? false}
          orderers={
            isFeeLine?.(editingLine) || lineHostess(editingLine)?.gave ? undefined : orderers
          }
          orderedBy={editingLine.hostessId}
          note={editingLine.note}
          quickNotes={isFeeLine?.(editingLine) ? undefined : quickNotes}
          isBusy={isLoading}
          onSave={(edit) => {
            onEditLine?.(editingLine, edit);
            setEditing(null);
          }}
          onRemove={() => {
            onRemoveLine(editingLine);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </aside>
  );
}
