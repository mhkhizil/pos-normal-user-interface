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
  SplitLineDTO,
  TableSeatingChangeDTO,
  TableSessionState,
  toApiServiceType,
} from "@/core/application/dtos/CashierDTO";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { useCashier } from "@/core/presentation/hooks/useCashier";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { usePromotions } from "@/core/presentation/hooks/usePromotions";
import { useExtraFees } from "@/core/presentation/hooks/useExtraFees";
import type { ChosenFee } from "@/core/domain/entities/ExtraFee";
import { useKdsStationManagement } from "@/core/presentation/hooks/useKdsStationManagement";
import { usePrinterConnection } from "@/core/presentation/hooks/usePrinterConnection";
import { modifierPrintText } from "@/lib/printing/modifierText";
import { chosenOf, modifierExtra, modifierKey } from "@/lib/modifiers/choices";
import { sessionPrintTimes } from "@/lib/printing/formatKdsTicket";
import { menuProductFilter } from "@/lib/pos/menuProducts";
import { useSalesOrderManagement } from "@/core/presentation/hooks/useSalesOrderManagement";
import { CashierBoard } from "./cashier/CashierBoard";
import { MultiOrderingView } from "./cashier/MultiOrderingView";
import { OrderPanel, type GroupedSalesOrderLine } from "./cashier/OrderPanel";
import type { LineEdit } from "./cashier/LineEditDialog";
import { billBreakdown } from "@/lib/pos/billBreakdown";
import { linePriceNote } from "@/lib/pos/linePrice";
import { TableSeatingDialog } from "./cashier/TableSeatingDialog";
import { ExtraFeeDialog } from "./cashier/ExtraFeeDialog";
import { ManagerApprovalDialog } from "@/components/shift/ManagerApprovalDialog";
import { useNumberFormatter } from "@/lib/i18n/formatters";
import { HostessPicker } from "./spa/HostessPicker";
import { useWorkingHostesses } from "@/core/presentation/hooks/useWorkingHostesses";
import type { Hostess } from "@/core/domain/entities/Hostess";
import { SplitItemsDialog, SplitTarget } from "./cashier/SplitItemsDialog";
import { PaymentView } from "./cashier/PaymentView";
import { CreditCustomerPicker } from "./cashier/CreditCustomerPicker";
import type { Customer } from "@/core/domain/entities/Customer";
import { creditAvailable, isCreditMethod } from "@/lib/pos/credit";
import { ProductMenu } from "./cashier/ProductMenu";
import { TableChargesBar } from "./cashier/TableChargesBar";
import { useTableCharges } from "@/core/presentation/hooks/useTableCharges";
import {
  ChosenModifier,
  Product,
  ProductVariant,
  SalesOrderLine,
} from "@/core/domain/entities/Cashier";
import { GuestCard, GuestWallet } from "@/core/domain/entities/GuestWallet";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";
import { useGuestWalletManagement } from "@/core/presentation/hooks/useGuestWalletManagement";
import { calcLineTotals } from "@/lib/pos/checkoutCalculations";
import { useVenueSetting } from "@/core/presentation/hooks/useVenueSetting";
import { useBillOptions } from "@/core/presentation/hooks/useBillOptions";
import { usePermissions } from "@/features/permissions/usePermissions";
import {
  allocateOrderDiscountToLines,
  isFocLine,
  lineFocDiscount,
  payableFromServerGrandTotal,
  payableTotal,
  toMoney,
  withOrderTipOnFirstPayment,
} from "@/lib/pos/checkoutAdjustments";
import { isUnspendableWalletStatus } from "@/lib/pos/guestWalletAmounts";
import { isSettledSalesOrder } from "@/lib/pos/orderStatus";
import { isPendingKdsLine, pendingKdsLines } from "@/lib/pos/kdsLines";
import {
  givenAwayAmount,
  givenAwayDiscount,
  linePromotionSaving,
  promotionPreviewItems,
} from "@/lib/pos/promotions";
import type { PromotionLine } from "@/lib/pos/promotions";
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
import { cashierLabel } from "@/lib/printing/cashier";

const BOARD_PAGE_SIZE = 15;
const TABLE_STATUS_POLL_MS = 60_000;
const TABLE_STATUS_BACKOFF_MS = 180_000;
/** Whether Confirm pay prints the bill. Remembered per device. */
const PRINT_BILL_KEY = "pos:print-bill-on-confirm";

const readPrintBillOnConfirm = () => {
  try {
    return window.localStorage.getItem(PRINT_BILL_KEY) === "true";
  } catch {
    return false;
  }
};

/** A fee line from the cart as it goes on a saved bill. */
const feeOf = (line: {
  variantId: string;
  quantity?: string;
  unitPrice?: string;
  productName?: string;
}): ChosenFee => ({
  variantId: line.variantId,
  name: line.productName || "",
  unitPrice: Number(line.unitPrice || 0),
  quantity: Number(line.quantity || 1),
});

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
    inventoryLocations,
    activeServiceType,
    setActiveServiceType,
    isLoading,
    error,
    fetchProducts,
    fetchProduct,
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
    changeTableSeating,
    fireToKds,
    getLatestSessionByTableId,
    selectOrder,
    selectOrderById,
    createOrder,
    addProductToOrder,
    splitOrderLine,
    updateOrderLine,
    removeOrderLine,
    addProductToTableSession,
    addExtraFeeLine,
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
    fetchOrderBill,
    settleOrder,
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
    activePosRegisterId,
    activeLocationId
  );
  const { lookupCard, getWallet } = useGuestWalletManagement();

  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [zoneFilter, setZoneFilter] = useState("ALL");
  const [menuCategoryId, setMenuCategoryId] = useState("ALL");
  const [boardPage, setBoardPage] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState("0.0000");
  const [syncedPaymentTotal, setSyncedPaymentTotal] = useState<{
    orderId: string;
    discountAmount: string;
    tipAmount: string;
    billRevision: string;
    total: number;
  } | null>(null);
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
  const [seatingMode, setSeatingMode] = useState<
    "move" | "combine" | "split" | null
  >(
    null
  );
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
  const [billGeneration, setBillGeneration] = useState(0);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const confirmingPaymentRef = useRef(false);
  const [printBillOnConfirm, setPrintBillOnConfirm] = useState(readPrintBillOnConfirm);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const payReturnViewRef = useRef("menu");
  const pendingMemberDetectRef = useRef(false);
  const productAddQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { fees: extraFees, isFeeLine } = useExtraFees();
  const [extraFeeOpen, setExtraFeeOpen] = useState(false);
  const [voidApproval, setVoidApproval] = useState(false);
  const { formatCurrency } = useNumberFormatter();
  // A hostess service waits here until the cashier says which hostess gave it.
  const [hostessFor, setHostessFor] = useState<{
    product: Product;
    variantId: string;
    quantity: number;
    modifiers?: ChosenModifier[];
    note?: string;
  } | null>(null);
  const { hostesses: workingHostesses, load: loadHostesses } = useWorkingHostesses();
  useEffect(() => {
    void loadHostesses();
  }, [loadHostesses]);
  const [isAddingFee, setIsAddingFee] = useState(false);
  const payTableSyncRef = useRef<string | null>(null);

  const locationId = activeLocationId;
  const activeView = searchParams.get("view") || "orders";
  const previousViewRef = useRef(activeView);
  const isTableService = activeServiceType === "TABLE";
  const isDineInService = activeServiceType === "DINE_IN";
  const usesTableBoard = isTableService || isDineInService;
  const requiresTableSelection = isTableService;

  const loadData = useCallback(async () => {
    clearError();
    const tasks: Promise<unknown>[] = [
      fetchSalesOrders({ page: 1, limit: 100 }),
      fetchPaymentMethods(),
      fetchDiningZones(),
      fetchDiscountReasons(),
    ];
    // The menu is branch-scoped: fetching it before the workspace resolves the
    // branch returns a different menu that can land after the scoped one, which
    // is what made the items change on refresh.
    const menuFilter = menuProductFilter(locationId);
    if (menuFilter) tasks.push(fetchProducts(menuFilter));
    await Promise.allSettled(tasks);
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
      setBillGeneration((generation) => generation + 1);
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
  // The table's own charges: a pool table clock, a VIP room fee, a service charge.
  const tableCharges = useTableCharges(selectedOrderSession?.id ?? null);

  // Opening the pay screen directly (for example from the right-hand Pay tab)
  // bypasses handleOpenPay. Finalize a running table clock and reload the order
  // here so the amount on screen is current before Confirm pay is pressed.
  useEffect(() => {
    if (activeView !== "pay") {
      payTableSyncRef.current = null;
      return;
    }
    if (
      !selectedOrderSession ||
      !selectedOrder ||
      !tableCharges.isLoaded
    ) {
      return;
    }

    const syncKey = `${selectedOrderSession.id}:${selectedOrder.id}`;
    if (payTableSyncRef.current === syncKey) return;
    payTableSyncRef.current = syncKey;

    let cancelled = false;
    void (async () => {
      try {
        if (tableCharges.charges.running.length > 0) {
          const finalizedCharges = await tableCharges.stop();
          if (!finalizedCharges) {
            throw new Error(t("cashier.errors.tableChargesFinalize"));
          }
        }
        await selectOrderById(selectedOrder.id);
      } catch (caught) {
        if (!cancelled) {
          payTableSyncRef.current = null;
          setLocalError(
            caught instanceof Error
              ? caught.message
              : t("cashier.errors.tableChargesFinalize")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    selectOrderById,
    selectedOrder,
    selectedOrderSession,
    tableCharges.charges.running.length,
    tableCharges.isLoaded,
    tableCharges.stop,
    t,
  ]);

  /** Bills every running clock (a pool table) so the time used is on the bill. */
  const stopTableClocks = async () => {
    if (!selectedOrder || !tableCharges.charges.running.length) return;
    const stopped = await tableCharges.stop();
    if (stopped) {
      await selectOrderById(selectedOrder.id);
      setNotice(t("cashier.tableCharges.clocksStopped"));
    }
  };

  const selectedOrderTable = useMemo(
    () =>
      selectedOrderSession
        ? diningTables.find(
            (table) => table.id === selectedOrderSession.tableId
          ) || null
        : null,
    [diningTables, selectedOrderSession]
  );

  const joinedOrderTables = useMemo(
    () =>
      (selectedOrderSession?.joinedTableIds ?? [])
        .map((tableId) => diningTables.find((table) => table.id === tableId))
        .filter((table): table is (typeof diningTables)[number] => Boolean(table)),
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

  // The restaurant's menu: room and table charges are added from the table, and
  // products sold only elsewhere stay there. A hostess service asks who gave it.
  const menuProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.kind !== "RENTAL" &&
          (!product.soldAt?.length || product.soldAt.includes("BAR")) &&
          (menuCategoryId === "ALL" || product.categoryId === menuCategoryId)
      ),
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

  const {
    defaultTaxRate,
    taxAllItems,
    serviceChargeBps,
    serviceChargeOn,
    serviceChargeTaxRate,
    kdsDeleteSlips,
    quickNotes,
  } = useVenueSetting();
  const { hasPermission } = usePermissions();
  const canTakePayment = hasPermission("sales:checkout:write");
  const formatAmount = useCallback((value: number) => value.toFixed(4), []);

  const buildDirectLine = useCallback(
    (
      line: SalesOrderLine,
      product?: Product,
      variant?: ProductVariant
    ) => {
      const variantModifier = Number(variant?.priceModifier || 0);
      const basePrice = Number(product?.basePrice || line.unitPrice || 0);
      const unitPrice = line.priceOverride
        ? Number(line.priceOverride)
        : basePrice + variantModifier + modifierExtra(line.selectedModifiers);
      // A shop that taxes every item uses its default taxes on all but extra fees.
      const everyItem = taxAllItems && !isFeeLine(line);
      const ownRateId = everyItem ? undefined : product?.taxRateId;
      const fallback = everyItem || !(ownRateId || variant?.taxRate) ? defaultTaxRate : null;
      const isPriceInclusive = fallback
        ? fallback.isPriceInclusive
        : (variant?.isPriceInclusive ?? product?.isPriceInclusive);
      const lineTotals = calcLineTotals({
        quantity: line.quantity,
        unitPrice,
        lineDiscount: line.lineDiscount || "0.0000",
        isTaxable: taxAllItems ? everyItem : (variant?.isTaxable ?? product?.isTaxable),
        taxRate: fallback ? fallback.rate : (variant?.taxRate ?? product?.taxRate),
        isPriceInclusive,
      });
      return {
        ...line,
        productName: line.productName || product?.name,
        categoryId: line.categoryId || product?.categoryId,
        taxInclusive: Boolean(isPriceInclusive),
        unitPrice: formatAmount(unitPrice),
        taxRateId: lineTotals.taxAmount > 0 ? (ownRateId ?? fallback?.id) : line.taxRateId,
        taxAmount: formatAmount(lineTotals.taxAmount),
      };
    },
    [defaultTaxRate, formatAmount, isFeeLine, taxAllItems]
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
  const activeOrderLinesRef = useRef(activeOrderLines);
  activeOrderLinesRef.current = activeOrderLines;

  const receiptParty = (includePaidAt = false) => {
    const outlet = inventoryLocations.find((location) => location.id === locationId);
    const service = String(activeServiceType || selectedOrder?.serviceType || "");
    const serviceKey = `settings.cashier.serviceTypes.${service}`;
    const serviceLabel = t(serviceKey);
    const session = selectedOrderSession || activeTableSession;
    return {
      outletName: outlet?.name,
      cashier: cashierLabel(user),
      serviceType: service
        ? serviceLabel === serviceKey
          ? service.replaceAll("_", " ")
          : serviceLabel
        : undefined,
      tableOrRoom: displayedOrderTable?.tableNumber,
      pickupCode: selectedOrder?.pickupNumber,
      ...(includePaidAt ? { paidAt: new Date().toLocaleString() } : {}),
      ...sessionPrintTimes(session, includePaidAt ? new Date() : session?.closedAt),
    };
  };

  /** What the menu charges for one of a line, from the loaded menu or what the server sent with the line. */
  const menuPriceFor = (line: {
    variantId: string;
    menuPrice?: string;
    selectedModifiers?: unknown;
  }) => {
    if (isFeeLine(line)) return undefined;
    const variant = variantById[line.variantId];
    const product = variant ? productById[variant.productId] : undefined;
    const listPrice = product
      ? Number(product.basePrice || 0) + Number(variant?.priceModifier || 0)
      : line.menuPrice !== undefined
        ? Number(line.menuPrice)
        : undefined;
    return listPrice === undefined
      ? undefined
      : listPrice + modifierExtra(line.selectedModifiers);
  };

  /** A printed line's options, then the name of the hostess who gave or ordered it. */
  const withHostessNote = (
    modifiers: { names?: string; prices?: string },
    hostess?: { name: string }
  ) => {
    if (!hostess) return modifiers;
    return {
      names: [modifiers.names, hostess.name].filter(Boolean).join(", "),
      prices: [modifiers.prices, "-"].filter(Boolean).join(", "),
    };
  };

  const printableLines = (
    lines: Array<{
      voidedAt?: string | null;
      variantId: string;
      productName?: string;
      variantName?: string;
      quantity?: string | number;
      unitPrice?: string;
      lineDiscount?: string;
      appliedPromotionId?: string;
      taxAmount?: string;
      taxInclusive?: boolean;
      categoryId?: string;
      categoryName?: string;
      selectedModifiers?: unknown;
      menuPrice?: string;
      note?: string;
    }>,
    withoutTax = false,
    // On a bill the guest gets, a repriced item says so: "Water (Discount)".
    notePrices = false,
    // A promotion prints under its own item, as the till showed it.
    promotionOf?: (line: PromotionLine) => { label: string; amount: string } | undefined
  ) => {
    const printable = lines
      .filter((line) => !line.voidedAt)
      .map((line) => {
        const variant = variantById[line.variantId];
        const product = variant ? productById[variant.productId] : undefined;
        const modifiers = withHostessNote(
          modifierPrintText(line.selectedModifiers),
          lineHostess(line)
        );
        const quantity = Number(line.quantity || 1);
        // A copy its promotion gave away prints at 0, not at the menu price with
        // the saving left to the discount row.
        const givenAway = givenAwayAmount(line) > 0;
        const unitPrice = givenAway
          ? toMoney(0)
          : withoutTax && line.taxInclusive && quantity > 0
            ? toMoney(Number(line.unitPrice || 0) - Number(line.taxAmount || 0) / quantity)
            : line.unitPrice?.trim();
        const name = line.productName || product?.name || line.variantName || "Item";
        const note = notePrices && !givenAway
          ? linePriceNote(line.unitPrice, menuPriceFor(line))
          : undefined;
        const promotion = givenAway ? undefined : promotionOf?.(line);
        return {
          variantId: line.variantId,
          name: note ? t(`cashier.orderPanel.priceNote.${note}`, { name }) : name,
          quantity: String(line.quantity || "1"),
          unitPrice: unitPrice || undefined,
          // The category the server recorded on the line routes it to its
          // station printer; the menu lookup is only for lines added here.
          categoryId: line.categoryId || product?.categoryId,
          categoryName: line.categoryName || product?.categoryName,
          modifiers: modifiers.names,
          modifierPrices: modifiers.prices,
          ...(line.note ? { remarks: line.note } : {}),
          ...(promotion
            ? { promotion: promotion.label, promotionAmount: promotion.amount }
            : {}),
        };
      });
    // A bill may already hold the same item on more than one line. The receipt
    // shows one row with the combined quantity so it matches what was ordered.
    const merged = new Map<string, (typeof printable)[number]>();
    for (const line of printable) {
      const key = JSON.stringify([
        line.variantId,
        line.name,
        line.unitPrice,
        line.categoryId,
        line.modifiers,
        line.modifierPrices,
        line.promotion,
        line.remarks,
      ]);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, line);
        continue;
      }
      merged.set(key, {
        ...existing,
        quantity: String(Number(existing.quantity) + Number(line.quantity)),
        // Two rows of the same item under the same promotion add up too.
        ...(line.promotionAmount
          ? {
              promotionAmount: String(
                Number(existing.promotionAmount || 0) + Number(line.promotionAmount)
              ),
            }
          : {}),
      });
    }
    return [...merged.values()];
  };

  const displayOrderLines = useMemo(() => {
    if (isDirectCheckoutMode) return activeOrderLines;

    // A saved line keeps the price it was saved with, which the cashier may
    // have changed for this bill; only its tax is worked out here.
    return selectedOrderLines.map((line) => {
      const variant = variantById[line.variantId];
      const product = variant ? productById[variant.productId] : undefined;
      return product || variant
        ? {
            ...buildDirectLine({ ...line, priceOverride: line.unitPrice }, product, variant),
            priceOverride: undefined,
          }
        : line;
    });
  }, [
    activeOrderLines,
    buildDirectLine,
    isDirectCheckoutMode,
    productById,
    selectedOrderLines,
    variantById,
  ]);

  // Promotions for the shop's own menu (the BAR area), shown the same way the room
  // tills show them. The server prices every line saved on a bill, so only the
  // quick-sale cart, not saved until checkout, needs a preview of the saving.
  const promotions = usePromotions(
    "BAR",
    locationId || undefined,
    () => (isDirectCheckoutMode ? promotionPreviewItems(displayOrderLines) : [])
  );

  const orderedProductQuantities = useMemo(() => {
    return displayOrderLines.reduce<Record<string, number>>((quantities, line) => {
      const productId = variantById[line.variantId]?.productId;
      if (!productId) return quantities;
      quantities[productId] =
        (quantities[productId] || 0) + Number(line.quantity || 0);
      return quantities;
    }, {});
  }, [displayOrderLines, variantById]);

  const billRevision = JSON.stringify([selectedOrder?.grandTotal, activeOrderLines]);
  const billOptions = useBillOptions({
    billKey: `${isDirectCheckoutMode ? "direct" : selectedOrder?.id || "empty"}:${billGeneration}`,
    orderId: !isDirectCheckoutMode ? selectedOrder?.id : undefined,
    discount: discountAmount.trim() || "0.0000",
    revision: billRevision,
    fetchBill: fetchOrderBill,
  });
  const chooseBillOption = (field: "includeTax" | "includeServiceCharge", value: boolean) => {
    billOptions.choose(field, value);
    setIsSplitMode(false);
    setSplitTenders([]);
    setSyncedPaymentTotal(null);
    setLocalError(null);
  };

  // Instant checkout taxes the items after allocating the bill discount.
  const paymentBillLines = useMemo(() => {
    if (!isDirectCheckoutMode || !billOptions.changed) return displayOrderLines;
    const allocated = allocateOrderDiscountToLines(activeOrderLines, Number(discountAmount), isFeeLine);
    return activeOrderLines.map((line, index) => {
      const variant = variantById[line.variantId];
      const product = variant ? productById[variant.productId] : undefined;
      return buildDirectLine({ ...line, lineDiscount: allocated[index].lineDiscount }, product, variant);
    });
  }, [activeOrderLines, billOptions.changed, buildDirectLine, discountAmount, displayOrderLines, isDirectCheckoutMode, isFeeLine, productById, variantById]);

  /**
   * What running promotions take off the bill: credited on a saved line, or
   * previewed for a direct cart, which the server prices at checkout.
   */
  const promotionSaving = useMemo(() => {
    const discounts = isDirectCheckoutMode ? promotions.discounts : {};
    return paymentBillLines.reduce((sum, line) => {
      if (line.voidedAt || isFeeLine(line)) return sum;
      return sum + (linePromotionSaving(line, discounts)?.amount || 0);
    }, 0);
  }, [isDirectCheckoutMode, paymentBillLines, promotions.discounts]);

  const lineSubtotal = useMemo(() => {
    const backendTotal = Number(selectedOrder?.grandTotal || 0);
    const totalLines = paymentBillLines;
    const lineTotal = totalLines.reduce((sum, line) => {
      const quantity = Number(line.quantity || 0);
      const unitPrice = Number(line.unitPrice || 0);
      const discount = Number(line.lineDiscount || 0);
      const tax = billOptions.includeTax
        ? (line.taxInclusive ? 0 : Number(line.taxAmount || 0))
        : (line.taxInclusive ? -Number(line.taxAmount || 0) : 0);
      return sum + quantity * unitPrice - discount + tax;
    }, 0);
    if (!isDirectCheckoutMode && backendTotal > 0) {
      return Math.max(backendTotal, lineTotal);
    }
    // A direct cart is not priced yet: take the previewed promotions off here, so
    // the till charges what the server will bill and the receipt adds up.
    const directTotal = lineTotal - (isDirectCheckoutMode ? promotionSaving : 0);
    return directTotal > 0 ? directTotal : backendTotal;
  }, [
    paymentBillLines,
    billOptions.includeTax,
    isDirectCheckoutMode,
    promotionSaving,
    selectedOrder?.grandTotal,
  ]);

  // The shop's service charge, as the server will add it: on the items after
  // discounts and before tax, with the default taxes set to apply to it.
  const { serviceCharge, serviceChargeTax } = useMemo(() => {
    if (!billOptions.includeServiceCharge || !serviceChargeBps || !serviceChargeOn.BAR) {
      return { serviceCharge: 0, serviceChargeTax: 0 };
    }
    // Extra fees carry no service charge.
    const lines = paymentBillLines.filter((line) => !isFeeLine(line));
    const preTax =
      lines.reduce(
        (sum, line) =>
          sum +
          Number(line.quantity || 0) * Number(line.unitPrice || 0) -
          Number(line.lineDiscount || 0) -
          (line.taxInclusive ? Number(line.taxAmount || 0) : 0),
        0
      ) - (isDirectCheckoutMode && billOptions.changed ? 0 : Math.max(0, Number(discountAmount) || 0));
    const charge = (Math.max(0, preTax) * serviceChargeBps) / 10000;
    return { serviceCharge: charge, serviceChargeTax: billOptions.includeTax ? charge * serviceChargeTaxRate : 0 };
  }, [
    paymentBillLines,
    billOptions.changed,
    billOptions.includeServiceCharge,
    billOptions.includeTax,
    discountAmount,
    isDirectCheckoutMode,
    isFeeLine,
    serviceChargeBps,
    serviceChargeOn.BAR,
    serviceChargeTaxRate,
  ]);

  const orderTotal = useMemo(() => {
    if (
      syncedPaymentTotal &&
      syncedPaymentTotal.orderId === selectedOrder?.id &&
      syncedPaymentTotal.discountAmount === discountAmount &&
      syncedPaymentTotal.tipAmount === tipAmount &&
      syncedPaymentTotal.billRevision === billRevision
    ) {
      return syncedPaymentTotal.total.toFixed(4);
    }
    if (billOptions.bill) {
      return toMoney(Number(billOptions.bill.grandTotal) + Math.max(0, Number(tipAmount) || 0));
    }

    const serverGrandTotal = !isDirectCheckoutMode
      ? Number(selectedOrder?.grandTotal || 0)
      : 0;

    // Persisted orders already include their server-calculated tax and service
    // charge in grandTotal. Applying the local service charge again made the
    // amount jump every time an overdue table was refreshed before payment.
    if (serverGrandTotal > 0) {
      return payableFromServerGrandTotal({
        serverGrandTotal,
        orderDiscount: Number(discountAmount),
        tipAmount: Number(tipAmount),
      }).toFixed(4);
    }

    return payableTotal({
      lineTotal: lineSubtotal,
      orderDiscount: isDirectCheckoutMode && billOptions.changed ? 0 : Number(discountAmount),
      serviceCharge: serviceCharge + serviceChargeTax,
      tipAmount: Number(tipAmount),
    }).toFixed(4);
  }, [
    billOptions.bill,
    billOptions.changed,
    billRevision,
    discountAmount,
    isDirectCheckoutMode,
    lineSubtotal,
    selectedOrder?.grandTotal,
    selectedOrder?.id,
    serviceCharge,
    serviceChargeTax,
    syncedPaymentTotal,
    tipAmount,
  ]);

  const orderTax = useMemo(
    () =>
      (billOptions.includeTax ? paymentBillLines
        .reduce((total, line) => total + Number(line.taxAmount || 0), 0)
        : 0).toFixed(4),
    [billOptions.includeTax, paymentBillLines]
  );
  const receiptTax = billOptions.bill?.totalTax ?? toMoney(Number(orderTax) + serviceChargeTax);
  const receiptServiceCharge = billOptions.bill?.serviceCharge ?? toMoney(serviceCharge);
  const receiptSubtotal = billOptions.bill?.subtotal ?? (billOptions.changed
    ? toMoney(paymentBillLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice)
      - (!billOptions.includeTax && line.taxInclusive ? Number(line.taxAmount || 0) : 0), 0))
    : lineSubtotal.toFixed(4));
  const receiptDiscount = billOptions.bill?.totalDiscount ?? (billOptions.changed
    ? toMoney(paymentBillLines.reduce((sum, line) => sum + Number(line.lineDiscount || 0), 0)
      + (isDirectCheckoutMode ? 0 : Math.max(0, Number(discountAmount) || 0)))
    : discountAmount);
  // A copy a promotion gave away prints at 0, so the items and the discount row
  // leave its value out: the rows still add up to the subtotal, and the total
  // does not take the giveaway off twice.
  const receiptGivenAway = givenAwayDiscount(paymentBillLines);
  const receiptItemsSubtotal = toMoney(Number(receiptSubtotal) - receiptGivenAway);
  const receiptItemsDiscount = toMoney(Number(receiptDiscount) - receiptGivenAway);
  /** How a promotion on one line reads under that item, e.g. "1+1  -10,000". */
  const promotionForLine = (line: PromotionLine) => {
    const saving = linePromotionSaving(
      line,
      isDirectCheckoutMode ? promotions.discounts : {}
    );
    if (!saving || saving.amount <= 0) return undefined;
    const label =
      (line.appliedPromotionId
        ? promotions.promotionName(line.appliedPromotionId)
        : undefined) ||
      saving.names.join(", ") ||
      t("cashier.orderPanel.promo");
    return { label, amount: saving.amount.toFixed(4) };
  };

  const breakdown = (() => {
    const quote = billOptions.bill ?? billOptions.quote;
    const taxes = paymentBillLines.reduce(
      (sum, line) => {
        if (!billOptions.includeTax) return sum;
        const amount = Number(line.taxAmount || 0);
        return line.taxInclusive
          ? { ...sum, included: sum.included + amount }
          : { ...sum, added: sum.added + amount };
      },
      { added: 0, included: 0 }
    );
    return billBreakdown({
      lines: displayOrderLines,
      menuPrice: menuPriceFor,
      itemsTotal: quote
        ? Number(quote.subtotal)
        : paymentBillLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0)
          - (!billOptions.includeTax && line.taxInclusive ? Number(line.taxAmount || 0) : 0), 0),
      billDiscount: Number(discountAmount) || 0,
      // A direct cart's promotions are a preview until the server prices it.
      promotion: isDirectCheckoutMode ? promotionSaving : undefined,
      serviceCharge: quote ? Number(quote.serviceCharge) : serviceCharge,
      tax: quote ? Number(quote.addedTax) + Number(quote.serviceChargeTax) : taxes.added + serviceChargeTax,
      includedTax: quote
        ? Number(quote.totalTax) - Number(quote.addedTax) - Number(quote.serviceChargeTax)
        : taxes.included,
      tip: Number(tipAmount) || 0,
      total: Number(orderTotal),
    });
  })();

  const checkoutPaymentMethods = useMemo(
    () => ensureMemberCardPaymentMethod(paymentMethods),
    [paymentMethods]
  );
  const selectedPaymentMethod = checkoutPaymentMethods.find(
    (method) => method.id === paymentMethodId
  );
  // A bill put on account names whose account: picked when a credit method is tapped.
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditPickerOpen, setCreditPickerOpen] = useState(false);
  const creditMethodIds = useMemo(
    () => new Set(checkoutPaymentMethods.filter(isCreditMethod).map((method) => method.id)),
    [checkoutPaymentMethods]
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
    setPaymentAmount(Number(orderTotal).toFixed(2));
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
    setCreditCustomer(null);
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

  /**
   * Drops removed lines from what this till remembers of the bill, so adding the
   * same item again makes a new line instead of updating one that is gone.
   */
  const forgetLines = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    activeOrderLinesRef.current = activeOrderLinesRef.current.filter(
      (line) => !gone.has(line.id)
    );
    setMultiOrderLines((current) =>
      Object.fromEntries(
        Object.entries(current).map(([orderId, lines]) => [
          orderId,
          lines.filter((line) => !gone.has(line.id)),
        ])
      )
    );
  }, []);

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
        if (isFeeLine(line)) {
          await addExtraFeeLine({ sessionId: session.id }, feeOf(line));
          continue;
        }
        const variant = variantById[line.variantId];
        const product = variant ? productById[variant.productId] : undefined;
        if (!product) continue;

        await addProductToTableSession(
          session.id,
          product,
          line.variantId,
          Number(line.quantity || 1),
          undefined,
          chosenOf(line.selectedModifiers),
          line.priceOverride
        );
      }

      if (session.sessionState === "SEATED") {
        await updateTableSessionState(session.id, { sessionState: "ORDERING" });
      }
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
    },
    [
      addExtraFeeLine,
      addProductToTableSession,
      isFeeLine,
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

  const addProductToCart = async (
    product: (typeof products)[number],
    variantId: string,
    quantity: number,
    modifiers?: ChosenModifier[],
    hostessId?: string,
    note?: string
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

    const tableLines = activeTableId
      ? tableOrderIds.flatMap((orderId) => multiOrderLines[orderId] || [])
      : [];
    const clickedVariant = (variantsByProductId[product.id] || []).find(
      (variant) => variant.id === variantId
    );
    const clickedUnitPrice = (
      Number(product.basePrice || 0) +
      Number(clickedVariant?.priceModifier || 0) +
      modifierExtra(modifiers)
    ).toFixed(4);
    const hasModifiers = (line: (typeof activeOrderLines)[number]) => {
      const modifiers = line.selectedModifiers;
      if (!modifiers) return false;
      return Array.isArray(modifiers)
        ? modifiers.length > 0
        : Object.keys(modifiers).length > 0;
    };
    const candidates = new Map<string, (typeof activeOrderLines)[number]>();
    for (const line of [...activeOrderLinesRef.current, ...tableLines]) {
      if (!candidates.has(line.id)) candidates.set(line.id, line);
    }
    // A line with options or a note stays its own line, even for the same item.
    const matchingLines = startFreshCart || modifiers?.length || note
      ? []
      : [...candidates.values()].filter(
          (line) =>
            line.variantId === variantId &&
            Number(line.unitPrice || 0).toFixed(4) === clickedUnitPrice &&
            !hasModifiers(line) &&
            !line.note &&
            (line.hostessId || undefined) === hostessId &&
            !line.voidedAt &&
            isPendingKdsLine(line)
        );
    // Additions after Send KDS stay on a new pending line so the kitchen
    // receives them; the order panel still shows one combined quantity.
    const existingLine = matchingLines[0];

    const rememberAddedLine = (line: SalesOrderLine) => {
      const index = activeOrderLinesRef.current.findIndex(
        (item) => item.id === line.id
      );
      activeOrderLinesRef.current =
        index >= 0
          ? activeOrderLinesRef.current.map((item, itemIndex) =>
              itemIndex === index ? line : item
            )
          : [...activeOrderLinesRef.current, line];
    };

    if (existingLine && selectedOrder) {
      // Every matching 1x row plus this tap becomes the merged quantity, so
      // collapsing old duplicates cannot lose an item.
      const nextQuantity =
        matchingLines.reduce(
          (total, line) => total + Number(line.quantity || 0),
          0
        ) + Math.max(1, quantity);
      const existingOrderId = existingLine.salesOrderId || selectedOrder.id;
      await updateOrderLine(existingOrderId, existingLine.id, {
        variantId: existingLine.variantId,
        quantity: nextQuantity.toFixed(4),
        unitPrice: existingLine.unitPrice || "0.0000",
        lineDiscount: existingLine.lineDiscount || "0.0000",
        taxAmount: existingLine.taxAmount || "0.0000",
        seatNumber: existingLine.seatNumber,
      });
      activeOrderLinesRef.current = activeOrderLinesRef.current.map((line) =>
        line.id === existingLine.id
          ? { ...line, quantity: nextQuantity.toFixed(4) }
          : line
      );
      setMultiOrderLines((current) => {
        const lines = current[existingOrderId];
        if (!lines) return current;
        return {
          ...current,
          [existingOrderId]: lines.map((line) =>
            line.id === existingLine.id
              ? { ...line, quantity: nextQuantity.toFixed(4) }
              : line
          ),
        };
      });
      // Orders created before this fix can already hold several 1x rows of the
      // same item. Fold those into the line just incremented.
      const duplicates = matchingLines.filter(
        (line) =>
          line.id !== existingLine.id &&
          (line.salesOrderId || selectedOrder.id) === existingOrderId
      );
      if (duplicates.length) {
        for (const duplicate of duplicates) {
          await removeOrderLine(existingOrderId, duplicate.id).catch(
            () => undefined
          );
        }
        activeOrderLinesRef.current = activeOrderLinesRef.current.filter(
          (line) => !duplicates.some((duplicate) => duplicate.id === line.id)
        );
        setMultiOrderLines((current) => {
          const lines = current[existingOrderId];
          if (!lines) return current;
          return {
            ...current,
            [existingOrderId]: lines.filter(
              (line) => !duplicates.some((duplicate) => duplicate.id === line.id)
            ),
          };
        });
      }

      if (
        shouldUseTableSession &&
        selectedOrderSession?.sessionState === "SEATED"
      ) {
        await updateTableSessionState(selectedOrderSession.id, {
          sessionState: "ORDERING",
        });
      }
      return;
    }

    if (shouldUseTableSession && selectedOrderSession) {
      const sessionArgs = [
        selectedOrderSession.id,
        product,
        variantId,
        quantity,
        tableOrderIds.length > 1 ? selectedOrder?.id : undefined,
        modifiers,
        undefined,
        hostessId,
      ] as const;
      const line = await (note
        ? addProductToTableSession(...sessionArgs, note)
        : addProductToTableSession(...sessionArgs));
      rememberAddedLine(line);
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
      const line = await addProductToOrder(
        selectedOrder.id,
        product,
        variantId,
        quantity,
        { modifiers, hostessId, ...(note ? { note } : {}) }
      );
      rememberAddedLine(line);
    } else if (!requiresTableSelection || isDirectCheckoutMode || startFreshCart) {
      setIsDirectCheckoutMode(true);
      setDirectCartLines((current) => {
        const variants = variantsByProductId[product.id] || [];
        const variant = variants.find((item) => item.id === variantId);
        const key = [modifierKey(modifiers), hostessId, note].filter(Boolean).join("-");
        const lineId = key ? `direct-${variantId}-${key}` : `direct-${variantId}`;
        const existing = current.find((line) => line.id === lineId);
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
          return current.map((line) => (line.id === lineId ? updated : line));
        }
        const nextLine = buildDirectLine(
          {
            id: lineId,
            salesOrderId: "direct-checkout",
            variantId,
            quantity: Math.max(1, quantity).toFixed(4),
            unitPrice: product.basePrice || "0.0000",
            lineDiscount: "0.0000",
            taxAmount: "0.0000",
            status: "PENDING",
            ...(modifiers?.length ? { selectedModifiers: modifiers } : {}),
            ...(hostessId ? { hostessId } : {}),
            ...(note ? { note } : {}),
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

  const handleAddProduct = (
    product: (typeof products)[number],
    variantId: string,
    quantity: number,
    modifiers?: ChosenModifier[],
    hostessId?: string,
    note?: string
  ) => {
    if (product.askWhoServed && !hostessId) {
      setHostessFor({ product, variantId, quantity: Math.max(1, quantity), modifiers, note });
      return Promise.resolve();
    }
    const pendingAdd = productAddQueueRef.current.then(() =>
      addProductToCart(product, variantId, quantity, modifiers, hostessId, note)
    );
    productAddQueueRef.current = pendingAdd.catch(() => undefined);
    return pendingAdd;
  };

  /**
   * Puts an extra fee on whichever bill is open: a table's, an open bill, or the
   * quick-sale cart. A fee is always a line of its own.
   */
  const addExtraFeeToBill = async (fee: ChosenFee) => {
    const startFreshCart = isSettledSalesOrder(selectedOrder);
    if (startFreshCart) {
      clearOrderSelection();
      setActiveTableId(null);
      setTableOrderIds([]);
      setMultiOrderLines({});
      setIsDirectCheckoutMode(true);
    }

    if (!startFreshCart && selectedOrderSession && isPrimaryTableOrder) {
      const line = await addExtraFeeLine(
        { sessionId: selectedOrderSession.id },
        fee,
        tableOrderIds.length > 1 ? selectedOrder?.id : undefined
      );
      if (
        selectedOrder &&
        tableOrderIds.includes(selectedOrder.id) &&
        (!line.salesOrderId || line.salesOrderId === selectedOrder.id)
      ) {
        setMultiOrderLines((current) => ({
          ...current,
          [selectedOrder.id]: [
            ...(current[selectedOrder.id] || []).filter((item) => item.id !== line.id),
            line,
          ],
        }));
      }
    } else if (selectedOrder && !startFreshCart) {
      await addExtraFeeLine({ orderId: selectedOrder.id }, fee);
    } else if (!requiresTableSelection || isDirectCheckoutMode || startFreshCart) {
      setIsDirectCheckoutMode(true);
      setDirectCartLines((current) => [
        ...current,
        {
          id: `fee-${fee.variantId}-${Date.now()}`,
          salesOrderId: "direct-checkout",
          variantId: fee.variantId,
          quantity: Math.max(1, fee.quantity).toFixed(4),
          unitPrice: Math.max(0, fee.unitPrice).toFixed(4),
          lineDiscount: "0.0000",
          taxAmount: "0.0000",
          status: "PENDING",
          productName: fee.name,
        },
      ]);
    } else {
      throw new Error(t("cashier.errors.selectOrder"));
    }
  };

  const confirmExtraFee = async (fee: ChosenFee) => {
    setLocalError(null);
    setNotice(null);
    setIsAddingFee(true);
    const pending = productAddQueueRef.current.then(() => addExtraFeeToBill(fee));
    productAddQueueRef.current = pending.catch(() => undefined);
    try {
      await pending;
      setExtraFeeOpen(false);
      setNotice(t("cashier.extraFee.added"));
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : t("cashier.errors.addProduct"));
    } finally {
      setIsAddingFee(false);
    }
  };

  /** Confirm pay prints the bill only when the till asks for it. */
  const choosePrintBillOnConfirm = (value: boolean) => {
    setPrintBillOnConfirm(value);
    try {
      window.localStorage.setItem(PRINT_BILL_KEY, String(value));
    } catch {
      // Storage can be blocked; the choice then lasts until reload.
    }
  };

  const handleCheckout = async () => {
    if (confirmingPaymentRef.current) return;
    setLocalError(null);
    setNotice(null);

    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }

    confirmingPaymentRef.current = true;
    setIsConfirmingPayment(true);
    try {
      if (billOptions.isLoading || billOptions.error) {
        throw new Error(t("cashier.payment.billOptionsError"));
      }
      if (isSettledSalesOrder(selectedOrder)) {
        throw new Error(t("cashier.errors.orderAlreadyPaid"));
      }
      const context = await requireCashierContext();
      if (!activeOrderLines.length) {
        throw new Error(t("cashier.errors.checkoutEmpty"));
      }

      const orderDiscount = Math.max(0, Number(discountAmount) || 0);
      const tip = Math.max(0, Number(tipAmount) || 0);
      const discountLimit = isDirectCheckoutMode && billOptions.changed
        ? activeOrderLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice) - Number(line.lineDiscount || 0), 0)
        : lineSubtotal;
      if (orderDiscount > discountLimit + 0.009) {
        throw new Error(t("cashier.errors.discountTooLarge"));
      }
      if (orderDiscount > 0 && discountReasons.length && !discountReasonId) {
        throw new Error(t("cashier.errors.discountReasonRequired"));
      }

      // A table clock can gain another billing block after the pay screen was
      // opened, and a directly opened ?view=pay route never ran handleOpenPay.
      // Finalize the server-side charges and refresh the order before accepting
      // money. If the bill changed, show the new amount and require a second
      // confirmation so the cashier never charges more than the amount shown.
      if (selectedOrderSession && isPrimaryTableOrder && selectedOrder) {
        // The stop endpoint finalizes billable time. Calling it again after all
        // clocks are stopped can duplicate charges on non-idempotent backends.
        if (tableCharges.charges.running.length > 0) {
          const finalizedCharges = await tableCharges.stop();
          if (!finalizedCharges) {
            throw new Error(t("cashier.errors.tableChargesFinalize"));
          }
        }

        const refreshedOrder = await selectOrderById(selectedOrder.id);
        const serverGrandTotal = Number(refreshedOrder.grandTotal || 0);
        // grandTotal is already the server's final bill, including persisted
        // tax and service charge. Adding the local service charge here again
        // inflated 358,050 to 509,850. Only pending checkout adjustments belong
        // on top of the refreshed authoritative total.
        const refreshedBill = billOptions.changed
          ? await fetchOrderBill(selectedOrder.id, billOptions.query)
          : null;
        if (refreshedBill) billOptions.acceptBill(refreshedBill);
        const serverRefreshedTotal = refreshedBill
          ? Number(refreshedBill.grandTotal) + tip
          : serverGrandTotal > 0
          ? payableFromServerGrandTotal({
              serverGrandTotal,
              orderDiscount,
              tipAmount: tip,
            })
          : Number(orderTotal);
        const checkoutRequiredTotal =
          syncedPaymentTotal &&
          syncedPaymentTotal.orderId === selectedOrder.id &&
          syncedPaymentTotal.discountAmount === discountAmount &&
          syncedPaymentTotal.tipAmount === tipAmount &&
          syncedPaymentTotal.billRevision === billRevision
            ? syncedPaymentTotal.total
            : 0;
        // A checkout rejection is the strongest source of truth. The order GET
        // endpoint can lag behind it briefly, so never downgrade to that stale
        // grandTotal on the cashier's next confirmation attempt.
        const refreshedTotal = Math.max(
          serverRefreshedTotal,
          checkoutRequiredTotal
        );

        if (Math.abs(refreshedTotal - Number(orderTotal)) > 0.009) {
          setIsSplitMode(false);
          setSplitTenders([]);
          setPaymentAmount(refreshedTotal.toFixed(2));
          setSyncedPaymentTotal({
            orderId: selectedOrder.id,
            discountAmount,
            tipAmount,
            billRevision,
            total: refreshedTotal,
          });
          setLocalError(
            t("cashier.errors.billUpdated", {
              amount: refreshedTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            })
          );
          return;
        }
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
      const usesCredit = checkoutPayments.some((payment) =>
        creditMethodIds.has(payment.paymentMethodId)
      );
      if (usesCredit && !creditCustomer) {
        setCreditPickerOpen(true);
        throw new Error(t("cashier.credit.required"));
      }
      const onAccount = usesCredit && creditCustomer ? { customerId: creditCustomer.id } : {};
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
        sale: true,
        place: "CHECKOUT" as const,
        showLogo: true,
        showPrices: true,
        receiptId: selectedOrder?.orderNumber,
        ...receiptParty(true),
        lines: printableLines(paymentBillLines, !billOptions.includeTax, true, promotionForLine),
        subtotal: receiptItemsSubtotal,
        discount: Number(receiptItemsDiscount) > 0 ? receiptItemsDiscount : undefined,
        tax: Number(receiptTax) > 0 ? receiptTax : undefined,
        serviceCharge: Number(receiptServiceCharge) > 0 ? receiptServiceCharge : undefined,
        // The tip is inside the total below, so the slip says so.
        ...(tip > 0
          ? { amounts: [{ label: t("receipt.tip"), amount: toMoney(tip) }] }
          : {}),
        total: orderTotal,
        payments: checkoutPayments.map((payment) => ({
          name:
            checkoutPaymentMethods.find(
              (method) => method.id === payment.paymentMethodId
            )?.name || "Payment",
          amount: payment.amount,
        })),
        change: Math.max(
          0,
          checkoutPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) -
            Number(orderTotal || 0)
        ).toFixed(2),
      };
      const printPaidReceipt = async () => {
        try {
          await printer.printReceipt(paidReceipt);
          return null;
        } catch (printError) {
          return printError instanceof Error ? printError.message : "Print failed";
        }
      };

      if (selectedOrderSession && isPrimaryTableOrder && selectedOrder) {
        await checkoutTableSession(selectedOrderSession.id, {
          posSessionId: context.posSessionId,
          payments: checkoutPayments,
          ...onAccount,
          ...(tip > 0 ? { tipAmount: tip } : {}),
          ...(discountReasonId ? { discountReasonId } : {}),
          ...(orderDiscount > 0 ? { totalDiscount: orderDiscount } : {}),
          ...(billOptions.changed ? {
            includeTax: billOptions.includeTax,
            includeServiceCharge: billOptions.includeServiceCharge,
          } : {}),
        });
      } else if (selectedOrder && !isDirectCheckoutMode && !isMultiOrderSecondary) {
        // A saved order is paid as it stands, at the prices on its lines. The
        // quick-sale checkout would open a second order and price it from the menu.
        await settleOrder(selectedOrder.id, {
          payments: checkoutPayments,
          posSessionId: context.posSessionId,
          ...onAccount,
          ...(tip > 0 ? { tipAmount: toMoney(tip) } : {}),
          ...(orderDiscount > 0 ? { totalDiscount: toMoney(orderDiscount) } : {}),
          ...(discountReasonId ? { discountReasonId } : {}),
          ...(billOptions.changed ? {
            includeTax: billOptions.includeTax,
            includeServiceCharge: billOptions.includeServiceCharge,
          } : {}),
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
          ...(billOptions.changed ? {
            includeTax: billOptions.includeTax,
            includeServiceCharge: billOptions.includeServiceCharge,
          } : {}),
          items: allocateOrderDiscountToLines(activeOrderLines, orderDiscount, isFeeLine),
          payments: checkoutPayments,
          ...onAccount,
        });
      }

      const printError = printBillOnConfirm ? await printPaidReceipt() : null;

      if (activeTableId && selectedOrder) {
        if (selectedOrderSession && isPrimaryTableOrder) {
          await releasePaidTable(checkoutTableId, checkoutSessionId);
          clearTableOrderIds(activeTableId);
          setTableOrderIds([]);
          setMultiOrderLines({});
          setActiveTableId(null);
          await resetWorkspaceAfterTransaction(t("cashier.orderPanel.checkoutSuccess"));
          if (printError) setLocalError(printError);
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
          setNotice(t("cashier.orderPanel.checkoutSuccess"));
          if (printError) setLocalError(printError);
          setSearchParams({ view: "menu" });
          return;
        }

        setActiveTableId(null);
      }

      await releasePaidTable(checkoutTableId, checkoutSessionId);
      await resetWorkspaceAfterTransaction(t("cashier.orderPanel.checkoutSuccess"));
      if (printError) setLocalError(printError);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t("cashier.errors.checkout");
      const insufficient = message.match(
        /insufficient payment:\s*required\s+([\d,.]+),\s*received\s+[\d,.]+/i
      );
      const requiredTotal = insufficient
        ? Number(insufficient[1].replaceAll(",", ""))
        : Number.NaN;
      if (Number.isFinite(requiredTotal) && requiredTotal > 0) {
        setIsSplitMode(false);
        setSplitTenders([]);
        setPaymentAmount(requiredTotal.toFixed(2));
        if (selectedOrder) {
          setSyncedPaymentTotal({
            orderId: selectedOrder.id,
            discountAmount,
            tipAmount,
            billRevision,
            total: requiredTotal,
          });
        }
        if (selectedOrder) {
          await selectOrderById(selectedOrder.id).catch(() => undefined);
        }
        setLocalError(
          t("cashier.errors.billUpdated", {
            amount: requiredTotal.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          })
        );
        return;
      }
      setLocalError(message);
    } finally {
      confirmingPaymentRef.current = false;
      setIsConfirmingPayment(false);
    }
  };

  const handleCancelOrder = async () => {
    // Voiding a paid sale gives its money back, so a manager signs it off first.
    if (String(selectedOrder?.status || "").toUpperCase() === "COMPLETED") {
      setVoidApproval(true);
      return;
    }
    await cancelOrder();
  };

  const cancelOrder = async (approverToken?: string) => {
    const orderId = selectedOrder?.id || activeTableSession?.salesOrderId;
    // A paid sale being voided was made already; only an open order stops the kitchen.
    const cancelledLines =
      isDirectCheckoutMode ||
      String(selectedOrder?.status || "").toUpperCase() === "COMPLETED"
        ? []
        : activeOrderLines;
    const sessionId = selectedOrderSession?.id || activeTableSession?.id;
    const tableId = displayedOrderTable?.id || activeTableId;

    setLocalError(null);
    setNotice(null);
    try {
      if (orderId) {
        const isCompletedSale =
          String(selectedOrder?.status || "").toUpperCase() === "COMPLETED";
        if (isCompletedSale) {
          await voidCheckout(orderId, approverToken);
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

      const deletePrintError = orderId
        ? await printKdsDelete(cancelledLines)
        : null;
      await resetWorkspaceAfterTransaction(t("cashier.orderPanel.orderCancelled"));
      if (deletePrintError) setLocalError(deletePrintError);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t("cashier.errors.cancelOrder");
      setLocalError(message);
    }
  };

  /**
   * Tells the kitchen to stop making lines it was already sent: a DELETE slip
   * on each line's station printer, when the shop prints them. Nothing prints
   * for a line the kitchen never got, and a print problem never undoes the removal.
   */
  const printKdsDelete = async (lines: SalesOrderLine[]) => {
    if (!kdsDeleteSlips) return null;
    const printLines = printableLines(
      lines.filter((line) => !isPendingKdsLine(line) && !isFeeLine(line))
    );
    if (!printLines.length) return null;
    const title = t("cashier.orderPanel.kdsDeleteTitle");
    try {
      const listed = locationId
        ? await listStations({ page: 1, limit: 100, locationId })
        : { stations: [] };
      const printPlan = await printer.printKitchen(
        {
          title,
          firedAt: new Date().toISOString(),
          orderRef: selectedOrder?.orderNumber,
          lines: printLines.map((line) => ({ ...line, remarks: title })),
          ...receiptParty(),
        },
        listed.stations.map((station) => ({
          id: station.id,
          name: station.name,
          printerIds: station.printerIds,
          categoryIds: station.routingRules.categoryIds,
        })),
        { requireStationRouting: true }
      );
      const problems: string[] = [];
      if (printPlan.unrouted.length) {
        problems.push(
          t("cashier.errors.kdsUnrouted", {
            items: printPlan.unrouted.map((item) => item.name).join(", "),
          })
        );
      }
      if (printPlan.missingPrinterRoutes.length) {
        problems.push(
          t("cashier.errors.kdsPrinterUnavailable", {
            stations: printPlan.missingPrinterRoutes
              .map((route) => route.stationName)
              .join(", "),
          })
        );
      }
      return problems.length ? problems.join(" ") : null;
    } catch (error) {
      return error instanceof Error ? error.message : t("cashier.errors.kdsFailed");
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
      forgetLines([lineId]);
      const deletePrintError = await printKdsDelete([targetLine]);
      if (deletePrintError) setLocalError(deletePrintError);
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

  const menuPriceOf = (line: SalesOrderLine) => menuPriceFor(line);

  const hostessOrderers = workingHostesses.map((hostess) => ({
    id: hostess.id,
    name: hostess.nickname || hostess.name,
  }));
  /** The hostess a line names: who gave a hostess service, or who ordered anything else. */
  const lineHostess = (line: { variantId: string; hostessId?: string }) => {
    if (!line.hostessId) return undefined;
    const variant = variantById[line.variantId];
    const product = variant ? productById[variant.productId] : undefined;
    const hostess = workingHostesses.find((item) => item.id === line.hostessId);
    return {
      name: hostess ? hostess.nickname || hostess.name : t("cashier.orderPanel.aHostess"),
      gave: Boolean(product?.askWhoServed),
    };
  };

  const pickHostess = (hostess: Hostess) => {
    if (!hostessFor) return;
    const { product, variantId, quantity, modifiers, note } = hostessFor;
    setHostessFor(null);
    void handleAddProduct(product, variantId, quantity, modifiers, hostess.id, note).catch((caught) =>
      setLocalError(caught instanceof Error ? caught.message : t("cashier.errors.addProduct"))
    );
  };

  const handleEditLine = async (
    line: GroupedSalesOrderLine,
    edit: LineEdit
  ) => {
    setLocalError(null);
    setNotice(null);
    const fee = isFeeLine(line);
    const lines = line.groupedLines ?? [line];
    const priceFor = (entry: SalesOrderLine) =>
      fee ? entry.unitPrice || "0.0000" : formatAmount(edit.unitPrice);
    const discountFor = (entry: SalesOrderLine, unitPrice: string) => {
      if (edit.foc) return lineFocDiscount({ quantity: entry.quantity, unitPrice });
      return isFocLine(entry) ? "0.0000" : entry.lineDiscount || "0.0000";
    };
    const hostessOf = (entry: SalesOrderLine) =>
      edit.orderedBy === undefined ? entry.hostessId : edit.orderedBy || undefined;
    const noteOf = (entry: SalesOrderLine) =>
      edit.note === undefined ? entry.note : edit.note || undefined;
    const unchanged = (entry: SalesOrderLine) =>
      Number(priceFor(entry)) === Number(entry.unitPrice || 0) &&
      edit.foc === isFocLine(entry) &&
      (hostessOf(entry) || null) === (entry.hostessId || null) &&
      (noteOf(entry) || null) === (entry.note || null);
    // The newest lines take the change first; a line only partly covered is
    // split, so the rest of it keeps its price (3 waters at 2,000, 1 at 1,500).
    let left = edit.quantity;
    const plan: Array<{ entry: SalesOrderLine; take: number }> = [];
    for (const entry of [...lines].reverse()) {
      if (left <= 0) break;
      const take = Math.min(left, Number(entry.quantity || 0));
      if (take > 0) plan.push({ entry, take });
      left -= take;
    }
    const isPart = (entry: SalesOrderLine, take: number) =>
      take < Number(entry.quantity || 0) - 0.00005;
    try {
      if (isSettledSalesOrder(selectedOrder) && !isDirectCheckoutMode) {
        throw new Error(t("cashier.errors.orderAlreadyPaid"));
      }
      if (isDirectCheckoutMode) {
        const menu = menuPriceOf(line);
        const repriced =
          !fee && (menu === undefined || Math.abs(menu - edit.unitPrice) >= 0.0001);
        const edited = (entry: SalesOrderLine) => {
          const unitPrice = priceFor(entry);
          const variant = variantById[entry.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          return buildDirectLine(
            {
              ...entry,
              priceOverride: repriced ? unitPrice : undefined,
              lineDiscount: discountFor(entry, unitPrice),
              hostessId: hostessOf(entry),
              note: noteOf(entry),
            },
            product,
            variant
          );
        };
        const takes = new Map(plan.map(({ entry, take }) => [entry.id, take]));
        setDirectCartLines((current) =>
          current.flatMap((entry) => {
            const take = takes.get(entry.id);
            if (take === undefined || unchanged(entry)) return [entry];
            if (!isPart(entry, take)) return [edited(entry)];
            const kept = (Number(entry.quantity || 0) - take).toFixed(4);
            const keptDiscount = isFocLine(entry)
              ? lineFocDiscount({ quantity: kept, unitPrice: entry.unitPrice })
              : entry.lineDiscount;
            return [
              { ...entry, quantity: kept, lineDiscount: keptDiscount },
              edited({
                ...entry,
                id: `${entry.id}-part-${Date.now()}`,
                quantity: take.toFixed(4),
                lineDiscount: isFocLine(entry) ? "0.0000" : entry.lineDiscount,
              }),
            ];
          })
        );
        return;
      }
      if (!selectedOrder) return;
      for (const { entry, take } of plan) {
        if (unchanged(entry)) continue;
        const orderId = entry.salesOrderId || selectedOrder.id;
        const target = isPart(entry, take)
          ? await splitOrderLine(orderId, entry.id, take.toFixed(4))
          : entry;
        const unitPrice = priceFor(target);
        await updateOrderLine(orderId, target.id, {
          variantId: entry.variantId,
          quantity: take.toFixed(4),
          unitPrice,
          lineDiscount: discountFor(
            { ...target, quantity: take.toFixed(4), unitPrice: entry.unitPrice },
            unitPrice
          ),
          taxAmount: target.taxAmount || "0.0000",
          seatNumber: entry.seatNumber,
          ...(edit.orderedBy !== undefined ? { hostessId: edit.orderedBy } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        });
      }
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
    setPaymentAmount(Number(orderTotal).toFixed(2));
    resetMemberCardLookup();
    setSearchParams({ view: nextView });
  };

  const handleOpenPay = async () => {
    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }
    if (isSettledSalesOrder(selectedOrder)) {
      setLocalError(t("cashier.errors.orderAlreadyPaid"));
      return;
    }
    await stopTableClocks();
    if (activeView !== "pay") {
      payReturnViewRef.current = activeView;
    }
    setSearchParams({ view: "pay" });
    setLocalError(null);
    setNotice(null);
  };

  const handleOpenSplit = async () => {
    if (billOptions.isLoading || billOptions.error || confirmingPaymentRef.current) return;
    if (requiresTableAssignment) {
      promptTableSelection();
      return;
    }
    if (isSettledSalesOrder(selectedOrder)) {
      setLocalError(t("cashier.errors.orderAlreadyPaid"));
      return;
    }
    await stopTableClocks();
    if (activeView !== "pay") {
      payReturnViewRef.current = activeView;
    }
    setSearchParams({ view: "pay" });
    if (isSplitMode) return;
    setIsSplitMode(true);
    setSplitTenders([]);
    setPaymentAmount(Number(orderTotal).toFixed(2));
    setLocalError(null);
    setNotice(t("cashier.payment.splitOpened"));
  };

  const handleClosePay = () => {
    setLocalError(null);
    setNotice(null);
    closePayView();
  };

  const handleAddSplitTender = () => {
    if (billOptions.isLoading || billOptions.error || confirmingPaymentRef.current) return;
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
    setPaymentAmount(remainingReceivable(orderTotal, nextTenders).toFixed(2));
    setLocalError(null);
  };

  const handleRemoveSplitTender = (tenderId: string) => {
    const nextTenders = splitTenders.filter((tender) => tender.id !== tenderId);
    setSplitTenders(nextTenders);
    setPaymentAmount(remainingReceivable(orderTotal, nextTenders).toFixed(2));
  };

  const handleIncreaseLineQuantity = async (line: (typeof activeOrderLines)[number]) => {
    try {
      setLocalError(null);
      setNotice(null);
      if (!isDirectCheckoutMode && selectedOrder && !isPendingKdsLine(line)) {
        const variant = variantById[line.variantId];
        const product = variant ? productById[variant.productId] : undefined;
        if (!product) {
          throw new Error(t("cashier.errors.addProduct"));
        }
        await handleAddProduct(
          product,
          line.variantId,
          1,
          chosenOf(line.selectedModifiers)
        );
        setNotice(t("cashier.orderPanel.itemUpdated"));
        return;
      }
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
      const grouped = line as typeof line & {
        groupedLines?: (typeof activeOrderLines)[number][];
      };
      const lines = grouped.groupedLines?.length ? grouped.groupedLines : [line];
      if (isDirectCheckoutMode) {
        const ids = new Set(lines.map((entry) => entry.id));
        setDirectCartLines((current) =>
          current.filter((entry) => !ids.has(entry.id))
        );
      } else if (selectedOrder) {
        if (isSettledSalesOrder(selectedOrder)) {
          throw new Error(t("cashier.errors.orderAlreadyPaid"));
        }
        for (const entry of lines) {
          await removeOrderLine(selectedOrder.id, entry.id);
          forgetLines([entry.id]);
        }
        const deletePrintError = await printKdsDelete(lines);
        if (deletePrintError) setLocalError(deletePrintError);
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
          if (isFeeLine(line)) {
            await addExtraFeeLine({ orderId: order.id }, feeOf(line));
            continue;
          }
          const variant = variantById[line.variantId];
          const product = variant ? productById[variant.productId] : undefined;
          if (!product) continue;

          await addProductToOrder(
            order.id,
            product,
            line.variantId,
            Number(line.quantity || 1),
            {
              refreshLines: false,
              modifiers: chosenOf(line.selectedModifiers),
              unitPrice: line.priceOverride,
            }
          );
        }

        salesOrderId = order.id;
        setIsDirectCheckoutMode(false);
        setDirectCartLines([]);
      }

      if (!salesOrderId && !sessionId) {
        throw new Error(t("cashier.errors.kdsTargetMissing"));
      }

      // Extra fees are nothing for the kitchen.
      const unsentOrderLines = pendingKdsLines(displayOrderLines).filter(
        (line) => !isFeeLine(line)
      );
      if (!unsentOrderLines.length) {
        throw new Error(t("cashier.errors.kdsNothingNew"));
      }
      const kitchenLines = printableLines(unsentOrderLines);

      // A table session can outlive several KDS sends. Target the current sales
      // order when it exists so a later send only evaluates that order's new
      // lines instead of rebuilding the session's earlier batch.
      await fireToKds(
        salesOrderId ? { salesOrderId } : { sessionId: sessionId! }
      );

      let kitchenPrintError: string | null = null;
      try {
        const listed = locationId
          ? await listStations({ page: 1, limit: 100, locationId })
          : { stations: [] };
        const printPlan = await printer.printKitchen(
          {
            title: selectedOrder?.orderNumber || "KITCHEN",
            courseType: unsentOrderLines.find((line) => line.courseType)?.courseType,
            firedAt: new Date().toISOString(),
            orderRef: selectedOrder?.orderNumber || salesOrderId || sessionId,
            lines: kitchenLines,
            ...receiptParty(),
          },
          listed.stations.map((station) => ({
            id: station.id,
            name: station.name,
            printerIds: station.printerIds,
            categoryIds: station.routingRules.categoryIds,
          })),
          { requireStationRouting: true }
        );
        const printProblems: string[] = [];
        if (printPlan.unrouted.length) {
          printProblems.push(
            t("cashier.errors.kdsUnrouted", {
              items: printPlan.unrouted.map((line) => line.name).join(", "),
            })
          );
        }
        if (printPlan.missingPrinterRoutes.length) {
          printProblems.push(
            t("cashier.errors.kdsPrinterUnavailable", {
              stations: printPlan.missingPrinterRoutes
                .map((route) => route.stationName)
                .join(", "),
            })
          );
        }
        if (printProblems.length) {
          kitchenPrintError = printProblems.join(" ");
        }
      } catch (printError) {
        kitchenPrintError =
          printError instanceof Error
            ? printError.message
            : t("cashier.errors.kdsFailed");
      }

      if (activeTableId && tableOrderIds.length > 0 && selectedOrder) {
        if (kitchenPrintError) setLocalError(kitchenPrintError);
        setNotice(t("cashier.orderPanel.kdsSent"));
        setSearchParams({ view: "menu" });
        return;
      }

      clearOrderSelection();
      setIsDirectCheckoutMode(false);
      setDirectCartLines([]);
      setLocalError(kitchenPrintError);
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
    if (status === "AVAILABLE" && displayOrderLines.length > 0) {
      setNotice(t("cashier.errors.tableAvailableWithMenu"));
      return;
    }
    setLocalError(null);
    setNotice(null);
    if (
      status === "AVAILABLE" &&
      selectedOrder &&
      !isSettledSalesOrder(selectedOrder)
    ) {
      setLocalError(t("cashier.errors.tableHasActiveOrder"));
      return;
    }
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

  const handleSeatingChange = async (
    change: Exclude<TableSeatingChangeDTO, { kind: "split" }>
  ) => {
    const session = selectedOrderSession;
    if (!session) return;
    const tableNumber = (tableId: string) =>
      diningTables.find((table) => table.id === tableId)?.tableNumber || "";
    setLocalError(null);
    setNotice(null);
    try {
      await changeTableSeating(session.id, change);
      setSeatingMode(null);
      if (change.kind === "move") {
        // This till's extra orders for the table go with the guests.
        writeTableOrderIds(change.tableId, readTableOrderIds(session.tableId));
        clearTableOrderIds(session.tableId);
        if (activeTableId) setActiveTableId(change.tableId);
        setNotice(
          t("cashier.seating.moved", { table: tableNumber(change.tableId) })
        );
        return;
      }
      if (change.kind === "merge") {
        if (selectedOrder) await selectOrderById(selectedOrder.id);
        await refreshMultiOrderLines(tableOrderIds);
        setNotice(t("cashier.seating.combined"));
        return;
      }
      setNotice(
        t(
          change.kind === "join"
            ? "cashier.seating.joined"
            : "cashier.seating.released",
          { table: tableNumber(change.tableId) }
        )
      );
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.seating.failed")
      );
    }
  };

  const handleSplitToTable = async (
    target: SplitTarget,
    lines: SplitLineDTO[]
  ) => {
    const session = selectedOrderSession;
    if (!session) return;
    setLocalError(null);
    setNotice(null);
    try {
      let targetSessionId = "sessionId" in target ? target.sessionId : "";
      let tableId =
        "tableId" in target
          ? target.tableId
          : tableSessions.find((open) => open.id === targetSessionId)?.tableId;
      if ("tableId" in target) {
        const context = await requireCashierContext();
        const opened = await openTableSession({
          tenantId: context.tenantId,
          tableId: target.tableId,
          locationId: context.locationId,
          guestCount: 1,
          posRegisterId: context.posRegisterId,
          openedByPosSessionId: context.posSessionId,
          salesChannel: "POS",
        });
        targetSessionId = opened.id;
        if (opened.salesOrderId) {
          writeTableOrderIds(target.tableId, [opened.salesOrderId]);
        }
        tableId = target.tableId;
      }
      await changeTableSeating(session.id, {
        kind: "split",
        targetSessionId,
        lines,
      });
      setSeatingMode(null);
      if (selectedOrder) await selectOrderById(selectedOrder.id);
      await refreshMultiOrderLines(tableOrderIds);
      setNotice(
        t("cashier.seating.splitDone", {
          table:
            diningTables.find((table) => table.id === tableId)?.tableNumber ||
            "",
        })
      );
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : t("cashier.seating.failed")
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
        "pos-split grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(24rem,1fr)_minmax(24rem,1fr)] overflow-y-auto bg-[#070707] text-white md:grid-rows-1 md:overflow-hidden",
        activeView === "multi-order" || activeView === "pay"
          ? "min-[768px]:grid-cols-[14rem_minmax(0,1fr)] min-[1100px]:grid-cols-[18rem_minmax(0,1fr)]"
          : "min-[768px]:grid-cols-[14rem_minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,8rem)]",
      ].join(" ")}
    >
      <OrderPanel
        selectedOrder={selectedOrder}
        selectedOrderLines={displayOrderLines}
        billLines={paymentBillLines}
        includeTax={billOptions.includeTax}
        products={products}
        variantsByProductId={variantsByProductId}
        paymentMethods={checkoutPaymentMethods}
        paymentMethodId={paymentMethodId}
        paymentAmount={paymentAmount}
        total={orderTotal}
        breakdown={breakdown}
        selectedTable={displayedOrderTable}
        selectedSession={selectedOrderSession}
        paymentInputRef={paymentInputRef}
        isLoading={isLoading || isPosSessionLoading || billOptions.isLoading || isConfirmingPayment}
        checkoutBlocked={Boolean(billOptions.error)}
        canCreateOrder={isWorkspaceReady && !isPosSessionLoading}
        isDineInService={isDineInService}
        feedback={notice}
        errorMessage={localError || error}
        tableOrderIds={tableOrderIds}
        hasActiveTableOrder={Boolean(
          selectedOrder && !isSettledSalesOrder(selectedOrder)
        )}
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
        onEditLine={(line, edit) => void handleEditLine(line, edit)}
        chargeOptions={{
          includeTax: billOptions.includeTax,
          includeServiceCharge: billOptions.includeServiceCharge,
          onChange: chooseBillOption,
        }}
        menuPrice={menuPriceOf}
        orderers={hostessOrderers}
        quickNotes={quickNotes}
        lineHostess={lineHostess}
        promotions={promotions.running}
        promotionDiscounts={isDirectCheckoutMode ? promotions.discounts : undefined}
        promotionName={promotions.promotionName}
        discountAmount={discountAmount}
        discountReasonId={discountReasonId}
        discountReasons={discountReasons}
        serviceCharge={toMoney(Number(receiptServiceCharge) + Number(billOptions.bill?.serviceChargeTax ?? serviceChargeTax))}
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
        onTipAmountChange={setTipAmount}
        onMemberCardUidChange={setMemberCardUid}
        onLookupMemberCard={() => void handleLookupMemberCard()}
        onPaymentAmountChange={setPaymentAmount}
        onPaymentMethodChange={setPaymentMethodId}
        isSplitMode={isSplitMode}
        splitTenderCount={splitTenders.length}
        splitRemaining={remainingReceivable(
          orderTotal,
          isSplitMode ? splitTenders : []
        )}
        isPayView={activeView === "pay"}
        requiresTableAssignment={requiresTableAssignment}
        printBillOnConfirm={printBillOnConfirm}
        onPrintBillOnConfirmChange={choosePrintBillOnConfirm}
        onOpenPay={handleOpenPay}
        canTakePayment={canTakePayment}
        onCheckout={() => void handleCheckout()}
        onPrintFinance={() =>
          void printer.printReceipt({
            title: "FINANCE",
            place: "FINANCE",
            showLogo: false,
            showPrices: true,
            receiptId: selectedOrder?.orderNumber,
            ...receiptParty(),
            lines: printableLines(paymentBillLines, !billOptions.includeTax, true, promotionForLine),
            subtotal: receiptItemsSubtotal,
            discount: Number(receiptItemsDiscount) > 0 ? receiptItemsDiscount : undefined,
            tax: Number(receiptTax) > 0 ? receiptTax : undefined,
            serviceCharge: Number(receiptServiceCharge) > 0 ? receiptServiceCharge : undefined,
            ...(Number(tipAmount) > 0
              ? { amounts: [{ label: t("receipt.tip"), amount: toMoney(Number(tipAmount)) }] }
              : {}),
            total: orderTotal,
          })
        }
        onFireKds={() => void handleFireKds()}
        onCancelOrder={() => void handleCancelOrder()}
        onPickup={() => void handlePickup()}
        onTableStatusChange={(status) => void handleTableStatusChange(status)}
        onSessionStateChange={(state) => void handleSessionStateChange(state)}
        joinedTables={joinedOrderTables}
        onChangeTable={
          selectedOrderSession && !isSettledSalesOrder(selectedOrder)
            ? () => setSeatingMode("move")
            : undefined
        }
        onCombineTables={
          selectedOrderSession && !isSettledSalesOrder(selectedOrder)
            ? () => setSeatingMode("combine")
            : undefined
        }
        onSplitItems={
          selectedOrderSession && !isSettledSalesOrder(selectedOrder)
            ? () => setSeatingMode("split")
            : undefined
        }
        onReleaseTable={(tableId) =>
          void handleSeatingChange({ kind: "release", tableId })
        }
        onAddExtraFee={() => setExtraFeeOpen(true)}
        isFeeLine={isFeeLine}
      />

      {voidApproval && selectedOrder ? (
        <ManagerApprovalDialog
          title={t("cashier.voidApproval.title", { number: selectedOrder.orderNumber || "" })}
          permission="sales:refund:approve"
          confirmLabel={t("cashier.voidApproval.confirm")}
          onCancel={() => setVoidApproval(false)}
          onApproved={async (token) => {
            await cancelOrder(token);
            setVoidApproval(false);
          }}
        >
          {t("cashier.voidApproval.body", { amount: formatCurrency(Number(selectedOrder.grandTotal) || 0) })}
        </ManagerApprovalDialog>
      ) : null}

      {hostessFor ? (
        <HostessPicker
          serviceName={hostessFor.product.name}
          onPick={pickHostess}
          onCancel={() => setHostessFor(null)}
        />
      ) : null}

      {extraFeeOpen ? (
        <ExtraFeeDialog
          fees={extraFees}
          isBusy={isAddingFee}
          onConfirm={(fee) => void confirmExtraFee(fee)}
          onClose={() => setExtraFeeOpen(false)}
        />
      ) : null}

      {seatingMode === "split" && selectedOrderSession ? (
        <SplitItemsDialog
          session={selectedOrderSession}
          lines={selectedOrderLines}
          tables={diningTables}
          sessions={tableSessions}
          isBusy={isLoading}
          menuName={(line) => {
            const variant = variantById[line.variantId];
            return (variant ? productById[variant.productId]?.name : undefined) || variant?.variantSku;
          }}
          onConfirm={(target, lines) => void handleSplitToTable(target, lines)}
          onClose={() => setSeatingMode(null)}
        />
      ) : seatingMode && seatingMode !== "split" && selectedOrderSession ? (
        <TableSeatingDialog
          mode={seatingMode}
          session={selectedOrderSession}
          tables={diningTables}
          sessions={tableSessions}
          isBusy={isLoading}
          onConfirm={(change) => void handleSeatingChange(change)}
          onClose={() => setSeatingMode(null)}
        />
      ) : null}

      <main className="h-full min-h-0 min-w-0 overflow-hidden">
        {activeView === "menu" ? (
          <div className="flex h-full min-h-0 flex-col">
            {selectedOrderSession ? (
              <TableChargesBar
                charges={tableCharges.charges}
                isBusy={tableCharges.isBusy}
                error={tableCharges.error}
                onAdd={(charge) =>
                  void tableCharges
                    .add(charge.variantId, charge.minimumBlocks ?? undefined)
                    .then((done) => (done && selectedOrder ? selectOrderById(selectedOrder.id) : null))
                }
                onStop={(variantId) =>
                  void tableCharges
                    .stop(variantId)
                    .then((done) => (done && selectedOrder ? selectOrderById(selectedOrder.id) : null))
                }
              />
            ) : null}
            <div className="min-h-0 flex-1">
              <ProductMenu
                products={menuProducts}
                variantsByProductId={variantsByProductId}
                orderedProductQuantities={orderedProductQuantities}
                onLoadVariants={fetchProductVariants}
                onAdd={(product, variantId, quantity, modifiers, note) =>
                  handleAddProduct(product, variantId, quantity, modifiers, undefined, note)
                }
                onClose={handleCloseMenu}
                offerOptions
                quickNotes={quickNotes}
                onLoadProduct={fetchProduct}
                toolbar={
                  menuCategories.length ? (
                    <div className="mt-2 min-[1100px]:hidden">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t("cashier.productMenu.categories")}
                      </p>
                      <div
                        className="pos-scroll-hint flex shrink-0 gap-1.5 overflow-x-auto pb-1"
                        role="group"
                        aria-label={t("cashier.productMenu.categories")}
                      >
                      {[
                        { id: "ALL", name: t("cashier.productMenu.allCategories") },
                        ...menuCategories,
                      ].map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={menuCategoryId === category.id}
                          onClick={() => setMenuCategoryId(category.id)}
                          className={[
                            "min-h-9 shrink-0 whitespace-nowrap rounded px-3 text-xs font-medium",
                            menuCategoryId === category.id ? "bg-blue-600" : "bg-slate-600",
                          ].join(" ")}
                        >
                          {category.name}
                        </button>
                      ))}
                      </div>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        ) : activeView === "pay" ? (
          <>
            <PaymentView
              methods={checkoutPaymentMethods}
              selectedMethodId={paymentMethodId}
              paymentAmount={paymentAmount}
              total={orderTotal}
              breakdown={breakdown}
              billOptions={{
                includeTax: billOptions.includeTax,
                includeServiceCharge: billOptions.includeServiceCharge,
                isLoading: billOptions.isLoading,
                disabled: isLoading || isPosSessionLoading || isConfirmingPayment,
                error: billOptions.error,
                onChange: chooseBillOption,
              }}
              isSplitMode={isSplitMode}
              splitTenders={splitTenders}
              isLoading={isLoading || isPosSessionLoading || isConfirmingPayment || billOptions.isLoading || Boolean(billOptions.error)}
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
              onSelectMethod={(methodId) => {
                setPaymentMethodId(methodId);
                if (creditMethodIds.has(methodId) && !creditCustomer) setCreditPickerOpen(true);
              }}
              creditAccount={
                creditMethodIds.has(paymentMethodId) ||
                splitTenders.some((tender) => creditMethodIds.has(tender.paymentMethodId))
                  ? {
                      customerName: creditCustomer?.name,
                      owes: creditCustomer ? Number(creditCustomer.currentCreditBalance || 0) : undefined,
                      available: creditCustomer ? creditAvailable(creditCustomer) : undefined,
                      onChange: () => setCreditPickerOpen(true),
                    }
                  : undefined
              }
              onPaymentAmountChange={setPaymentAmount}
              onOpenSplit={handleOpenSplit}
              onClosePay={handleClosePay}
              onAddTender={handleAddSplitTender}
              onRemoveTender={handleRemoveSplitTender}
            />
            {creditPickerOpen ? (
              <CreditCustomerPicker
                amount={
                  isSplitMode
                    ? splitTenders
                        .filter((tender) => creditMethodIds.has(tender.paymentMethodId))
                        .reduce((sum, tender) => sum + Number(tender.amount || 0), 0) ||
                      Number(paymentAmount || 0)
                    : Number(orderTotal || 0)
                }
                onPick={(customer) => {
                  setCreditCustomer(customer);
                  setCreditPickerOpen(false);
                  setLocalError(null);
                }}
                onCancel={() => setCreditPickerOpen(false)}
              />
            ) : null}
          </>
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
            <div className="pos-scroll-hint min-h-0 flex-1 overflow-y-auto">
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
