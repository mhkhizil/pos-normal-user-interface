import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiLoadingState } from "@/components/ApiLoadingState";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { OrderStatus } from "@/core/application/dtos/CashierDTO";
import type { SalesOrderEditDTO } from "@/core/application/dtos/SalesOrderDTO";
import { SalesOrder } from "@/core/domain/entities/Cashier";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useExtraFees } from "@/core/presentation/hooks/useExtraFees";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { useRoomText } from "@/core/presentation/hooks/useRoomText";
import { useWorkingHostesses } from "@/core/presentation/hooks/useWorkingHostesses";
import { useDateFormatter, useNumberFormatter } from "@/lib/i18n/formatters";
import {
  formatPosQuantity,
  lineDisplayName,
  salesOrderServiceTypeKey,
  salesOrderStatusKey,
} from "@/lib/pos/orderListDisplay";
import { cashierLabel } from "@/lib/printing/cashier";
import { reprintSlip } from "@/lib/printing/reprintSlip";
import { EditOrderDialog } from "./salesOrders/EditOrderDialog";
import { useVenueSetting } from "@/core/presentation/hooks/useVenueSetting";

type StatusTab = "open" | "completed" | "voided";
type ServiceFilter = "ALL" | "DINE_IN" | "TAKE_AWAY" | "DELIVERY" | "PICK_UP";

const serviceFilters: { id: ServiceFilter; labelKey: string }[] = [
  { id: "ALL", labelKey: "salesOrders.serviceFilters.all" },
  { id: "DINE_IN", labelKey: "salesOrders.serviceFilters.dineIn" },
  { id: "TAKE_AWAY", labelKey: "salesOrders.serviceFilters.takeAway" },
  { id: "DELIVERY", labelKey: "salesOrders.serviceFilters.delivery" },
  { id: "PICK_UP", labelKey: "salesOrders.serviceFilters.pickUp" },
];

const matchesServiceFilter = (order: SalesOrder, filter: ServiceFilter) => {
  if (filter === "ALL") return true;
  const type = String(order.serviceType || "").toUpperCase();
  if (filter === "DINE_IN") return type === "DINE_IN" || type === "TABLE";
  if (filter === "TAKE_AWAY") return type === "TAKE_AWAY" || type === "TAKEAWAY";
  if (filter === "DELIVERY") return type === "DELIVERY";
  return type === "PICK_UP" || type === "COUNTER";
};

const statusBadgeClass = (status?: string) => {
  const key = salesOrderStatusKey(status);
  if (key.endsWith("completed")) return "bg-emerald-500 text-white";
  if (key.endsWith("voided")) return "bg-red-500 text-white";
  if (key.endsWith("refunded") || key.endsWith("partiallyRefunded")) {
    return "bg-amber-500 text-slate-950";
  }
  return "bg-[#1a9bff] text-white";
};

const statusTabFilters: Record<StatusTab, OrderStatus | undefined> = {
  open: "DRAFT",
  completed: "COMPLETED",
  voided: "VOIDED",
};

const isVoidedSalesOrder = (order: Pick<SalesOrder, "status">) =>
  String(order.status || "").toUpperCase() === "VOIDED";

const isCompletedSalesOrder = (order: Pick<SalesOrder, "status">) =>
  String(order.status || "").toUpperCase() === "COMPLETED";

function EmptyIllustration() {
  return (
    <svg
      viewBox="0 0 120 96"
      className="mx-auto h-24 w-28 text-slate-500"
      aria-hidden="true"
    >
      <rect x="22" y="20" width="76" height="58" rx="6" fill="currentColor" opacity="0.2" />
      <rect x="30" y="30" width="44" height="4" rx="2" fill="currentColor" opacity="0.45" />
      <rect x="30" y="40" width="56" height="4" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="30" y="50" width="48" height="4" rx="2" fill="currentColor" opacity="0.35" />
      <path
        d="M78 12 L96 8 L90 28 Z"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

export function SalesOrdersPage() {
  const venue = useVenueSetting();
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormatter();
  const { formatCurrency } = useNumberFormatter();
  const { user } = useAuth();
  const { activeLocationId, activePosRegisterId } = usePosWorkspace();
  const {
    orders,
    page,
    totalPages,
    selectedOrder,
    orderLines,
    isLoading,
    error,
    fetchOrders,
    fetchOrderById,
    fetchOrderLines,
    createOrder,
    deleteOrder,
    fireOrderLine,
    readyOrderLine,
    serveOrderLine,
    previewOrderEdit,
    editOrder,
    fetchOrderEdits,
    clearSelectedOrder,
  } = useSalesOrderManagement();

  const [statusTab, setStatusTab] = useState<StatusTab>("open");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("ALL");
  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<SalesOrderEditDTO[]>([]);

  const tenantId = String(user?.tenantId || "");
  const locationId = activeLocationId;
  const printer = usePrinterConnection(tenantId, activePosRegisterId, locationId);
  const { isFeeLine } = useExtraFees();
  const ktvText = useRoomText("ktv");
  const spaText = useRoomText("spa");
  const { hostesses, load: loadHostesses } = useWorkingHostesses();

  useEffect(() => {
    void loadHostesses();
  }, [loadHostesses]);

  const hostessName = useCallback(
    (id: string) => {
      const hostess = hostesses.find((item) => item.id === id);
      return hostess ? hostess.nickname || hostess.name : undefined;
    },
    [hostesses]
  );

  const statusFilter = statusTabFilters[statusTab];

  useEffect(() => {
    void fetchOrders({
      page: 1,
      limit: 20,
      search: search.trim() || undefined,
      status: statusFilter,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  }, [fetchOrders, search, statusFilter]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => matchesServiceFilter(order, serviceFilter)),
    [orders, serviceFilter]
  );

  const loadEdits = useCallback(
    (order: SalesOrder) => {
      setEdits([]);
      if (String(order.status || "").toUpperCase() === "DRAFT") return;
      fetchOrderEdits(order.id)
        .then(setEdits)
        .catch(() => setEdits([]));
    },
    [fetchOrderEdits]
  );

  const handleSelectOrder = async (order: SalesOrder) => {
    setLocalError(null);
    setNotice(null);
    loadEdits(order);
    try {
      await fetchOrderById(order.id);
      await fetchOrderLines(order.id, { page: 1, limit: 50 });
    } catch {
      // surfaced via hook error
    }
  };

  const handleEdited = async (orderNumber: string) => {
    setEditing(false);
    setNotice(t("salesOrders.edit.saved", { number: orderNumber }));
    if (!selectedOrder) return;
    try {
      const fresh = await fetchOrderById(selectedOrder.id);
      await fetchOrderLines(selectedOrder.id, { page: 1, limit: 50 });
      loadEdits(fresh);
      await fetchOrders({
        page,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    } catch {
      // surfaced via hook error
    }
  };

  const handleCreateOrder = async () => {
    if (!tenantId || !locationId) {
      setLocalError(t("salesOrders.errors.missingContext"));
      return;
    }
    setLocalError(null);
    setNotice(null);
    try {
      const order = await createOrder({
        tenantId,
        locationId,
        salesChannel: "POS",
        idempotencyKey: `sales-order-${Date.now()}`,
        subtotal: "0.0000",
        totalDiscount: "0.0000",
        totalTax: "0.0000",
        grandTotal: "0.0000",
        status: "DRAFT",
      });
      setNotice(t("salesOrders.created", { number: order.orderNumber || order.id }));
      await fetchOrderLines(order.id, { page: 1, limit: 50 });
    } catch {
      // surfaced via hook error
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    setLocalError(null);
    try {
      await deleteOrder(selectedOrder.id);
      clearSelectedOrder();
      setNotice(t("salesOrders.deleted"));
      await fetchOrders({
        page,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    } catch {
      // surfaced via hook error
    }
  };

  const handlePrintCheckout = async () => {
    if (!selectedOrder) return;
    setLocalError(null);
    try {
      const isRoom = Boolean(selectedOrder.place && selectedOrder.place.kind !== "TABLE");
      const tr = selectedOrder.place?.kind === "KTV" ? ktvText : spaText;
      await printer.printReceipt(
        reprintSlip({
          order: selectedOrder,
          lines: orderLines,
          outletName: selectedOrder.locationName,
          cashier: cashierLabel(selectedOrder.cashier, user),
          hostessName,
          isFeeLine,
          formatDateTime,
          showTax:
            venue.taxShown?.[
              selectedOrder.place?.kind === "KTV"
                ? "KTV"
                : selectedOrder.place?.kind === "SPA"
                  ? "SPA"
                  : "BAR"
            ] !== false,
          text: {
            item: isRoom ? tr("item") : t("salesOrders.item"),
            aHostess: isRoom ? tr("aHostess") : t("cashier.orderPanel.aHostess"),
            promo: t("cashier.orderPanel.promo"),
            tip: isRoom ? tr("tip") : t("receipt.tip"),
            startTime: t("receipt.startTime"),
            endTime: t("receipt.endTime"),
            serviceType: (service) => {
              const key = `settings.cashier.serviceTypes.${service}`;
              const label = t(key);
              return label === key ? service.replaceAll("_", " ") : label;
            },
            priceNote: (note, name) => t(`cashier.orderPanel.priceNote.${note}`, { name }),
          },
        })
      );
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : t("salesOrders.printFailed"));
    }
  };

  const runLineAction = async (
    lineId: string,
    action: "fire" | "ready" | "serve"
  ) => {
    if (!selectedOrder) return;
    setLocalError(null);
    try {
      if (action === "fire") await fireOrderLine(selectedOrder.id, lineId);
      if (action === "ready") await readyOrderLine(selectedOrder.id, lineId);
      if (action === "serve") await serveOrderLine(selectedOrder.id, lineId);
      setNotice(t("salesOrders.lineUpdated"));
    } catch {
      // surfaced via hook error
    }
  };

  const money = (value: unknown) => formatCurrency(Number(value) || 0);

  const orderSummary = (order: SalesOrder) => {
    const parts = [
      order.customerName || t("salesOrders.walkIn"),
      t(salesOrderServiceTypeKey(order.serviceType)),
    ];
    if (order.pickupNumber) {
      parts.push(t("salesOrders.pickup", { number: order.pickupNumber }));
    }
    if (order.itemSummary) {
      parts.push(order.itemSummary);
    } else if (order.itemCount === 1) {
      parts.push(t("salesOrders.itemCountOne"));
    } else if (order.itemCount && order.itemCount > 1) {
      parts.push(t("salesOrders.itemCount", { count: order.itemCount }));
    }
    return parts.join(" · ");
  };

  const feedback = localError || error || notice;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#080808] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["open", "completed", "voided"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setStatusTab(tab);
                clearSelectedOrder();
              }}
              className={[
                "min-h-10 rounded-md px-4 text-sm font-medium transition",
                statusTab === tab
                  ? "bg-[#1a9bff] text-white"
                  : "bg-white text-slate-900 hover:bg-slate-100",
              ].join(" ")}
            >
              {t(`salesOrders.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleCreateOrder()}
          disabled={isLoading}
          aria-label={t("salesOrders.create")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#39c786] text-2xl font-light text-slate-950 transition hover:brightness-110 disabled:opacity-50"
        >
          +
        </button>
      </header>

      <div className="px-4 pb-3">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("salesOrders.search")}
          className="w-full rounded-md border-0 bg-white text-slate-900"
        />
      </div>

      {feedback ? (
        <p
          role={localError || error ? "alert" : "status"}
          className={[
            "mx-4 mb-3 rounded px-3 py-2 text-sm",
            localError || error
              ? "bg-red-950/50 text-red-200"
              : "bg-emerald-950/40 text-emerald-200",
          ].join(" ")}
        >
          {feedback}
        </p>
      ) : null}

      <div className="pos-split grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,1fr)_minmax(24rem,1fr)_auto] gap-3 overflow-y-auto px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)_6.5rem] lg:grid-rows-1 lg:overflow-hidden">
        <div className="pos-pane-scroll rounded-md bg-[#101010]">
          {isLoading && visibleOrders.length === 0 ? (
            <ApiLoadingState label={t("salesOrders.loading")} />
          ) : visibleOrders.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <EmptyIllustration />
              <p className="mt-4 text-sm text-slate-400">{t("salesOrders.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {visibleOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      aria-label={order.orderNumber || order.id}
                      onClick={() => void handleSelectOrder(order)}
                      className={[
                        "w-full px-4 py-3 text-left transition",
                        isSelected ? "bg-[#1a9bff]/20" : "hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate font-semibold">
                          {order.orderNumber || order.id.slice(0, 8)}
                        </p>
                        {!isVoidedSalesOrder(order) ? (
                          <p className="shrink-0 font-semibold">
                            {money(order.grandTotal)}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(order.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
                            statusBadgeClass(order.status),
                          ].join(" ")}
                        >
                          {t(salesOrderStatusKey(order.status))}
                        </span>
                        {order.itemCount != null ? (
                          <span className="text-[11px] text-slate-400">
                            {order.itemCount === 1
                              ? t("salesOrders.itemCountOne")
                              : t("salesOrders.itemCount", {
                                  count: order.itemCount,
                                })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {orderSummary(order)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-slate-400">
              <span>
                {t("salesOrders.page", { page, totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() =>
                    void fetchOrders({
                      page: page - 1,
                      limit: 20,
                      search: search.trim() || undefined,
                      status: statusFilter,
                      sortBy: "createdAt",
                      sortOrder: "desc",
                    })
                  }
                >
                  {t("salesOrders.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() =>
                    void fetchOrders({
                      page: page + 1,
                      limit: 20,
                      search: search.trim() || undefined,
                      status: statusFilter,
                      sortBy: "createdAt",
                      sortOrder: "desc",
                    })
                  }
                >
                  {t("salesOrders.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="pos-pane-scroll h-full rounded-md bg-white text-slate-900">
          {selectedOrder ? (
            <>
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">
                      {selectedOrder.customerName || t("salesOrders.walkIn")}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selectedOrder.orderNumber || selectedOrder.id}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(selectedOrder.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={[
                        "rounded px-2 py-1 text-[10px] font-semibold uppercase",
                        statusBadgeClass(selectedOrder.status),
                      ].join(" ")}
                    >
                      {t(salesOrderStatusKey(selectedOrder.status))}
                    </span>
                    {edits.length ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                        {t("salesOrders.edit.badge")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {t(salesOrderServiceTypeKey(selectedOrder.serviceType))}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={clearSelectedOrder}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handleDeleteOrder()}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    {t("common.delete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrintCheckout()}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {t("salesOrders.printCheckout")}
                  </button>
                  {isCompletedSalesOrder(selectedOrder) ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                    >
                      {t("salesOrders.edit.button")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("salesOrders.lines")}
                </p>
                {orderLines.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("salesOrders.noLines")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {orderLines.map((line) => (
                      <li key={line.id} className="py-2 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">
                            {formatPosQuantity(line.quantity)}{" "}
                            {lineDisplayName(line) || t("salesOrders.item")}
                          </p>
                          {!isVoidedSalesOrder(selectedOrder) ? (
                            <span>
                              {money(Number(line.unitPrice) * Number(line.quantity))}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(["fire", "ready", "serve"] as const).map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600"
                              onClick={() => void runLineAction(line.id, action)}
                            >
                              {t(`salesOrders.${action}`)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!isVoidedSalesOrder(selectedOrder) ? (
                  <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
                    {(
                      [
                        ["subtotal", selectedOrder.subtotal],
                        ["discount", selectedOrder.totalDiscount],
                        ["tax", selectedOrder.totalTax],
                        ["serviceCharge", selectedOrder.serviceCharge],
                        ["tip", selectedOrder.tipAmount],
                      ] as const
                    ).map(([label, value]) =>
                      Number(value) ? (
                        <div key={label} className="flex justify-between text-slate-600">
                          <span>{t(`salesOrders.${label}`)}</span>
                          <span>{money(value)}</span>
                        </div>
                      ) : null
                    )}
                    <div className="flex justify-between pt-1 text-base font-bold">
                      <span>{t("salesOrders.total")}</span>
                      <span>{money(selectedOrder.grandTotal)}</span>
                    </div>
                  </div>
                ) : null}

                {edits.length ? (
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t("salesOrders.edit.history")}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {edits.map((edit) => (
                        <li key={edit.id} className="text-xs text-slate-600">
                          <p className="font-semibold text-slate-800">
                            {money(edit.previousTotal)} → {money(edit.newTotal)}
                          </p>
                          <p>{edit.reason}</p>
                          <p className="text-slate-400">
                            {t("salesOrders.edit.historyBy", {
                              when: formatDateTime(edit.createdAt),
                              by: edit.editedByName || "—",
                              manager: edit.approvedByName || "—",
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("salesOrders.paymentDetail")}
                  </p>
                  <div className="mt-2 flex justify-between text-sm">
                    <span>{t(salesOrderStatusKey(selectedOrder.status))}</span>
                    {!isVoidedSalesOrder(selectedOrder) ? (
                      <span className="font-semibold">
                        {money(selectedOrder.grandTotal)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
              <EmptyIllustration />
              <p className="mt-4 text-sm text-slate-500">
                {t("salesOrders.selectOrder")}
              </p>
            </div>
          )}
        </aside>

        <aside className="flex min-h-0 flex-row flex-wrap gap-2 overflow-y-auto rounded-md bg-[#161616] p-1.5 lg:flex-col lg:flex-nowrap">
          {serviceFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setServiceFilter(filter.id)}
              className={[
                "mb-1 min-h-10 rounded px-2 py-2 text-left text-xs",
                serviceFilter === filter.id ? "bg-[#1a9bff]" : "bg-slate-600",
              ].join(" ")}
            >
              {t(filter.labelKey)}
            </button>
          ))}
        </aside>
      </div>

      {editing && selectedOrder ? (
        <EditOrderDialog
          order={selectedOrder}
          onClose={() => setEditing(false)}
          onSaved={(result) => void handleEdited(result.orderNumber || selectedOrder.orderNumber)}
          previewEdit={previewOrderEdit}
          saveEdit={editOrder}
        />
      ) : null}
    </section>
  );
}
