import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import {
  SalesOrder,
  SalesOrderLine,
} from "@/core/domain/entities/Cashier";
import { lineDisplayName, variantDisplayName } from "@/lib/pos/orderListDisplay";

interface MultiOrderingViewProps {
  tableLabel: string;
  orderIds: string[];
  orders: SalesOrder[];
  linesByOrderId: Record<string, SalesOrderLine[]>;
  activeOrderId?: string;
  selectedOrderIds: string[];
  isLoading?: boolean;
  onBack: () => void;
  onOpenOrder: (orderId: string) => void;
  onAddOrder: () => void;
  onSelectionChange: (orderIds: string[]) => void;
  onMergeAll: () => void;
  onMergeSelected: () => void;
  onSplitItems: (
    sourceOrderId: string,
    targetOrderId: string,
    lineIds: string[]
  ) => void;
}

export function MultiOrderingView({
  tableLabel,
  orderIds,
  orders,
  linesByOrderId,
  activeOrderId,
  selectedOrderIds,
  isLoading,
  onBack,
  onOpenOrder,
  onAddOrder,
  onSelectionChange,
  onMergeAll,
  onMergeSelected,
  onSplitItems,
}: MultiOrderingViewProps) {
  const { t } = useTranslation();
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [splitSourceId, setSplitSourceId] = useState("");
  const [splitTargetId, setSplitTargetId] = useState("");
  const [splitLineIds, setSplitLineIds] = useState<string[]>([]);

  const orderById = useMemo(
    () =>
      orders.reduce<Record<string, SalesOrder>>((result, order) => {
        result[order.id] = order;
        return result;
      }, {}),
    [orders]
  );

  const sourceLines = splitSourceId
    ? linesByOrderId[splitSourceId] || []
    : [];

  const toggleSelection = (orderId: string) => {
    onSelectionChange(
      selectedOrderIds.includes(orderId)
        ? selectedOrderIds.filter((id) => id !== orderId)
        : [...selectedOrderIds, orderId]
    );
  };

  const openSplit = () => {
    const source = activeOrderId || orderIds[1] || orderIds[0] || "";
    const target = orderIds.find((id) => id !== source) || "";
    setSplitSourceId(source);
    setSplitTargetId(target);
    setSplitLineIds([]);
    setIsSplitOpen(true);
  };

  const submitSplit = () => {
    if (!splitSourceId || !splitTargetId || !splitLineIds.length) return;
    onSplitItems(splitSourceId, splitTargetId, splitLineIds);
    setIsSplitOpen(false);
    setSplitLineIds([]);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#202020] text-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#111] px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-lg hover:bg-slate-700"
          aria-label={t("cashier.multiOrder.back")}
        >
          ←
        </button>
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">{tableLabel}</p>
          <p className="text-[10px] text-slate-400">
            {t("cashier.multiOrder.hint")}
          </p>
        </div>
        <Button
          size="sm"
          disabled={orderIds.length < 2 || isLoading}
          onClick={onMergeAll}
        >
          {t("cashier.multiOrder.mergeAll")}
        </Button>
        <Button
          size="sm"
          disabled={!selectedOrderIds.length || isLoading}
          onClick={onMergeSelected}
        >
          {t("cashier.multiOrder.mergeSelected")}
        </Button>
        <Button
          size="sm"
          disabled={orderIds.length < 2 || isLoading}
          className="bg-emerald-600 hover:bg-emerald-500"
          onClick={openSplit}
        >
          {t("cashier.multiOrder.splitItems")}
        </Button>
      </header>

      {isSplitOpen ? (
        <div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-white/10 bg-[#171717] p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-300">
              {t("cashier.multiOrder.sourceOrder")}
              <select
                value={splitSourceId}
                onChange={(event) => {
                  setSplitSourceId(event.target.value);
                  setSplitLineIds([]);
                  if (event.target.value === splitTargetId) {
                    setSplitTargetId(
                      orderIds.find((id) => id !== event.target.value) || ""
                    );
                  }
                }}
                className="mt-1 min-h-9 w-full rounded border border-slate-600 bg-slate-800 px-2"
              >
                {orderIds.map((id, index) => (
                  <option key={id} value={id}>
                    {t("cashier.multiOrder.orderNumber", { number: index + 1 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-300">
              {t("cashier.multiOrder.targetOrder")}
              <select
                value={splitTargetId}
                onChange={(event) => setSplitTargetId(event.target.value)}
                className="mt-1 min-h-9 w-full rounded border border-slate-600 bg-slate-800 px-2"
              >
                {orderIds
                  .filter((id) => id !== splitSourceId)
                  .map((id) => (
                    <option key={id} value={id}>
                      {t("cashier.multiOrder.orderNumber", {
                        number: orderIds.indexOf(id) + 1,
                      })}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {sourceLines.map((line) => {
              const lineName = lineDisplayName(line) || line.variantId.slice(0, 8);
              const lineVariant = variantDisplayName(line);
              return (
                <label
                  key={line.id}
                  className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={splitLineIds.includes(line.id)}
                    onChange={() =>
                      setSplitLineIds((current) =>
                        current.includes(line.id)
                          ? current.filter((id) => id !== line.id)
                          : [...current, line.id]
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {lineName} × {Number(line.quantity)}
                    </span>
                    {lineVariant && !lineName.includes(lineVariant) ? (
                      <span className="block truncate text-[10px] text-slate-400">
                        {lineVariant}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {!sourceLines.length ? (
              <p className="text-xs text-slate-500">
                {t("cashier.multiOrder.noItems")}
              </p>
            ) : null}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsSplitOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!splitTargetId || !splitLineIds.length || isLoading}
              onClick={submitSplit}
            >
              {t("cashier.multiOrder.moveItems")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 auto-rows-[11rem] grid-cols-1 gap-1 overflow-y-auto p-1 min-[640px]:grid-cols-2 min-[1050px]:grid-cols-3">
        {orderIds.map((orderId, index) => {
          const order = orderById[orderId];
          const lines = linesByOrderId[orderId] || [];
          const isPrimary = index === 0;
          return (
            <article
              key={orderId}
              className={[
                "flex min-h-0 flex-col border bg-white text-slate-900",
                activeOrderId === orderId
                  ? "border-blue-500"
                  : "border-slate-300",
              ].join(" ")}
            >
              <header className="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={selectedOrderIds.includes(orderId)}
                  disabled={isPrimary}
                  onChange={() => toggleSelection(orderId)}
                  aria-label={t("cashier.multiOrder.selectOrder", {
                    number: index + 1,
                  })}
                />
                <span className="font-bold text-blue-600">
                  {index + 1}. {order?.orderNumber || orderId.slice(0, 8)}
                </span>
                {isPrimary ? (
                  <span className="ml-auto text-[9px] uppercase text-slate-400">
                    {t("cashier.multiOrder.primary")}
                  </span>
                ) : null}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
                {lines.slice(0, 4).map((line) => {
                  const lineName = lineDisplayName(line) || line.variantId.slice(0, 8);
                  const lineVariant = variantDisplayName(line);
                  return (
                    <div
                      key={line.id}
                      className="flex justify-between gap-2 py-0.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{lineName}</span>
                        {lineVariant && !lineName.includes(lineVariant) ? (
                          <span className="block truncate text-[10px] text-slate-500">
                            {lineVariant}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0">× {Number(line.quantity)}</span>
                    </div>
                  );
                })}
                {!lines.length ? (
                  <p className="text-slate-400">
                    {t("cashier.multiOrder.emptyOrder")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onOpenOrder(orderId)}
                className="border-t border-slate-200 px-2 py-1 text-right text-[10px] font-semibold text-blue-600 hover:bg-blue-50"
              >
                {t("cashier.multiOrder.details")}
              </button>
            </article>
          );
        })}

        <button
          type="button"
          disabled={isLoading}
          onClick={onAddOrder}
          className="flex flex-col items-center justify-center border border-white/10 bg-[#444] text-white transition hover:bg-[#505050] disabled:opacity-50"
        >
          <span className="text-3xl font-light">+</span>
          <span className="mt-1 text-xs">{t("cashier.multiOrder.new")}</span>
        </button>
      </div>
    </section>
  );
}
