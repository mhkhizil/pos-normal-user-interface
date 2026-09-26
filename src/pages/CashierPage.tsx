import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  OrderStatus,
  ServiceType,
  SplitPaymentTenderDTO,
  TableSessionState,
  toApiServiceType,
} from "@/core/application/dtos/CashierDTO";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { CashierBoard } from "./cashier/CashierBoard";
import { MultiOrderingView } from "./cashier/MultiOrderingView";
import { OrderPanel } from "./cashier/OrderPanel";
import { PaymentView } from "./cashier/PaymentView";
import { ProductMenu } from "./cashier/ProductMenu";
import {
  Product,
  ProductVariant,
  SalesOrderLine,
} from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { calcLineTotals } from "@/lib/pos/checkoutCalculations";
import {
  allocateOrderDiscountToLines,
  isFocLine,
  lineFocDiscount,
  payableTotal,
  toMoney,
  withOrderTipOnFirstPayment,
} from "@/lib/pos/checkoutAdjustments";
import { isUnspendableWalletStatus } from "@/lib/pos/guestWalletAmounts";
import { isSettledSalesOrder } from "@/lib/pos/orderStatus";
import {
  findOpenTableSession,
  isOpenTableSession,
} from "@/lib/pos/tableSession";
import {
  clearTableOrderIds,
  mergeTableOrderIds,
  readTableOrderIds,
  writeTableOrderIds,
} from "@/lib/pos/multiOrdering";
import {
  ensureMemberCardPaymentMethod,
  findMemberCardPaymentMethod,
  isMemberCardPaymentMethod,
} from "@/lib/pos/paymentMethods";
import {
  assertCheckoutPaymentsReady,
  attachGuestCardIdToMemberPayments,
  buildCheckoutPayments,
  remainingReceivable,
} from "@/lib/pos/splitPayments";

const BOARD_PAGE_SIZE = 15;
const TABLE_STATUS_POLL_MS = 60_000;
const TABLE_STATUS_BACKOFF_MS = 180_000;

export function CashierPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    products,
    variantsByProductId,
    salesOrders,
    selectedOrder,
    selectedOrderLines,
    paymentMethods,
    diningZones,
    diningTables,
    tableSessions,
    activeServiceType,
    setActiveServiceType,
    isLoading,
    error,
    fetchProducts,
    fetchProductVariants,
    fetchSalesOrders,
    fetchPaymentMethods,
    fetchDiningZones,
    fetchDiningTables,
    fetchTableSessions,
    refreshDiningTableStatus,
    updateDiningTableStatus,
    openTableSession,
    checkoutTableSession,
    updateTableSessionState,
    fireToKds,
    getLatestSessionByTableId,
    selectOrder,
    selectOrderById,
    createOrder,
    addProductToOrder,
    updateOrderLine,
    removeOrderLine,
    addProductToTableSession,
    addPayment,
    getCounterOrderById,
    pickupCounterOrder,
    processCheckout,
    voidCheckout,
    discountReasons,
    fetchDiscountReasons,
    clearOrderSelection,
    resolveTableWarning,
    clearError,
  } = useCashier();
  const {
    fetchOrderLines: fetchManagedOrderLines,
    addOrderLine: addManagedOrderLine,
    deleteOrderLine: deleteManagedOrderLine,
    updateOrder: updateManagedOrder,
    deleteOrder: deleteManagedOrder,
  } = useSalesOrderManagement();
  const {
    activeLocationId,
    activePosRegisterId,
    isWorkspaceReady,
    isPosSessionLoading,
    requireCashierContext,
  } = usePosWorkspace();
  const { listStations } = useKdsStationManagement();
  const printer = usePrinterConnection(
    String(user?.tenantId || ""),
    activePosRegisterId
  );
  const { lookupCard, getWallet } = useGuestWalletManagement();

  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [zoneFilter, setZoneFilter] = useState("ALL");
  const [menuCategoryId, setMenuCategoryId] = useState("ALL");
  const [boardPage, setBoardPage] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState("0.0000");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [memberCardUid, setMemberCardUid] = useState("");
  const [memberCard, setMemberCard] = useState<GuestCard | null>(null);
  const [memberWallet, setMemberWallet] = useState<GuestWallet | null>(null);
  const [memberCardError, setMemberCardError] = useState<string | null>(null);
  const [isMemberCardLoading, setIsMemberCardLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [directCartLines, setDirectCartLines] = useState<typeof selectedOrderLines>([]);
  const [isDirectCheckoutMode, setIsDirectCheckoutMode] = useState(false);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [tableOrderIds, setTableOrderIds] = useState<string[]>([]);
  const [multiOrderLines, setMultiOrderLines] = useState<
    Record<string, SalesOrderLine[]>
  >({});
  const [selectedMergeOrderIds, setSelectedMergeOrderIds] = useState<string[]>(
    []
  );
  const [isMultiOrderMutating, setIsMultiOrderMutating] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitTenders, setSplitTenders] = useState<SplitPaymentTenderDTO[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0.0000");
  const [discountReasonId, setDiscountReasonId] = useState("");
  const [tipAmount, setTipAmount] = useState("0.0000");
  const [serviceCharge, setServiceCharge] = useState("0.0000");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const payReturnViewRef = useRef("menu");
  const pendingMemberDetectRef = useRef(false);

  const locationId = activeLocationId;
  const activeView = searchParams.get("view") || "orders";
  const previousViewRef = useRef(activeView);
  const isTableService = activeServiceType === "TABLE";
  const isDineInService = activeServiceType === "DINE_IN";
  const usesTableBoard = isTableService || isDineInService;
  const requiresTableSelection = isTableService;

  const loadData = useCallback(async () => {
    clearError();
    await Promise.allSettled([
      fetchProducts({
        page: 1,
        limit: 100,
        inStockOnly: true,
        locationId: locationId || undefined,
      }),
      fetchSalesOrders({ page: 1, limit: 100 }),
      fetchPaymentMethods(),
      fetchDiningZones(),
      fetchDiscountReasons(),
    ]);
    // Table list and sessions share a strict rate limit. Load them after the
    // rest of the board, and never in the same burst.
    try {
      await fetchDiningTables({ page: 1, limit: 200 });
    } catch {
      // The hook already records the error.
    }
    try {
      await fetchTableSessions({
        page: 1,
        limit: 200,
        sortBy: "openedAt",
        sortOrder: "desc",
      });
    } catch {
      // The hook already records the error.
    }
  }, [
    clearError,
    fetchDiningTables,
    fetchDiningZones,
    fetchDiscountReasons,
    fetchPaymentMethods,
    fetchProducts,
    fetchSalesOrders,
    fetchTableSessions,
    locationId,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (
      statusFilter === "COMPLETED" ||
      statusFilter === "CANCELLED" ||
      statusFilter === "VOIDED"
    ) {
      setStatusFilter("ALL");
    }
  }, [statusFilter]);

  const resetWorkspaceAfterTransaction = useCallback(
    async (message: string) => {
      clearOrderSelection();
      clearError();
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
      setPaymentAmount("0.0000");
      setIsSplitMode(false);
      setSplitTenders([]);
      setDiscountAmount("0.0000");
      setDiscountReasonId("");
      setTipAmount("0.0000");
      setServiceCharge("0.0000");
      setLocalError(null);
      setNotice(message);
      setSearchParams({ view: "orders" });
      await loadData();
    },
    [clearError, clearOrderSelection, loadData, setSearchParams]
  );

  useEffect(() => {
    if (!paymentMethods.length || paymentMethodId) return;
    setPaymentMethodId(paymentMethods[0].id);
  }, [paymentMethodId, paymentMethods]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const isBusyRef = useRef(false);
  isBusyRef.current = isLoading || isPosSessionLoading || isMultiOrderMutating;

  useEffect(() => {
    if (!usesTableBoard) return;

    let stopped = false;
    let inFlight = false;
    let backoffUntil = 0;
    let phase: "tables" | "sessions" = "tables";

    const pollTableStatus = async () => {
      if (
        stopped ||
        document.visibilityState === "hidden" ||
        inFlight ||
        isBusyRef.current ||
        Date.now() < backoffUntil
      ) {
        return;
      }
      inFlight = true;
      const part = phase;
      phase = part === "tables" ? "sessions" : "tables";
      try {
        const refreshed = await refreshDiningTableStatus(part);
        if (!refreshed) {
          backoffUntil = Date.now() + TABLE_STATUS_BACKOFF_MS;
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      void pollTableStatus();
    }, TABLE_STATUS_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshDiningTableStatus, usesTableBoard]);

  const selectedOrderSession = useMemo(
    () =>
      selectedOrder
        ? tableSessions.find(
            (session) =>
              session.salesOrderId === selectedOrder.id &&
              isOpenTableSession(session)
          ) || null
        : null,
    [selectedOrder, tableSessions]
  );

  const selectedOrderTable = useMemo(
    () =>
      selectedOrderSession
        ? diningTables.find(
            (table) => table.id === selectedOrderSession.tableId
          ) || null
        : null,
    [diningTables, selectedOrderSession]
  );

  const activeMultiOrderTable = useMemo(
    () =>
      activeTableId
        ? diningTables.find((table) => table.id === activeTableId) || null
        : null,
    [activeTableId, diningTables]
  );

  const displayedOrderTable = selectedOrderTable || activeMultiOrderTable;

  const activeTableSession = useMemo(
    () =>
      activeTableId
        ? getLatestSessionByTableId(activeTableId) || null
        : selectedOrderSession,
    [activeTableId, getLatestSessionByTableId, selectedOrderSession]
  );

  const primaryTableOrderId = activeTableSession?.salesOrderId;
  const isPrimaryTableOrder = Boolean(
    selectedOrder?.id &&
      primaryTableOrderId &&
      selectedOrder.id === primaryTableOrderId
  );

  const menuCategories = useMemo(() => {
    const categories = new Map<string, string>();
    for (const product of products) {
      if (!product.categoryId || categories.has(product.categoryId)) continue;
      categories.set(
        product.categoryId,
        product.categoryName || product.categoryId
      );
    }
    return [...categories.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const menuProducts = useMemo(
    () =>
      menuCategoryId === "ALL"
        ? products
        : products.filter((product) => product.categoryId === menuCategoryId),
    [menuCategoryId, products]
  );

  const productById = useMemo(
    () =>
      products.reduce<Record<string, (typeof products)[number]>>((acc, product) => {
        acc[product.id] = product;
        return acc;
      }, {}),
    [products]
  );

  const variantById = useMemo(() => {
    const allVariants = Object.values(variantsByProductId).flat();
    return allVariants.reduce<Record<string, (typeof allVariants)[number]>>(
      (acc, variant) => {
        acc[variant.id] = variant;
        return acc;
      },
      {}
    );
  }, [variantsByProductId]);

  const formatAmount = useCallback((value: number) => value.toFixed(4), []);

  const buildDirectLine = useCallback(
    (
      line: SalesOrderLine,
      product?: Product,
      variant?: ProductVariant
    ) => {
      const variantModifier = Number(variant?.priceModifier || 0);
      const basePrice = Number(product?.basePrice || line.unitPrice || 0);
      const unitPrice = basePrice + variantModifier;
      const lineTotals = calcLineTotals({
        quantity: line.quantity,
        unitPrice,
        lineDiscount: line.lineDiscount || "0.0000",
        isTaxable: variant?.isTaxable ?? product?.isTaxable,
        taxRate: variant?.taxRate ?? product?.taxRate,
        isPriceInclusive: variant?.isPriceInclusive ?? product?.isPriceInclusive,
      });
      return {
        ...line,
        unitPrice: formatAmount(unitPrice),
        taxAmount: formatAmount(lineTotals.taxAmount),
      };
    },
    [formatAmount]
  );

  const normalizedDirectCartLines = useMemo(
    () =>
      directCartLines.map((line) => {
        const variant = variantById[line.variantId];
        const product = variant ? productById[variant.productId] : undefined;
        return buildDirectLine(line, product, variant);
      }),
    [buildDirectLine, directCartLines, productById, variantById]
  );

  const activeOrderLines = useMemo(
    () => (isDirectCheckoutMode ? normalizedDirectCartLines : selectedOrderLines),
    [isDirectCheckoutMode, normalizedDirectCartLines, selectedOrderLines]
  );

  const displayOrderLines = useMemo(() => {
    if (isDirectCheckoutMode) return activeOrderLines;

    return selectedOrderLines.map((line) => {
      const variant = variantById[line.variantId];
      const product = variant ? productById[variant.productId] : undefined;
      return product || variant ? buildDirectLine(line, product, variant) : line;
    });
  }, [
    activeOrderLines,
    buildDirectLine,
    isDirectCheckoutMode,
    productById,
    selectedOrderLines,
    variantById,
  ]);

  const orderedProductQuantities = useMemo(() => {
    return displayOrderLines.reduce<Record<string, number>>((quantities, line) => {
      const productId = variantById[line.variantId]?.productId;
      if (!productId) return quantities;
      quantities[productId] =
        (quantities[productId] || 0) + Number(line.quantity || 0);
      return quantities;
    }, {});
  }, [displayOrderLines, variantById]);

  const lineSubtotal = useMemo(() => {
    const backendTotal = Number(selectedOrder?.grandTotal || 0);
    const totalLines = isDirectCheckoutMode ? activeOrderLines : displayOrderLines;
    const lineTotal = totalLines.reduce((sum, line) => {
      const quantity = Number(line.quantity || 0);
      const unitPrice = Number(line.unitPrice || 0);
      const discount = Number(line.lineDiscount || 0);
      const tax = Number(line.taxAmount || 0);
      return sum + quantity * unitPrice - discount + tax;
    }, 0);
    if (!isDirectCheckoutMode && backendTotal > 0) {
      return Math.max(backendTotal, lineTotal);
    }
    return lineTotal > 0 ? lineTotal : backendTotal;
  }, [
    activeOrderLines,
    displayOrderLines,
    isDirectCheckoutMode,
    selectedOrder?.grandTotal,
  ]);

  const orderTotal = useMemo(
    () =>
      payableTotal({
        lineTotal: lineSubtotal,
        orderDiscount: Number(discountAmount),
        serviceCharge: Number(serviceCharge),
        tipAmount: Number(tipAmount),
      }).toFixed(4),
    [discountAmount, lineSubtotal, serviceCharge, tipAmount]
  );

  const checkoutPaymentMethods = useMemo(
    () => ensureMemberCardPaymentMethod(paymentMethods),
    [paymentMethods]
  );
  const selectedPaymentMethod = checkoutPaymentMethods.find(
    (method) => method.id === paymentMethodId
  );
  const memberCardSelected = Boolean(
    selectedPaymentMethod && isMemberCardPaymentMethod(selectedPaymentMethod)
  );

  const resetMemberCardLookup = useCallback(() => {
    setMemberCardUid("");
    setMemberCard(null);
    setMemberWallet(null);
    setMemberCardError(null);
    setIsMemberCardLoading(false);
  }, []);

  const handleLookupMemberCard = useCallback(async () => {
    if (!memberCardUid.trim()) {
      setMemberCardError(t("cashier.errors.memberCardRequired"));
      return;
    }
    setIsMemberCardLoading(true);
    setMemberCardError(null);
    try {
      const card = await lookupCard(memberCardUid.trim());
      if (card.status && card.status.toUpperCase() !== "ACTIVE") {
        throw new Error(t("cashier.errors.memberCardInactive"));
      }
      const wallet =
        card.wallet ||
        (card.walletId ? await getWallet(card.walletId) : null);
      if (!wallet) {
        throw new Error(t("crm.unknownCard"));
      }
      if (isUnspendableWalletStatus(wallet.status)) {
        throw new Error(t("cashier.errors.memberCardInactive"));
      }
      setMemberCard(card);
      setMemberWallet(wallet);
      setMemberCardUid(card.cardUid);
    } catch (caught) {
      setMemberCard(null);
      setMemberWallet(null);
      setMemberCardError(
        caught instanceof Error
          ? caught.message
          : t("cashier.errors.memberCardRequired")
      );
    } finally {
      setIsMemberCardLoading(false);
    }
  }, [getWallet, lookupCard, memberCardUid, t]);

  const { nfcSupported, nfcActive, nfcError, lastUid, startNfc } = useCardCapture({
    enabled: activeView === "pay" && memberCardSelected,
    onRead: (uid) => {
      pendingMemberDetectRef.current = true;
      setMemberCardUid(uid);
    },
  });

  useEffect(() => {
    if (!memberCardSelected) {
      resetMemberCardLookup();
    }
  }, [memberCardSelected, resetMemberCardLookup]);

  useEffect(() => {
    if (
      !memberCardSelected ||
      !pendingMemberDetectRef.current ||
      !memberCardUid.trim()
    ) {
      return;
    }
    pendingMemberDetectRef.current = false;
    void handleLookupMemberCard();
  }, [handleLookupMemberCard, memberCardSelected, memberCardUid]);

  useEffect(() => {
    if (isSplitMode) return;
    setPaymentAmount(orderTotal);
  }, [isDirectCheckoutMode, isSplitMode, orderTotal, selectedOrder?.id]);

  const previousOrderIdRef = useRef(selectedOrder?.id);
  useEffect(() => {
    const nextId = selectedOrder?.id;
    if (
      previousOrderIdRef.current &&
      nextId &&
      previousOrderIdRef.current !== nextId
    ) {
      setIsSplitMode(false);
      setSplitTenders([]);
      setDiscountAmount("0.0000");
      setDiscountReasonId("");
      setTipAmount("0.0000");
      setServiceCharge("0.0000");
    }
    previousOrderIdRef.current = nextId;
  }, [selectedOrder?.id]);

  useEffect(() => {
    if (activeView !== "pay") {
      payReturnViewRef.current = activeView;
    }
  }, [activeView]);

  useEffect(() => {
    const wasPay = previousViewRef.current === "pay";
    previousViewRef.current = activeView;
    if (!wasPay || activeView === "pay") return;
    setIsSplitMode(false);
    setSplitTenders([]);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "pay" || isSplitMode) return;
    paymentInputRef.current?.focus();
    paymentInputRef.current?.select();
  }, [activeView, isSplitMode, selectedOrder?.id]);

  const filteredOrders = useMemo(
    () =>
      salesOrders.filter((order) => {
        if (isSettledSalesOrder(order)) return false;
        const serviceMatches =
          activeServiceType === "TABLE"
            ? order.serviceType === "DINE_IN"
            : order.serviceType === activeServiceType;
        const statusMatches =
          statusFilter === "ALL" || order.status === statusFilter;
        return serviceMatches && statusMatches;
      }),
    [activeServiceType, salesOrders, statusFilter]
  );

  const filteredTables = useMemo(() => {
    const mappedStatus = (
      sessionState?: TableSessionState
    ): OrderStatus | "ALL" => {
      if (!sessionState) return "ALL";
      if (["SEATED", "ORDERING"].includes(sessionState)) return "DRAFT";
      if (["SERVED", "PAYMENT_PENDING"].includes(sessionState)) {
        return "CONFIRMED";
      }
      if (sessionState === "CLOSED") return "COMPLETED";
      return "ALL";
    };

    return diningTables.filter((table) => {
      if (zoneFilter !== "ALL" && table.zoneId !== zoneFilter) return false;
      if (statusFilter === "ALL") return true;
      return (
        mappedStatus(getLatestSessionByTableId(table.id)?.sessionState) ===
        statusFilter
      );
    });
  }, [
    diningTables,
    getLatestSessionByTableId,
    statusFilter,
    zoneFilter,
  ]);

  const tablesInZone = useMemo(
    () =>
      diningTables.filter(
        (table) => zoneFilter === "ALL" || table.zoneId === zoneFilter
      ),
    [diningTables, zoneFilter]
  );

  const boardMetrics = useMemo(() => {
    const mapSessionStatus = (
      sessionState?: TableSessionState
    ): OrderStatus | null => {
      if (!sessionState) return null;
      if (["SEATED", "ORDERING"].includes(sessionState)) return "DRAFT";
      if (["SERVED", "PAYMENT_PENDING"].includes(sessionState)) {
        return "CONFIRMED";
      }
      if (sessionState === "CLOSED") return "COMPLETED";
      return null;
    };

    const countTablesByStatus = (status: "ALL" | OrderStatus) =>
      tablesInZone.filter((table) => {
        const sessionState = getLatestSessionByTableId(table.id)?.sessionState;
        if (status === "ALL") return true;
        return mapSessionStatus(sessionState) === status;
      }).length;

    const activeTableCount = tablesInZone.filter((table) =>
      isOpenTableSession(getLatestSessionByTableId(table.id))
    ).length;

    const countOrdersForService = (serviceType: ServiceType) =>
      salesOrders.filter((order) => {
        if (isSettledSalesOrder(order)) return false;
        const serviceMatches =
          serviceType === "TABLE"
            ? order.serviceType === "DINE_IN"
            : order.serviceType === serviceType;
        return serviceMatches;
      });

    const ordersForActiveService = countOrdersForService(activeServiceType);

    const statusTabCounts = usesTableBoard
      ? {
          ALL: tablesInZone.length,
          DRAFT: countTablesByStatus("DRAFT"),
          CONFIRMED: countTablesByStatus("CONFIRMED"),
        }
      : {
          ALL: ordersForActiveService.length,
          DRAFT: ordersForActiveService.filter(
            (order) => order.status === "DRAFT"
          ).length,
          CONFIRMED: ordersForActiveService.filter(
            (order) => order.status === "CONFIRMED"
          ).length,
        };

    return {
      notificationCount: statusTabCounts.DRAFT,
      serviceTabCounts: {
        TABLE: activeTableCount,
        DINE_IN: countOrdersForService("DINE_IN").length,
        TAKE_AWAY: countOrdersForService("TAKE_AWAY").length,
        DELIVERY: countOrdersForService("DELIVERY").length,
        PICK_UP: countOrdersForService("PICK_UP").length,
      },
      statusTabCounts,
    };
  }, [
    activeServiceType,
    getLatestSessionByTableId,
    salesOrders,
    tablesInZone,
    usesTableBoard,
  ]);

  const boardItems = usesTableBoard ? filteredTables : filteredOrders;
  const boardPageCount = Math.max(
    1,
    Math.ceil(boardItems.length / BOARD_PAGE_SIZE)
  );
  const pageStart = (boardPage - 1) * BOARD_PAGE_SIZE;
  const pagedTables = usesTableBoard
    ? filteredTables.slice(pageStart, pageStart + BOARD_PAGE_SIZE)
    : [];
  const pagedOrders = usesTableBoard
    ? []
    : filteredOrders.slice(pageStart, pageStart + BOARD_PAGE_SIZE);

  useEffect(() => {
    setBoardPage(1);
  }, [activeServiceType, statusFilter, zoneFilter]);

  useEffect(() => {
    if (boardPage > boardPageCount) setBoardPage(boardPageCount);
  }, [boardPage, boardPageCount]);

  const refreshMultiOrderLines = useCallback(
    async (orderIds: string[]) => {
      const entries = await Promise.all(
        orderIds.map(async (orderId) => {
          const result = await fetchManagedOrderLines(orderId, {
            page: 1,
            limit: 100,
          });
          return [orderId, result.lines] as const;
        })
      );
      setMultiOrderLines(Object.fromEntries(entries));
    },
    [fetchManagedOrderLines]
  );

  const bindOrdersToTable = useCallback(
    async (tableId: string, primaryOrderId: string) => {
      const orderIds = mergeTableOrderIds(tableId, primaryOrderId);
      setActiveTableId(tableId);
      setTableOrderIds(orderIds);
      setSelectedMergeOrderIds([]);
      await refreshMultiOrderLines(orderIds);
      return orderIds;
    },
    [refreshMultiOrderLines]
  );

  const getTableOrderCount = useCallback(
    (tableId: string) => {
      if (tableId === activeTableId) return tableOrderIds.length;
      return readTableOrderIds(tableId).length;
    },
    [activeTableId, tableOrderIds.length]
  );

  const requiresTableAssignment =
    usesTableBoard &&
    (
      (isDirectCheckoutMode && directCartLines.length > 0 && !activeTableId) ||
      (displayOrderLines.length > 0 && !displayedOrderTable && !activeTableId)
    );

  const promptTableSelection = useCallback(() => {
    setNotice(t("cashier.orderPanel.assignTableToContinue"));
    setSearchParams({ view: "orders" });
  }, [setSearchParams, t]);

  useEffect(() => {
    if (activeView !== "pay" || !requiresTableAssignment) return;
    promptTableSelection();
  }, [activeView, promptTableSelection, requiresTableAssignment]);

  const flushPendingLinesToSession = useCallback(
    async (
      session: (typeof tableSessions)[number],
      lines: typeof directCartLines
    ) => {
      for (const line of lines) {
        const variant = variantById[line.variantId];
        const product = variant ? productById[variant.productId] : undefined;
        if (!product) continue;

        await addProductToTableSession(
          session.id,
          product,
          line.variantId,
          Number(line.quantity || 1)
        );
      }

      if (session.sessionState === "SEATED") {
        await updateTableSessionState(session.id, { sessionState: "ORDERING" });
      }
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
    },
    [
      addProductToTableSession,
      productById,
      updateTableSessionState,
      variantById,
    ]
  );

  const handleCloseMenu = useCallback(() => {
    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }
    setSearchParams({ view: "orders" });
  }, [promptTableSelection, requiresTableAssignment, setSearchParams]);

  const releasePaidTable = useCallback(
    async (tableId?: string | null, sessionId?: string | null) => {
      if (sessionId) {
        try {
          await updateTableSessionState(sessionId, { sessionState: "CLOSED" });
        } catch {
          // Checkout may already have closed the session.
        }
      }
      if (tableId) {
        try {
          await updateDiningTableStatus(tableId, "AVAILABLE");
        } catch {
          // Checkout may already have released the table.
        }
      }
    },
    [updateDiningTableStatus, updateTableSessionState]
  );

  const handleCreateOrder = async () => {
    setLocalError(null);
    try {
      await requireCashierContext();
      setIsDirectCheckoutMode(true);
      setDirectCartLines([]);
      setLocalError(null);
      setNotice(
        isTableService
          ? t("cashier.orderPanel.tableCartStarted")
          : isDineInService
            ? t("cashier.orderPanel.dineInStarted")
            : t("cashier.orderPanel.cartStarted")
      );
      setSearchParams({ view: "menu" });
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("cashier.errors.createOrder")
      );
    }
  };

  const handleTableTap = async (tableId: string) => {
    setLocalError(null);
    setNotice(null);
    const pendingLines = isDirectCheckoutMode ? [...directCartLines] : [];
    if (!pendingLines.length) {
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
    }
    const table = diningTables.find((item) => item.id === tableId);
    if (!table) return;

    const currentTableId = activeTableId || selectedOrderSession?.tableId || null;
    if (currentTableId && currentTableId !== table.id) {
      clearOrderSelection();
      setTableOrderIds([]);
      setMultiOrderLines({});
      setSelectedMergeOrderIds([]);
      if (!pendingLines.length) {
        setIsDirectCheckoutMode(false);
        setDirectCartLines([]);
      }
    }
    setActiveTableId(table.id);

    try {
      const context = await requireCashierContext();
      let sessions = tableSessions;
      const localOpenSession = findOpenTableSession(sessions, table.id);
      if (!localOpenSession && table.status !== "AVAILABLE") {
        try {
          const refreshed = await fetchTableSessions({
            page: 1,
            limit: 200,
            sortBy: "openedAt",
            sortOrder: "desc",
          });
          if (Array.isArray(refreshed)) {
            sessions = refreshed;
          }
        } catch {
          // Keep the in-memory list if refresh fails.
        }
      }

      const openSession = findOpenTableSession(sessions, table.id);
      const latestSession =
        openSession ||
        sessions
          .filter((session) => session.tableId === table.id)
          .sort(
            (left, right) =>
              new Date(right.openedAt || 0).getTime() -
              new Date(left.openedAt || 0).getTime()
          )[0];
      const boundOrderId =
        openSession?.salesOrderId ||
        latestSession?.salesOrderId ||
        readTableOrderIds(table.id)[0] ||
        "";

      const resumeExistingOrder = async (
        session: (typeof tableSessions)[number] | undefined,
        orderId: string
      ) => {
        const alreadySelected = selectedOrder?.id === orderId ? selectedOrder : null;
        const order =
          alreadySelected || (await selectOrderById(orderId));
        if (isSettledSalesOrder(order)) return false;
        if (pendingLines.length && session) {
          await flushPendingLinesToSession(session, pendingLines);
        }
        await bindOrdersToTable(table.id, orderId);
        setSearchParams({ view: "menu" });
        return true;
      };

      if (openSession || table.status === "OCCUPIED") {
        if (boundOrderId) {
          if (await resumeExistingOrder(openSession || latestSession, boundOrderId)) {
            return;
          }
          clearOrderSelection();
        } else if (openSession) {
          setActiveTableId(table.id);
          setSearchParams({ view: "menu" });
          return;
        }
      }

      if (openSession || table.status !== "AVAILABLE") {
        await releasePaidTable(table.id, openSession?.id || latestSession?.id);
      }

      const newSession = await openTableSession({
        tenantId: context.tenantId,
        tableId: table.id,
        locationId: context.locationId,
        guestCount: Math.max(1, table.maxSeats || 1),
        posRegisterId: context.posRegisterId,
        openedByPosSessionId: context.posSessionId,
        salesChannel: "POS",
      });
      if (pendingLines.length) {
        await flushPendingLinesToSession(newSession, pendingLines);
      }
      if (newSession.salesOrderId) {
        await bindOrdersToTable(table.id, newSession.salesOrderId);
      }
      setSearchParams({ view: "menu" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setLocalError(
        /throttler|too many requests/i.test(message)
          ? t("cashier.errors.tooManyRequests")
          : message || t("cashier.errors.openTable")
      );
    }
  };

  const handleSelectTableOrder = useCallback(
    async (orderId: string) => {
      setLocalError(null);
      setNotice(null);
      try {
        await selectOrderById(orderId);
        setSearchParams({ view: "menu" });
      } catch (caught) {
        setLocalError(
          caught instanceof Error
            ? caught.message
            : t("cashier.multiOrder.errors.openOrder")
        );
      }
    },
    [selectOrderById, setSearchParams, t]
  );

  const handleAddTableOrder = useCallback(async () => {
    if (!activeTableId || !activeTableSession?.salesOrderId) {
      setLocalError(t("cashier.multiOrder.errors.selectTable"));
      setSearchParams({ view: "orders" });
      return;
    }

    setLocalError(null);
    setNotice(null);
    try {
      const context = await requireCashierContext();
      const order = await createOrder({
        tenantId: context.tenantId,
        locationId: context.locationId,
        salesChannel: "POS",
        idempotencyKey: `table-${activeTableId}-${Date.now()}`,
        subtotal: "0.0000",
        totalDiscount: "0.0000",
        totalTax: "0.0000",
        grandTotal: "0.0000",
        status: "DRAFT",
      });
      const nextIds = mergeTableOrderIds(
        activeTableId,
        activeTableSession.salesOrderId,
        [order.id]
      );
      setTableOrderIds(nextIds);
      await selectOrderById(order.id);
      await refreshMultiOrderLines(nextIds);
      setNotice(
        t("cashier.multiOrder.orderCreated", { number: nextIds.length })
      );
      setSearchParams({ view: "menu" });
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("cashier.multiOrder.errors.createOrder")
      );
    }
  }, [
    activeTableId,
    activeTableSession?.salesOrderId,
    createOrder,
    refreshMultiOrderLines,
    requireCashierContext,
    selectOrderById,
    setSearchParams,
    t,
  ]);

  const transferOrderLines = useCallback(
    async (
      sourceOrderId: string,
      targetOrderId: string,
      lineIds?: string[]
    ) => {
      const sourceResult = await fetchManagedOrderLines(sourceOrderId, {
        page: 1,
        limit: 100,
      });
      const lines = lineIds
        ? sourceResult.lines.filter((line) => lineIds.includes(line.id))
        : sourceResult.lines;

      for (const line of lines) {
        await addManagedOrderLine(targetOrderId, {
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineDiscount: line.lineDiscount || "0.0000",
          taxRateId: line.taxRateId,
          taxAmount: line.taxAmount,
          appliedPromotionId: line.appliedPromotionId,
          courseType: line.courseType,
          seatNumber: line.seatNumber,
        });
        await deleteManagedOrderLine(sourceOrderId, line.id);
      }
    },
    [
      addManagedOrderLine,
      deleteManagedOrderLine,
      fetchManagedOrderLines,
    ]
  );

  const mergeOrders = useCallback(
    async (sourceOrderIds: string[]) => {
      if (!activeTableId || tableOrderIds.length < 2) return;
      const targetOrderId = tableOrderIds[0];
      const sources = sourceOrderIds.filter(
        (id) => id !== targetOrderId && tableOrderIds.includes(id)
      );
      if (!sources.length) return;

      setIsMultiOrderMutating(true);
      setLocalError(null);
      setNotice(null);
      try {
        for (const sourceOrderId of sources) {
          await transferOrderLines(sourceOrderId, targetOrderId);
          await deleteManagedOrder(sourceOrderId);
        }
        const nextIds = tableOrderIds.filter((id) => !sources.includes(id));
        writeTableOrderIds(activeTableId, nextIds);
        setTableOrderIds(nextIds);
        setSelectedMergeOrderIds([]);
        await selectOrderById(targetOrderId);
        await refreshMultiOrderLines(nextIds);
        setNotice(t("cashier.multiOrder.ordersMerged"));
      } catch (caught) {
        setLocalError(
          caught instanceof Error
            ? caught.message
            : t("cashier.multiOrder.errors.merge")
        );
      } finally {
        setIsMultiOrderMutating(false);
      }
    },
    [
      activeTableId,
      deleteManagedOrder,
      refreshMultiOrderLines,
      selectOrderById,
      t,
      tableOrderIds,
      transferOrderLines,
    ]
  );

  const handleSplitItems = useCallback(
    async (
      sourceOrderId: string,
      targetOrderId: string,
      lineIds: string[]
    ) => {
      if (!lineIds.length) return;
      setIsMultiOrderMutating(true);
      setLocalError(null);
      setNotice(null);
      try {
        await transferOrderLines(sourceOrderId, targetOrderId, lineIds);
        await selectOrderById(targetOrderId);
        await refreshMultiOrderLines(tableOrderIds);
        setNotice(t("cashier.multiOrder.itemsMoved"));
      } catch (caught) {
        setLocalError(
          caught instanceof Error
            ? caught.message
            : t("cashier.multiOrder.errors.split")
        );
      } finally {
        setIsMultiOrderMutating(false);
      }
    },
    [
      refreshMultiOrderLines,
      selectOrderById,
      t,
      tableOrderIds,
      transferOrderLines,
    ]
  );

  const handleAddProduct = async (
    product: (typeof products)[number],
    variantId: string,
    quantity: number
  ) => {
    const startFreshCart = isSettledSalesOrder(selectedOrder);
    if (startFreshCart) {
      clearOrderSelection();
      setActiveTableId(null);
      setTableOrderIds([]);
      setMultiOrderLines({});
      setIsDirectCheckoutMode(true);
    }

    const shouldUseTableSession = Boolean(
      !startFreshCart && selectedOrderSession && isPrimaryTableOrder
    );

    if (shouldUseTableSession && selectedOrderSession) {
      const line = await addProductToTableSession(
        selectedOrderSession.id,
        product,
        variantId,
        quantity,
        tableOrderIds.length > 1 ? selectedOrder?.id : undefined
      );
      if (selectedOrderSession.sessionState === "SEATED") {
        await updateTableSessionState(selectedOrderSession.id, {
          sessionState: "ORDERING",
        });
      }
      if (
        selectedOrder &&
        tableOrderIds.includes(selectedOrder.id) &&
        (!line.salesOrderId || line.salesOrderId === selectedOrder.id)
      ) {
        setMultiOrderLines((current) => {
          const existing = current[selectedOrder.id] || [];
          const index = existing.findIndex((item) => item.id === line.id);
          const nextLines =
            index >= 0
              ? existing.map((item, itemIndex) =>
                  itemIndex === index ? line : item
                )
              : [...existing, line];
          return { ...current, [selectedOrder.id]: nextLines };
        });
      }
    } else if (selectedOrder && !startFreshCart) {
      await addProductToOrder(
        selectedOrder.id,
        product,
        variantId,
        quantity
      );
    } else if (!requiresTableSelection || isDirectCheckoutMode || startFreshCart) {
      setIsDirectCheckoutMode(true);
      setDirectCartLines((current) => {
        const variants = variantsByProductId[product.id] || [];
        const variant = variants.find((item) => item.id === variantId);
        const existing = current.find((line) => line.variantId === variantId);
        if (existing) {
          const updated = buildDirectLine(
            {
              ...existing,
              quantity: (
                Number(existing.quantity || 0) + Math.max(1, quantity)
              ).toFixed(4),
            },
            product,
            variant
          );
          return current.map((line) => (line.variantId === variantId ? updated : line));
        }
        const nextLine = buildDirectLine(
          {
            id: `direct-${variantId}`,
            salesOrderId: "direct-checkout",
            variantId,
            quantity: Math.max(1, quantity).toFixed(4),
            unitPrice: product.basePrice || "0.0000",
            lineDiscount: "0.0000",
            taxAmount: "0.0000",
            status: "PENDING",
          },
          product,
          variant
        );
        return [
          ...current,
          nextLine,
        ];
      });
    } else {
      throw new Error(t("cashier.errors.selectOrder"));
    }
  };

  const handleCheckout = async () => {
    setLocalError(null);
    setNotice(null);

    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }

    try {
      if (isSettledSalesOrder(selectedOrder)) {
        throw new Error(t("cashier.errors.orderAlreadyPaid"));
      }
      const context = await requireCashierContext();
      if (!activeOrderLines.length) {
        throw new Error(t("cashier.errors.checkoutEmpty"));
      }

      const orderDiscount = Math.max(0, Number(discountAmount) || 0);
      const tip = Math.max(0, Number(tipAmount) || 0);
      const extraFee = Math.max(0, Number(serviceCharge) || 0);
      if (orderDiscount > lineSubtotal + 0.009) {
        throw new Error(t("cashier.errors.discountTooLarge"));
      }
      if (orderDiscount > 0 && discountReasons.length && !discountReasonId) {
        throw new Error(t("cashier.errors.discountReasonRequired"));
      }

      const checkoutPayments = withOrderTipOnFirstPayment(
        attachGuestCardIdToMemberPayments(
          buildCheckoutPayments({
            total: orderTotal,
            paymentMethodId,
            paymentAmount,
            guestCardId: memberCard?.id,
            splitTenders,
            isSplitMode,
          }),
          memberCard?.id,
          (methodId) => {
            const method = checkoutPaymentMethods.find((item) => item.id === methodId);
            return Boolean(method && isMemberCardPaymentMethod(method));
          }
        ),
        tip
      );
      assertCheckoutPaymentsReady({
        total: orderTotal,
        payments: checkoutPayments,
      });

      const memberCardMethod = findMemberCardPaymentMethod(checkoutPaymentMethods);
      const usesMemberCard = checkoutPayments.some(
        (payment) =>
          memberCardMethod && payment.paymentMethodId === memberCardMethod.id
      );
      if (usesMemberCard) {
        if (!memberCard || !memberWallet) {
          throw new Error(t("cashier.errors.memberCardRequired"));
        }
        if (isUnspendableWalletStatus(memberWallet.status)) {
          throw new Error(t("cashier.errors.memberCardInactive"));
        }
      }

      const isMultiOrderSecondary =
        Boolean(
          activeTableId &&
            selectedOrder &&
            primaryTableOrderId &&
            tableOrderIds.includes(selectedOrder.id) &&
            selectedOrder.id !== primaryTableOrderId
        );

      const checkoutTableId =
        selectedOrderSession?.tableId ||
        displayedOrderTable?.id ||
        activeTableId;
      const checkoutSessionId =
        selectedOrderSession?.id || activeTableSession?.id;

      const paidReceipt = {
        title: "RECEIPT",
        place: "CHECKOUT" as const,
        showLogo: true,
        showPrices: true,
        receiptId: selectedOrder?.orderNumber,
        lines: displayOrderLines
          .filter((line) => !line.voidedAt)
          .map((line) => {
            const variant = variantById[line.variantId];
            const product = variant ? productById[variant.productId] : undefined;
            return {
              name:
                line.productName ||
                product?.name ||
                line.variantName ||
                "Item",
              quantity: String(line.quantity || "1"),
              unitPrice: String(line.unitPrice || ""),
              categoryId: product?.categoryId,
            };
          }),
        subtotal: lineSubtotal.toFixed(4),
        discount: orderDiscount > 0 ? toMoney(orderDiscount) : undefined,
        tip: tip > 0 ? toMoney(tip) : undefined,
        total: orderTotal,
        payments: checkoutPayments.map((payment) => ({
          name:
            checkoutPaymentMethods.find(
              (method) => method.id === payment.paymentMethodId
            )?.name || "Payment",
          amount: payment.amount,
        })),
      };
      const printPaidReceipt = async () => {
        try {
          await printer.printReceipt(paidReceipt);
        } catch (printError) {
          setLocalError(
            printError instanceof Error ? printError.message : "Print failed"
          );
        }
      };

      if (selectedOrderSession && isPrimaryTableOrder && selectedOrder) {
        await checkoutTableSession(selectedOrderSession.id, {
          payments: checkoutPayments,
          ...(tip > 0 ? { tipAmount: tip } : {}),
          ...(extraFee > 0 ? { serviceCharge: extraFee } : {}),
          ...(discountReasonId ? { discountReasonId } : {}),
          ...(orderDiscount > 0 ? { totalDiscount: orderDiscount } : {}),
        });
      } else if (isMultiOrderSecondary && selectedOrder) {
        for (const payment of checkoutPayments) {
          await addPayment(selectedOrder.id, {
            tenantId: context.tenantId,
            paymentMethodId: payment.paymentMethodId,
            posSessionId: context.posSessionId,
            amount: payment.amount,
            guestCardId: payment.guestCardId,
            ...(payment.tipAmount ? { tipAmount: payment.tipAmount } : {}),
          });
        }
      } else {
        const selectedServiceType = selectedOrder
          ? selectedOrder.serviceType
          : activeServiceType;
        await processCheckout({
          tenantId: context.tenantId,
          locationId: selectedOrder?.locationId || context.locationId,
          posSessionId: context.posSessionId,
          salesChannel: "POS",
          serviceType: toApiServiceType(selectedServiceType),
          idempotencyKey: `checkout-${selectedOrder?.id || "direct"}-${Date.now()}`,
          ...(discountReasonId ? { discountReasonId } : {}),
          ...(tip > 0 ? { tipAmount: toMoney(tip) } : {}),
          ...(extraFee > 0 ? { serviceCharge: toMoney(extraFee) } : {}),
          items: allocateOrderDiscountToLines(activeOrderLines, orderDiscount),
          payments: checkoutPayments,
        });
      }

      if (activeTableId && selectedOrder) {
        if (selectedOrderSession && isPrimaryTableOrder) {
          await releasePaidTable(checkoutTableId, checkoutSessionId);
          clearTableOrderIds(activeTableId);
          setTableOrderIds([]);
          setMultiOrderLines({});
          setActiveTableId(null);
          await printPaidReceipt();
          await resetWorkspaceAfterTransaction(t("cashier.orderPanel.checkoutSuccess"));
          return;
        }

        const nextIds = tableOrderIds.filter((id) => id !== selectedOrder.id);
        writeTableOrderIds(activeTableId, nextIds);
        setTableOrderIds(nextIds);
        setMultiOrderLines((current) => {
          const next = { ...current };
          delete next[selectedOrder.id];
          return next;
        });

        if (nextIds.length > 0) {
          const nextActiveOrderId = nextIds[nextIds.length - 1];
          await selectOrderById(nextActiveOrderId);
          await refreshMultiOrderLines(nextIds);
          await printPaidReceipt();
          setNotice(t("cashier.orderPanel.checkoutSuccess"));
          setSearchParams({ view: "menu" });
          return;
        }

        setActiveTableId(null);
      }

      await printPaidReceipt();
      await releasePaidTable(checkoutTableId, checkoutSessionId);
      await resetWorkspaceAfterTransaction(t("cashier.orderPanel.checkoutSuccess"));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t("cashier.errors.checkout");
      setLocalError(message);
    }
  };

  const handleCancelOrder = async () => {
    const orderId = selectedOrder?.id || activeTableSession?.salesOrderId;
    const sessionId = selectedOrderSession?.id || activeTableSession?.id;
    const tableId = displayedOrderTable?.id || activeTableId;

    setLocalError(null);
    setNotice(null);
    try {
      if (orderId) {
        const isCompletedSale =
          String(selectedOrder?.status || "").toUpperCase() === "COMPLETED";
        if (isCompletedSale) {
          await voidCheckout(orderId);
        } else {
          await updateManagedOrder(orderId, { status: "VOIDED" });
        }
      }

      if (sessionId || tableId) {
        await releasePaidTable(tableId, sessionId);
      }
      if (tableId) {
        clearTableOrderIds(tableId);
        setTableOrderIds([]);
        setMultiOrderLines({});
        setActiveTableId(null);
      }

      await resetWorkspaceAfterTransaction(t("cashier.orderPanel.orderCancelled"));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t("cashier.errors.cancelOrder");
      setLocalError(message);
    }
  };

  const mutateOrderLineQuantity = async (lineId: string, nextQty: number) => {
    if (isSettledSalesOrder(selectedOrder) && !isDirectCheckoutMode) {
      throw new Error(t("cashier.errors.orderAlreadyPaid"));
    }
    const targetLine = activeOrderLines.find((line) => line.id === lineId);
    if (!targetLine) return;

    const quantity = Number.isFinite(nextQty) ? Math.max(0, nextQty) : 0;
    if (isDirectCheckoutMode) {
      if (quantity <= 0) {
        setDirectCartLines((current) => current.filter((line) => line.id !== lineId));
      } else {
        setDirectCartLines((current) => {
          const line = current.find((entry) => entry.id === lineId);
          if (!line) return current;
          const variant = variantById[line.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          const updated = buildDirectLine(
            { ...line, quantity: quantity.toFixed(4) },
            product,
            variant
          );
          return current.map((entry) => (entry.id === lineId ? updated : entry));
        });
      }
      return;
    }

    if (!selectedOrder) return;
    if (quantity <= 0) {
      await removeOrderLine(selectedOrder.id, lineId);
      return;
    }

    await updateOrderLine(selectedOrder.id, lineId, {
      variantId: targetLine.variantId,
      quantity: quantity.toFixed(4),
      unitPrice: targetLine.unitPrice || "0.0000",
      lineDiscount: targetLine.lineDiscount || "0.0000",
      taxAmount: targetLine.taxAmount || "0.0000",
      seatNumber: targetLine.seatNumber,
    });
  };

  const handleToggleFoc = async (line: SalesOrderLine) => {
    setLocalError(null);
    setNotice(null);
    try {
      if (isSettledSalesOrder(selectedOrder) && !isDirectCheckoutMode) {
        throw new Error(t("cashier.errors.orderAlreadyPaid"));
      }
      const nextDiscount = isFocLine(line) ? "0.0000" : lineFocDiscount(line);
      if (isDirectCheckoutMode) {
        setDirectCartLines((current) => {
          const target = current.find((entry) => entry.id === line.id);
          if (!target) return current;
          const variant = variantById[target.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          const updated = buildDirectLine(
            { ...target, lineDiscount: nextDiscount },
            product,
            variant
          );
          return current.map((entry) => (entry.id === line.id ? updated : entry));
        });
        return;
      }
      if (!selectedOrder) return;
      await updateOrderLine(selectedOrder.id, line.id, {
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice || "0.0000",
        lineDiscount: nextDiscount,
        taxAmount: line.taxAmount || "0.0000",
        seatNumber: line.seatNumber,
      });
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.updateOrderLine")
      );
    }
  };

  const closePayView = () => {
    const nextView =
      payReturnViewRef.current && payReturnViewRef.current !== "pay"
        ? payReturnViewRef.current
        : "menu";
    setIsSplitMode(false);
    setSplitTenders([]);
    setPaymentAmount(orderTotal);
    resetMemberCardLookup();
    setSearchParams({ view: nextView });
  };

  const handleOpenPay = () => {
    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }
    if (isSettledSalesOrder(selectedOrder)) {
      setLocalError(t("cashier.errors.orderAlreadyPaid"));
      return;
    }
    if (activeView !== "pay") {
      payReturnViewRef.current = activeView;
    }
    setSearchParams({ view: "pay" });
    setLocalError(null);
    setNotice(null);
  };

  const handleOpenSplit = () => {
    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }
    if (isSettledSalesOrder(selectedOrder)) {
      setLocalError(t("cashier.errors.orderAlreadyPaid"));
      return;
    }
    if (activeView !== "pay") {
      payReturnViewRef.current = activeView;
    }
    setSearchParams({ view: "pay" });
    if (isSplitMode) return;
    setIsSplitMode(true);
    setSplitTenders([]);
    setPaymentAmount(orderTotal);
    setLocalError(null);
    setNotice(t("cashier.payment.splitOpened"));
  };

  const handleCloseSplit = () => {
    setLocalError(null);
    setNotice(t("cashier.payment.splitClosed"));
    closePayView();
  };

  const handleClosePay = () => {
    setLocalError(null);
    setNotice(null);
    closePayView();
  };

  const handleAddSplitTender = () => {
    if (!paymentMethodId) {
      setLocalError(t("cashier.errors.paymentMethodRequired"));
      return;
    }
    if (
      selectedPaymentMethod &&
      isMemberCardPaymentMethod(selectedPaymentMethod) &&
      (!memberCard || !memberWallet)
    ) {
      setLocalError(t("cashier.errors.memberCardRequired"));
      return;
    }
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLocalError(t("cashier.errors.splitAmount"));
      return;
    }
    const remaining = remainingReceivable(orderTotal, splitTenders);
    const tenderAmount = Math.min(amount, remaining);
    if (tenderAmount <= 0) {
      setLocalError(t("cashier.errors.splitComplete"));
      return;
    }
    const nextTenders = [
      ...splitTenders,
      {
        id: `split-${Date.now()}-${splitTenders.length}`,
        paymentMethodId,
        amount: tenderAmount.toFixed(4),
        ...(selectedPaymentMethod &&
        isMemberCardPaymentMethod(selectedPaymentMethod) &&
        memberCard?.id
          ? { guestCardId: memberCard.id }
          : {}),
      },
    ];
    setSplitTenders(nextTenders);
    setPaymentAmount(remainingReceivable(orderTotal, nextTenders).toFixed(4));
    setLocalError(null);
  };

  const handleRemoveSplitTender = (tenderId: string) => {
    const nextTenders = splitTenders.filter((tender) => tender.id !== tenderId);
    setSplitTenders(nextTenders);
    setPaymentAmount(remainingReceivable(orderTotal, nextTenders).toFixed(4));
  };

  const handleIncreaseLineQuantity = async (line: (typeof activeOrderLines)[number]) => {
    try {
      setLocalError(null);
      setNotice(null);
      await mutateOrderLineQuantity(line.id, Number(line.quantity || 0) + 1);
      setNotice(t("cashier.orderPanel.itemUpdated"));
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.updateOrderLine")
      );
    }
  };

  const handleDecreaseLineQuantity = async (line: (typeof activeOrderLines)[number]) => {
    try {
      setLocalError(null);
      setNotice(null);
      await mutateOrderLineQuantity(line.id, Number(line.quantity || 0) - 1);
      setNotice(t("cashier.orderPanel.itemUpdated"));
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.updateOrderLine")
      );
    }
  };

  const handleRemoveLine = async (line: (typeof activeOrderLines)[number]) => {
    try {
      setLocalError(null);
      setNotice(null);
      if (isDirectCheckoutMode) {
        setDirectCartLines((current) => current.filter((entry) => entry.id !== line.id));
      } else if (selectedOrder) {
        if (isSettledSalesOrder(selectedOrder)) {
          throw new Error(t("cashier.errors.orderAlreadyPaid"));
        }
        await removeOrderLine(selectedOrder.id, line.id);
      }
      setNotice(t("cashier.orderPanel.itemRemoved"));
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.removeOrderLine")
      );
    }
  };

  const handleFireKds = async () => {
    setLocalError(null);
    setNotice(null);

    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }

    try {
      if (isSettledSalesOrder(selectedOrder)) {
        throw new Error(t("cashier.errors.orderAlreadyPaid"));
      }
      let salesOrderId = selectedOrder?.id;
      const sessionId = selectedOrderSession?.id;

      if (!salesOrderId && !sessionId && isDirectCheckoutMode) {
        if (!activeOrderLines.length) {
          throw new Error(t("cashier.errors.emptyOrder"));
        }

        const context = await requireCashierContext();
        const order = await createOrder({
          tenantId: context.tenantId,
          locationId: context.locationId,
          salesChannel: "POS",
          serviceType: toApiServiceType(
            activeServiceType === "TABLE" ? "DINE_IN" : activeServiceType
          ),
          status: "DRAFT",
          subtotal: "0.0000",
          totalDiscount: "0.0000",
          totalTax: "0.0000",
          grandTotal: "0.0000",
          idempotencyKey: `cashier-kds-${Date.now()}`,
        });

        for (const line of activeOrderLines) {
          const variant = variantById[line.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          if (!product) continue;

          await addProductToOrder(
            order.id,
            product,
            line.variantId,
            Number(line.quantity || 1),
            { refreshLines: false }
          );
        }

        salesOrderId = order.id;
        setIsDirectCheckoutMode(false);
        setDirectCartLines([]);
      }

      if (!salesOrderId && !sessionId) {
        throw new Error(t("cashier.errors.kdsTargetMissing"));
      }

      const kitchenLines = displayOrderLines
        .filter((line) => !line.voidedAt)
        .map((line) => {
          const variant = variantById[line.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          return {
            name:
              line.productName ||
              product?.name ||
              line.variantName ||
              variant?.variantSku ||
              "Item",
            quantity: String(line.quantity || "1"),
            categoryId: product?.categoryId,
          };
        });

      await fireToKds(
        sessionId ? { sessionId } : { salesOrderId: salesOrderId! }
      );

      try {
        const listed = locationId
          ? await listStations({ page: 1, limit: 100, locationId })
          : { stations: [] };
        const unrouted = await printer.printKitchen(
          {
            title: selectedOrder?.orderNumber || "KITCHEN",
            courseType: displayOrderLines.find((line) => line.courseType)?.courseType,
            firedAt: new Date().toISOString(),
            orderRef: salesOrderId || sessionId,
            lines: kitchenLines,
          },
          listed.stations.map((station) => ({
            id: station.id,
            name: station.name,
            printerId: station.printerId,
            categoryIds: station.routingRules.categoryIds,
          }))
        );
        if (unrouted.length) {
          setLocalError(
            t("cashier.errors.kdsUnrouted", {
              items: unrouted.map((line) => line.name).join(", "),
            })
          );
        }
      } catch (printError) {
        setLocalError(
          printError instanceof Error
            ? printError.message
            : t("cashier.errors.kdsFailed")
        );
      }

      if (activeTableId && tableOrderIds.length > 0 && selectedOrder) {
        setNotice(t("cashier.orderPanel.kdsSent"));
        setSearchParams({ view: "menu" });
        return;
      }

      clearOrderSelection();
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
      setLocalError(null);
      setNotice(t("cashier.orderPanel.kdsSent"));
      setSearchParams({ view: "orders" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setLocalError(
        /throttler|too many requests/i.test(message)
          ? t("cashier.errors.tooManyRequests")
          : message || t("cashier.errors.kdsFailed")
      );
    }
  };

  const handleTableStatusChange = async (
    status: (typeof diningTables)[number]["status"]
  ) => {
    if (!selectedOrderTable) return;
    setLocalError(null);
    setNotice(null);
    try {
      await updateDiningTableStatus(selectedOrderTable.id, status);
      setNotice(t("cashier.orderPanel.tableStatusUpdated", { status }));
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.errors.updateTableStatus")
      );
    }
  };

  const handleSessionStateChange = async (sessionState: TableSessionState) => {
    if (!selectedOrderSession) return;
    setLocalError(null);
    setNotice(null);
    try {
      await updateTableSessionState(selectedOrderSession.id, { sessionState });
      setNotice(
        t("cashier.orderPanel.sessionStateUpdated", { state: sessionState })
      );
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("cashier.errors.updateTableSession")
      );
    }
  };

  const handlePickup = async () => {
    if (!selectedOrder) return;
    setLocalError(null);
    try {
      await getCounterOrderById(selectedOrder.id);
      await pickupCounterOrder(selectedOrder.id);
      await selectOrderById(selectedOrder.id);
    } catch (caught) {
      setLocalError(
        caught instanceof Error
          ? caught.message
          : t("cashier.errors.pickupFailed")
      );
    }
  };

  const handleServiceTypeChange = (type: ServiceType) => {
    setActiveServiceType(type);
    setIsDirectCheckoutMode(false);
    setDirectCartLines([]);
    setActiveTableId(null);
    setTableOrderIds([]);
    setMultiOrderLines({});
    setSelectedMergeOrderIds([]);
    clearOrderSelection();
    setDiscountAmount("0.0000");
    setDiscountReasonId("");
    setTipAmount("0.0000");
    setServiceCharge("0.0000");
    setLocalError(null);
    setNotice(null);
    setSearchParams({ view: "orders" });
  };

  const handleShowPendingNotifications = useCallback(() => {
    setStatusFilter("DRAFT");
    setNotice(t("cashier.notifications.pendingFilter"));
    setSearchParams({ view: "orders" });
  }, [setSearchParams, t]);

  const handleOrderSelect = async (order: (typeof salesOrders)[number]) => {
    setIsDirectCheckoutMode(false);
    setDirectCartLines([]);
    setActiveTableId(null);
    setTableOrderIds([]);
    setMultiOrderLines({});
    setNotice(null);
    await selectOrder(order);
  };

  const multiOrders = useMemo(() => {
    const candidates = selectedOrder
      ? [selectedOrder, ...salesOrders]
      : salesOrders;
    const unique = new Map(candidates.map((order) => [order.id, order]));
    return tableOrderIds
      .map((id) => unique.get(id))
      .filter((order): order is NonNullable<typeof order> => !!order);
  }, [salesOrders, selectedOrder, tableOrderIds]);

  const activeTableLabel = activeMultiOrderTable
    ? `${t("cashier.table")} ${activeMultiOrderTable.tableNumber}`
    : t("cashier.multiOrder.tableOrders");

  return (
    <section
      className={[
        "pos-split grid h-full min-h-0 min-w-0 overflow-hidden bg-[#070707] text-white",
        activeView === "multi-order" || activeView === "pay"
          ? "grid-cols-[13rem_minmax(0,1fr)] min-[1100px]:grid-cols-[18rem_minmax(0,1fr)]"
          : "grid-cols-[11rem_minmax(0,1fr)] min-[1100px]:grid-cols-[18rem_minmax(0,1fr)_8rem]",
      ].join(" ")}
    >
      <OrderPanel
        selectedOrder={selectedOrder}
        selectedOrderLines={displayOrderLines}
        products={products}
        variantsByProductId={variantsByProductId}
        paymentMethods={checkoutPaymentMethods}
        paymentMethodId={paymentMethodId}
        paymentAmount={paymentAmount}
        total={orderTotal}
        selectedTable={displayedOrderTable}
        selectedSession={selectedOrderSession}
        paymentInputRef={paymentInputRef}
        isLoading={isLoading || isPosSessionLoading}
        canCreateOrder={isWorkspaceReady && !isPosSessionLoading}
        isDineInService={isDineInService}
        feedback={notice}
        errorMessage={localError || error}
        tableOrderIds={tableOrderIds}
        onCreateOrder={() => void handleCreateOrder()}
        onSelectTableOrder={(orderId) => void handleSelectTableOrder(orderId)}
        onAddTableOrder={() => void handleAddTableOrder()}
        onManageTableOrders={() => {
          void refreshMultiOrderLines(tableOrderIds);
          setSearchParams({ view: "multi-order" });
        }}
        onIncreaseLineQuantity={(line) => void handleIncreaseLineQuantity(line)}
        onDecreaseLineQuantity={(line) => void handleDecreaseLineQuantity(line)}
        onRemoveLine={(line) => void handleRemoveLine(line)}
        onToggleFoc={(line) => void handleToggleFoc(line)}
        discountAmount={discountAmount}
        discountReasonId={discountReasonId}
        discountReasons={discountReasons}
        serviceCharge={serviceCharge}
        tipAmount={tipAmount}
        memberCardUid={memberCardUid}
        memberPointsLabel={
          memberWallet
            ? t("cashier.orderPanel.memberPointsBalance", {
                balance: memberWallet.balance,
              })
            : undefined
        }
        memberCardError={memberCardError}
        isMemberCardLoading={isMemberCardLoading}
        onDiscountAmountChange={setDiscountAmount}
        onDiscountReasonChange={setDiscountReasonId}
        onRemoveDiscount={() => {
          setDiscountAmount("0.0000");
          setDiscountReasonId("");
        }}
        onServiceChargeChange={setServiceCharge}
        onTipAmountChange={setTipAmount}
        onMemberCardUidChange={setMemberCardUid}
        onLookupMemberCard={() => void handleLookupMemberCard()}
        onPaymentAmountChange={setPaymentAmount}
        onPaymentMethodChange={setPaymentMethodId}
        onOpenSplit={handleOpenSplit}
        onCloseSplit={handleCloseSplit}
        isSplitMode={isSplitMode}
        splitTenderCount={splitTenders.length}
        splitRemaining={remainingReceivable(
          orderTotal,
          isSplitMode ? splitTenders : []
        )}
        showSplitButton={activeView !== "pay"}
        isPayView={activeView === "pay"}
        requiresTableAssignment={requiresTableAssignment}
        onOpenPay={handleOpenPay}
        onCheckout={() => void handleCheckout()}
        onPrintFinance={() =>
          void printer.printReceipt({
            title: "FINANCE",
            place: "FINANCE",
            showLogo: false,
            showPrices: true,
            receiptId: selectedOrder?.orderNumber,
            lines: displayOrderLines
              .filter((line) => !line.voidedAt)
              .map((line) => ({
                name: line.productName || line.variantName || "Item",
                quantity: String(line.quantity || "1"),
                unitPrice: String(line.unitPrice || ""),
              })),
            total: orderTotal,
          })
        }
        onFireKds={() => void handleFireKds()}
        onCancelOrder={() => void handleCancelOrder()}
        onPickup={() => void handlePickup()}
        onTableStatusChange={(status) => void handleTableStatusChange(status)}
        onSessionStateChange={(state) => void handleSessionStateChange(state)}
      />

      <main className="min-h-0 min-w-0">
        {activeView === "menu" ? (
          <ProductMenu
            products={menuProducts}
            variantsByProductId={variantsByProductId}
            orderedProductQuantities={orderedProductQuantities}
            onLoadVariants={fetchProductVariants}
            onAdd={handleAddProduct}
            onClose={handleCloseMenu}
          />
        ) : activeView === "pay" ? (
          <PaymentView
            methods={checkoutPaymentMethods}
            selectedMethodId={paymentMethodId}
            paymentAmount={paymentAmount}
            total={orderTotal}
            subtotal={selectedOrder?.subtotal || orderTotal}
            isSplitMode={isSplitMode}
            splitTenders={splitTenders}
            isLoading={isLoading || isPosSessionLoading}
            memberCardLookup={{
              cardUid: memberCardUid,
              guestName: memberWallet?.guestName,
              walletNumber: memberWallet?.walletNumber,
              balance: memberWallet?.balance,
              status: memberWallet?.status,
              error: memberCardError,
              isLoading: isMemberCardLoading,
              nfcSupported,
              nfcActive,
              nfcError,
              lastUid,
              onEnableNfc: () => void startNfc(),
              onCardUidChange: setMemberCardUid,
              onDetect: () => void handleLookupMemberCard(),
            }}
            onSelectMethod={setPaymentMethodId}
            onPaymentAmountChange={setPaymentAmount}
            onOpenSplit={handleOpenSplit}
            onClosePay={handleClosePay}
            onAddTender={handleAddSplitTender}
            onRemoveTender={handleRemoveSplitTender}
          />
        ) : activeView === "multi-order" && activeTableId ? (
          <MultiOrderingView
            tableLabel={activeTableLabel}
            orderIds={tableOrderIds}
            orders={multiOrders}
            linesByOrderId={multiOrderLines}
            activeOrderId={selectedOrder?.id}
            selectedOrderIds={selectedMergeOrderIds}
            isLoading={
              isLoading || isPosSessionLoading || isMultiOrderMutating
            }
            onBack={() => setSearchParams({ view: "menu" })}
            onOpenOrder={(orderId) => void handleSelectTableOrder(orderId)}
            onAddOrder={() => void handleAddTableOrder()}
            onSelectionChange={setSelectedMergeOrderIds}
            onMergeAll={() => void mergeOrders(tableOrderIds.slice(1))}
            onMergeSelected={() => void mergeOrders(selectedMergeOrderIds)}
            onSplitItems={(sourceOrderId, targetOrderId, lineIds) =>
              void handleSplitItems(sourceOrderId, targetOrderId, lineIds)
            }
          />
        ) : (
          <CashierBoard
            serviceType={activeServiceType}
            statusFilter={statusFilter}
            tables={pagedTables}
            orders={pagedOrders}
            selectedOrderId={selectedOrder?.id}
            isLoading={isLoading}
            error={error}
            page={boardPage}
            pageCount={boardPageCount}
            getLatestSession={getLatestSessionByTableId}
            getOrderCount={getTableOrderCount}
            getTableWarning={(openedAt) => resolveTableWarning(openedAt, nowMs)}
            notificationCount={boardMetrics.notificationCount}
            serviceTabCounts={boardMetrics.serviceTabCounts}
            statusTabCounts={boardMetrics.statusTabCounts}
            onNotificationsClick={handleShowPendingNotifications}
            onServiceTypeChange={handleServiceTypeChange}
            onStatusFilterChange={setStatusFilter}
            onTableSelect={(tableId) => void handleTableTap(tableId)}
            onOrderSelect={(order) => void handleOrderSelect(order)}
            onPageChange={setBoardPage}
          />
        )}
      </main>

      {activeView !== "multi-order" && activeView !== "pay" ? (
        <aside className="hidden min-h-0 flex-col border-l border-slate-800 bg-[#222] p-1.5 min-[1100px]:flex min-[1100px]:p-2">
        {activeView === "menu" ? (
          <>
            <button
              type="button"
              onClick={() => setMenuCategoryId("ALL")}
              className={[
                "mb-1 min-h-10 rounded px-2 py-2 text-left text-xs min-[1100px]:text-sm",
                menuCategoryId === "ALL" ? "bg-blue-600" : "bg-slate-500",
              ].join(" ")}
            >
              {t("cashier.productMenu.allCategories")}
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {menuCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setMenuCategoryId(category.id)}
                  className={[
                    "mb-1 min-h-10 w-full rounded px-2 py-2 text-left text-xs min-[1100px]:text-sm",
                    menuCategoryId === category.id ? "bg-blue-600" : "bg-slate-500",
                  ].join(" ")}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
        <button
          type="button"
          onClick={() => setZoneFilter("ALL")}
          className={[
            "mb-1 min-h-10 rounded px-2 py-2 text-left text-xs min-[1100px]:text-sm",
            zoneFilter === "ALL" ? "bg-blue-600" : "bg-slate-500",
          ].join(" ")}
        >
          {t("cashier.locations.all")}
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {diningZones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setZoneFilter(zone.id)}
              className={[
                "mb-1 min-h-10 w-full rounded px-2 py-2 text-left text-xs min-[1100px]:text-sm",
                zoneFilter === zone.id ? "bg-blue-600" : "bg-slate-500",
              ].join(" ")}
            >
              {zone.name}
            </button>
          ))}
        </div>
          </>
        )}
        </aside>
      ) : null}
    </section>
  );
}
