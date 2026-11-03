import { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckoutRequestDTO,
  CreateOrderPaymentDTO,
  CreateSalesOrderDTO,
  CreateTipPoolDTO,
  CreateWaitlistEntryDTO,
  DiningTableFilterDTO,
  FireKdsDTO,
  fromApiServiceType,
  toApiServiceType,
  KdsTicketFilterDTO,
  KdsTicketListDTO,
  OpenTableSessionDTO,
  PosRegisterFilterDTO,
  PosSessionFilterDTO,
  ProductFilterDTO,
  SalesOrderFilterDTO,
  SeatWaitlistEntryDTO,
  ServiceType,
  TableSessionCheckoutDTO,
  TableSessionFilterDTO,
  CreatePosRegisterDTO,
  CreatePosSessionDTO,
  TipPoolAllocationDTO,
  TipPoolFilterDTO,
  UpdateSalesOrderLineDTO,
  UpdateTableSessionStateDTO,
  TableSeatingChangeDTO,
  UpdateTipPoolDTO,
  UpdateWaitlistEntryDTO,
  TableWarningStatusDTO,
  VoidCheckoutResultDTO,
  WaitlistFilterDTO,
} from "../../application/dtos/CashierDTO";
import {
  AdjustmentReason,
  DiningTable,
  DiningZone,
  InventoryLocation,
  KdsTicket,
  OrderPayment,
  PaymentMethod,
  PosRegister,
  PosSession,
  Product,
  ProductVariant,
  SalesOrder,
  SalesOrderLine,
  TableSession,
  TipPool,
  TipPoolAllocation,
  WaitlistEntry,
  CounterOrderDetail,
  type ChosenModifier,
} from "../../domain/entities/Cashier";
import type { ChosenFee } from "../../domain/entities/ExtraFee";
import { modifierExtra } from "@/lib/modifiers/choices";
import { ICashierService } from "../../domain/services/ICashierService";
import container from "../../infrastructure/di/container";
import {
  readStoredActiveLocationId,
  resolveActiveLocationId,
  writeStoredActiveLocationId,
} from "@/lib/pos/activeLocation";
import { findOpenTableSession } from "@/lib/pos/tableSession";

/**
 * Orders created before the backend stored a draft's service type come back
 * with none, which reads as DINE_IN. Remember the type each order was opened
 * with so those drafts still count where they were opened.
 */
const OPENED_SERVICE_TYPES_KEY = "pos:opened-service-types:v1";
const MAX_OPENED_SERVICE_TYPES = 200;

const readOpenedServiceTypes = (): Map<string, ServiceType> => {
  try {
    const raw = window.localStorage.getItem(OPENED_SERVICE_TYPES_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const allowed = new Set<ServiceType>([
      "TABLE",
      "DINE_IN",
      "TAKE_AWAY",
      "DELIVERY",
      "PICK_UP",
    ]);
    return new Map(
      Object.entries(parsed).filter((entry): entry is [string, ServiceType] =>
        allowed.has(entry[1] as ServiceType)
      )
    );
  } catch {
    return new Map();
  }
};

const writeOpenedServiceTypes = (types: Map<string, ServiceType>) => {
  try {
    while (types.size > MAX_OPENED_SERVICE_TYPES) {
      const oldest = types.keys().next().value;
      if (!oldest) break;
      types.delete(oldest);
    }
    window.localStorage.setItem(
      OPENED_SERVICE_TYPES_KEY,
      JSON.stringify(Object.fromEntries(types))
    );
  } catch {
    // Storage can be blocked; the in-memory map still works for this session.
  }
};

interface UseCashierReturn {
  products: Product[];
  inventoryLocations: InventoryLocation[];
  activeLocationId: string;
  setActiveLocationId: (locationId: string) => void;
  salesOrders: SalesOrder[];
  selectedOrder: SalesOrder | null;
  selectedOrderLines: SalesOrderLine[];
  selectedOrderPayments: OrderPayment[];
  paymentMethods: PaymentMethod[];
  discountReasons: AdjustmentReason[];
  voidReasons: AdjustmentReason[];
  diningZones: DiningZone[];
  diningTables: DiningTable[];
  tableSessions: TableSession[];
  waitlistEntries: WaitlistEntry[];
  tipPools: TipPool[];
  tipPoolAllocations: TipPoolAllocation[];
  variantsByProductId: Record<string, ProductVariant[]>;
  activeServiceType: ServiceType;
  setActiveServiceType: (type: ServiceType) => void;
  isLoading: boolean;
  isLocationsLoading: boolean;
  error: string | null;
  fetchInventoryLocations: (
    tenantId: string,
    options?: { ignoreStored?: boolean }
  ) => Promise<string>;
  fetchProducts: (params?: ProductFilterDTO) => Promise<void>;
  fetchProductVariants: (productId: string) => Promise<ProductVariant[]>;
  /** One product as the server keeps it, for what the menu list leaves out. */
  fetchProduct: (productId: string) => Promise<Product>;
  fetchSalesOrders: (params?: SalesOrderFilterDTO) => Promise<void>;
  fetchPaymentMethods: () => Promise<void>;
  fetchPosRegisters: (params?: PosRegisterFilterDTO) => Promise<PosRegister[]>;
  createPosRegister: (payload: CreatePosRegisterDTO) => Promise<PosRegister>;
  fetchPosSessions: (params?: PosSessionFilterDTO) => Promise<PosSession[]>;
  createPosSession: (payload: CreatePosSessionDTO) => Promise<PosSession>;
  closePosSession: (sessionId: string) => Promise<PosSession>;
  fetchDiningZones: () => Promise<void>;
  fetchDiningTables: (params?: DiningTableFilterDTO) => Promise<void>;
  fetchTableSessions: (params?: TableSessionFilterDTO) => Promise<TableSession[]>;
  refreshDiningTableStatus: (part?: "tables" | "sessions") => Promise<boolean>;
  updateDiningTableStatus: (
    tableId: string,
    status: DiningTable["status"]
  ) => Promise<DiningTable>;
  updateTableSessionState: (
    sessionId: string,
    payload: UpdateTableSessionStateDTO
  ) => Promise<TableSession>;
  /** Moves, combines, joins or releases tables, then reloads the floor. */
  changeTableSeating: (
    sessionId: string,
    change: TableSeatingChangeDTO
  ) => Promise<TableSession>;
  fetchDiscountReasons: () => Promise<void>;
  fetchVoidReasons: () => Promise<void>;
  fetchWaitlist: (params?: WaitlistFilterDTO) => Promise<void>;
  createWaitlistEntry: (payload: CreateWaitlistEntryDTO) => Promise<WaitlistEntry>;
  updateWaitlistEntry: (
    id: string,
    payload: UpdateWaitlistEntryDTO
  ) => Promise<WaitlistEntry>;
  notifyWaitlistEntry: (id: string) => Promise<WaitlistEntry>;
  seatWaitlistEntry: (id: string, payload: SeatWaitlistEntryDTO) => Promise<WaitlistEntry>;
  cancelWaitlistEntry: (id: string) => Promise<WaitlistEntry>;
  noShowWaitlistEntry: (id: string) => Promise<WaitlistEntry>;
  fetchTipPools: (params?: TipPoolFilterDTO) => Promise<void>;
  getTipPoolById: (poolId: string) => Promise<TipPool>;
  createTipPool: (payload: CreateTipPoolDTO) => Promise<TipPool>;
  updateTipPool: (poolId: string, payload: UpdateTipPoolDTO) => Promise<TipPool>;
  distributeTipPool: (poolId: string) => Promise<TipPool>;
  settleTipPool: (poolId: string) => Promise<TipPool>;
  fetchTipPoolAllocations: (poolId: string) => Promise<void>;
  createTipPoolAllocation: (
    poolId: string,
    payload: TipPoolAllocationDTO
  ) => Promise<TipPoolAllocation>;
  updateTipPoolAllocation: (
    poolId: string,
    allocationId: string,
    payload: Partial<TipPoolAllocationDTO>
  ) => Promise<TipPoolAllocation>;
  deleteTipPoolAllocation: (
    poolId: string,
    allocationId: string
  ) => Promise<void>;
  openTableSession: (payload: OpenTableSessionDTO) => Promise<TableSession>;
  checkoutTableSession: (
    sessionId: string,
    payload: TableSessionCheckoutDTO
  ) => Promise<TableSession>;
  fireToKds: (payload: FireKdsDTO) => Promise<Record<string, unknown>>;
  getLatestSessionByTableId: (tableId: string) => TableSession | undefined;
  selectOrder: (order: SalesOrder) => Promise<void>;
  selectOrderById: (orderId: string) => Promise<SalesOrder>;
  createOrder: (payload: CreateSalesOrderDTO) => Promise<SalesOrder>;
  addProductToOrder: (
    orderId: string,
    product: Product,
    variantId?: string,
    quantity?: number,
    options?: {
      refreshLines?: boolean;
      modifiers?: ChosenModifier[];
      unitPrice?: string;
      hostessId?: string;
      note?: string;
    }
  ) => Promise<SalesOrderLine>;
  splitOrderLine: (
    orderId: string,
    lineId: string,
    quantity: string
  ) => Promise<SalesOrderLine>;
  updateOrderLine: (
    orderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ) => Promise<void>;
  removeOrderLine: (orderId: string, lineId: string) => Promise<void>;
  addProductToTableSession: (
    sessionId: string,
    product: Product,
    variantId?: string,
    quantity?: number,
    keepSelectedOrderId?: string,
    modifiers?: ChosenModifier[],
    unitPrice?: string,
    hostessId?: string,
    note?: string
  ) => Promise<SalesOrderLine>;
  addExtraFeeLine: (
    target: { orderId: string } | { sessionId: string },
    fee: ChosenFee,
    keepSelectedOrderId?: string
  ) => Promise<SalesOrderLine>;
  getCounterOrderById: (counterOrderId: string) => Promise<CounterOrderDetail>;
  pickupCounterOrder: (counterOrderId: string) => Promise<SalesOrder | null>;
  listKdsTickets: (
    params?: KdsTicketFilterDTO
  ) => Promise<KdsTicketListDTO & { tickets: KdsTicket[] }>;
  getKdsTicketById: (ticketId: string) => Promise<KdsTicket>;
  addPayment: (orderId: string, payload: CreateOrderPaymentDTO) => Promise<void>;
  processCheckout: (payload: CheckoutRequestDTO) => Promise<Record<string, unknown>>;
  voidCheckout: (id: string, approverToken?: string) => Promise<VoidCheckoutResultDTO>;
  resolveTableWarning: (
    openedAt?: string | null,
    nowMs?: number
  ) => TableWarningStatusDTO | null;
  clearOrderSelection: () => void;
  clearError: () => void;
}

export function useCashier(): UseCashierReturn {
  const cashierService = container.resolve<ICashierService>("cashierService");
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocation[]>(
    []
  );
  const [activeLocationId, setActiveLocationIdState] = useState("");
  const [isLocationsLoading, setIsLocationsLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [selectedOrderLines, setSelectedOrderLines] = useState<SalesOrderLine[]>([]);
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<OrderPayment[]>(
    []
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [discountReasons, setDiscountReasons] = useState<AdjustmentReason[]>([]);
  const [voidReasons, setVoidReasons] = useState<AdjustmentReason[]>([]);
  const [diningZones, setDiningZones] = useState<DiningZone[]>([]);
  const [diningTables, setDiningTables] = useState<DiningTable[]>([]);
  const [tableSessions, setTableSessions] = useState<TableSession[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [tipPools, setTipPools] = useState<TipPool[]>([]);
  const [tipPoolAllocations, setTipPoolAllocations] = useState<TipPoolAllocation[]>([]);
  const [variantsByProductId, setVariantsByProductId] = useState<
    Record<string, ProductVariant[]>
  >({});
  const [activeServiceType, setActiveServiceType] = useState<ServiceType>("TABLE");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * The service type each open order was started with on this till.
   *
   * A draft opened before the backend stored its service type reads back as
   * DINE_IN, which would move it off the pick-up tab. Remember the type the
   * till opened it with until the order is settled.
   */
  const openedServiceTypes = useRef<Map<string, ServiceType>>(
    readOpenedServiceTypes()
  );

  const withOpenedServiceType = useCallback((order: SalesOrder): SalesOrder => {
    const opened = openedServiceTypes.current.get(order.id);
    if (!opened || opened === order.serviceType) return order;
    return new SalesOrder({ ...order, serviceType: opened });
  }, []);

  const setActiveLocationId = useCallback((locationId: string) => {
    setActiveLocationIdState(locationId);
    const tenantId = inventoryLocations[0]?.tenantId;
    if (tenantId && locationId) {
      writeStoredActiveLocationId(tenantId, locationId);
    }
  }, [inventoryLocations]);

  const fetchInventoryLocations = useCallback(
    async (
      tenantId: string,
      options?: { ignoreStored?: boolean }
    ): Promise<string> => {
      if (!tenantId?.trim()) {
        setInventoryLocations([]);
        setActiveLocationIdState("");
        return "";
      }

      clearError();
      setIsLocationsLoading(true);
      try {
        const locations = await cashierService.getInventoryLocations();
        setInventoryLocations(locations);

        const storedId = options?.ignoreStored
          ? null
          : readStoredActiveLocationId(tenantId);
        const resolvedId =
          storedId && locations.some((location) => location.id === storedId)
            ? storedId
            : resolveActiveLocationId(tenantId, locations, {
                ignoreStored: options?.ignoreStored,
              });

        setActiveLocationIdState(resolvedId);
        return resolvedId;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch inventory locations";
        setError(message);
        throw err;
      } finally {
        setIsLocationsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchProducts = useCallback(
    async (params?: ProductFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const result = await cashierService.getProducts(params);
        setProducts(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch products";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchSalesOrders = useCallback(
    async (params?: SalesOrderFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const result = await cashierService.getSalesOrders(params);
        setSalesOrders(result.map(withOpenedServiceType));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch sales orders";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, withOpenedServiceType]
  );

  const clearOrderSelection = useCallback(() => {
    setSelectedOrder(null);
    setSelectedOrderLines([]);
    setSelectedOrderPayments([]);
  }, []);

  const selectOrder = useCallback(
    async (order: SalesOrder) => {
      setIsLoading(true);
      clearError();
      try {
        const knownOrder = withOpenedServiceType(order);
        setSelectedOrder(knownOrder);
        const [lines, payments] = await Promise.all([
          cashierService.getSalesOrderLines(knownOrder.id),
          cashierService.getOrderPayments(knownOrder.id),
        ]);
        setSelectedOrderLines(lines);
        setSelectedOrderPayments(payments);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, withOpenedServiceType]
  );

  const createOrder = useCallback(
    async (payload: CreateSalesOrderDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const order = await cashierService.createSalesOrder(payload);
        if (payload.serviceType) {
          openedServiceTypes.current.set(
            order.id,
            fromApiServiceType(toApiServiceType(payload.serviceType))
          );
          writeOpenedServiceTypes(openedServiceTypes.current);
        }
        const created = withOpenedServiceType(order);
        setSalesOrders((prev) => [created, ...prev]);
        await selectOrder(created);
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, selectOrder, withOpenedServiceType]
  );

  const ensureVariants = useCallback(
    async (productId: string) => {
      if (variantsByProductId[productId]?.length) return variantsByProductId[productId];
      const variants = await cashierService.getVariants(productId);
      setVariantsByProductId((prev) => ({ ...prev, [productId]: variants }));
      return variants;
    },
    [cashierService, variantsByProductId]
  );

  const fetchProductVariants = useCallback(
    async (productId: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await ensureVariants(productId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch product variants";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, ensureVariants]
  );

  /** One product, as the server keeps it: its options need not ride on the menu list. */
  const fetchProduct = useCallback(
    (productId: string) => cashierService.getProduct(productId),
    [cashierService]
  );

  const addProductToOrder = useCallback(
    async (
      orderId: string,
      product: Product,
      variantId?: string,
      quantity: number = 1,
      options?: {
        refreshLines?: boolean;
        modifiers?: ChosenModifier[];
        unitPrice?: string;
        hostessId?: string;
        note?: string;
      }
    ) => {
      setIsLoading(true);
      clearError();
      try {
        const variants = await ensureVariants(product.id);
        const selectedVariant =
          variants.find((variant) => variant.id === variantId) || variants[0];

        if (!selectedVariant?.id) {
          throw new Error(`No variant found for product ${product.name}`);
        }

        const variantModifier = Number(selectedVariant?.priceModifier || 0);
        const modifiers = options?.modifiers;
        const unitPrice = options?.unitPrice
          ? Number(options.unitPrice)
          : Number(product.basePrice || 0) + variantModifier + modifierExtra(modifiers);

        const createdLine = await cashierService.addSalesOrderLine(orderId, {
          variantId: selectedVariant.id,
          quantity: Math.max(1, quantity).toFixed(4),
          unitPrice: unitPrice.toFixed(4),
          lineDiscount: "0.0000",
          ...(modifiers?.length ? { selectedModifiers: modifiers } : {}),
          ...(options?.hostessId ? { hostessId: options.hostessId } : {}),
          ...(options?.note ? { note: options.note } : {}),
        });
        if (options?.refreshLines !== false) {
          const lines = await cashierService.getSalesOrderLines(orderId);
          setSelectedOrderLines(lines);
          return lines.find((line) => line.id === createdLine.id) || createdLine;
        }
        return createdLine;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add product";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, ensureVariants]
  );

  const updateOrderLine = useCallback(
    async (orderId: string, lineId: string, payload: UpdateSalesOrderLineDTO) => {
      setIsLoading(true);
      clearError();
      try {
        await cashierService.updateSalesOrderLine(orderId, lineId, payload);
        const lines = await cashierService.getSalesOrderLines(orderId);
        setSelectedOrderLines(lines);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update order line";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const splitOrderLine = useCallback(
    async (orderId: string, lineId: string, quantity: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.splitSalesOrderLine(orderId, lineId, quantity);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to split order line";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const removeOrderLine = useCallback(
    async (orderId: string, lineId: string) => {
      setIsLoading(true);
      clearError();
      try {
        await cashierService.deleteSalesOrderLine(orderId, lineId);
        const lines = await cashierService.getSalesOrderLines(orderId);
        setSelectedOrderLines(lines);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove order line";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const addPayment = useCallback(
    async (orderId: string, payload: CreateOrderPaymentDTO) => {
      setIsLoading(true);
      clearError();
      try {
        await cashierService.createOrderPayment(orderId, payload);
        const payments = await cashierService.getOrderPayments(orderId);
        setSelectedOrderPayments(payments);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add payment";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchPaymentMethods = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const methods = await cashierService.getPaymentMethods();
      setPaymentMethods(methods);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch payment methods";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cashierService, clearError]);

  const fetchPosRegisters = useCallback(
    async (params?: PosRegisterFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.getPosRegisters(params);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch POS registers";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const createPosRegister = useCallback(
    async (payload: CreatePosRegisterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.createPosRegister(payload);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create POS register";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchPosSessions = useCallback(
    async (params?: PosSessionFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.getPosSessions(params);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch POS sessions";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const createPosSession = useCallback(
    async (payload: CreatePosSessionDTO) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.createPosSession(payload);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create POS session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const closePosSession = useCallback(
    async (sessionId: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.closePosSession(sessionId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to close POS session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchDiscountReasons = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const reasons = await cashierService.getDiscountReasons(true);
      setDiscountReasons(reasons);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch discount reasons";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cashierService, clearError]);

  const fetchVoidReasons = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const reasons = await cashierService.getVoidReasons(true);
      setVoidReasons(reasons);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch void reasons";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cashierService, clearError]);

  const fetchWaitlist = useCallback(
    async (params?: WaitlistFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const entries = await cashierService.getWaitlist(params);
        setWaitlistEntries(entries);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch waitlist";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const createWaitlistEntry = useCallback(
    async (payload: CreateWaitlistEntryDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const entry = await cashierService.createWaitlistEntry(payload);
        setWaitlistEntries((prev) => [entry, ...prev]);
        return entry;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create waitlist entry";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const updateWaitlistEntry = useCallback(
    async (id: string, payload: UpdateWaitlistEntryDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.updateWaitlistEntry(id, payload);
        setWaitlistEntries((current) =>
          current.map((entry) => (entry.id === id ? updated : entry))
        );
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update waitlist entry";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const notifyWaitlistEntry = useCallback(
    async (id: string) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.notifyWaitlistEntry(id);
        setWaitlistEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to notify waitlist entry";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const seatWaitlistEntry = useCallback(
    async (id: string, payload: SeatWaitlistEntryDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.seatWaitlistEntry(id, payload);
        setWaitlistEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        const [tables, sessions] = await Promise.all([
          cashierService.getDiningTables({ page: 1, limit: 200 }),
          cashierService.getTableSessions({ page: 1, limit: 200 }),
        ]);
        setDiningTables(tables);
        setTableSessions(sessions);
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to seat waitlist entry";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const cancelWaitlistEntry = useCallback(
    async (id: string) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.cancelWaitlistEntry(id);
        setWaitlistEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel waitlist entry";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const noShowWaitlistEntry = useCallback(
    async (id: string) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.noShowWaitlistEntry(id);
        setWaitlistEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to mark waitlist no-show";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchTipPools = useCallback(
    async (params?: TipPoolFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const pools = await cashierService.getTipPools(params);
        setTipPools(pools);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch tip pools";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const getTipPoolById = useCallback(
    async (poolId: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.getTipPoolById(poolId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load tip pool";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const createTipPool = useCallback(
    async (payload: CreateTipPoolDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const pool = await cashierService.createTipPool(payload);
        setTipPools((prev) => [pool, ...prev]);
        return pool;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create tip pool";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const updateTipPool = useCallback(
    async (poolId: string, payload: UpdateTipPoolDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.updateTipPool(poolId, payload);
        setTipPools((current) =>
          current.map((pool) => (pool.id === poolId ? updated : pool))
        );
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update tip pool";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const distributeTipPool = useCallback(
    async (poolId: string) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.distributeTipPool(poolId);
        setTipPools((prev) => prev.map((p) => (p.id === poolId ? updated : p)));
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to distribute tip pool";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const settleTipPool = useCallback(
    async (poolId: string) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.settleTipPool(poolId);
        setTipPools((prev) => prev.map((p) => (p.id === poolId ? updated : p)));
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to settle tip pool";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchTipPoolAllocations = useCallback(
    async (poolId: string) => {
      setIsLoading(true);
      clearError();
      try {
        const allocations = await cashierService.getTipPoolAllocations(poolId);
        setTipPoolAllocations(allocations);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch tip allocations";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const createTipPoolAllocation = useCallback(
    async (poolId: string, payload: TipPoolAllocationDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const allocation = await cashierService.createTipPoolAllocation(
          poolId,
          payload
        );
        setTipPoolAllocations((current) => [...current, allocation]);
        return allocation;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create allocation";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const updateTipPoolAllocation = useCallback(
    async (
      poolId: string,
      allocationId: string,
      payload: Partial<TipPoolAllocationDTO>
    ) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.updateTipPoolAllocation(
          poolId,
          allocationId,
          payload
        );
        setTipPoolAllocations((current) =>
          current.map((allocation) =>
            allocation.id === allocationId ? updated : allocation
          )
        );
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update allocation";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const deleteTipPoolAllocation = useCallback(
    async (poolId: string, allocationId: string) => {
      setIsLoading(true);
      clearError();
      try {
        await cashierService.deleteTipPoolAllocation(poolId, allocationId);
        setTipPoolAllocations((current) =>
          current.filter((allocation) => allocation.id !== allocationId)
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete allocation";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchDiningZones = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const zones = await cashierService.getDiningZones();
      setDiningZones(zones);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch zones";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cashierService, clearError]);

  const fetchDiningTables = useCallback(
    async (params?: DiningTableFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const tables = await cashierService.getDiningTables(params);
        setDiningTables(tables);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch tables";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const fetchTableSessions = useCallback(
    async (params?: TableSessionFilterDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const sessions = await cashierService.getTableSessions(params);
        setTableSessions(sessions);
        return sessions;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch table sessions";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const refreshDiningTableStatus = useCallback(
    async (part: "tables" | "sessions" = "tables") => {
      try {
        if (part === "tables") {
          const tables = await cashierService.getDiningTables({
            page: 1,
            limit: 200,
          });
          setDiningTables(tables);
        } else {
          const sessions = await cashierService.getTableSessions({
            page: 1,
            limit: 200,
            sortBy: "openedAt",
            sortOrder: "desc",
          });
          setTableSessions(sessions);
        }
        return true;
      } catch {
        // Keep the last known floor state if a background refresh fails.
        return false;
      }
    },
    [cashierService]
  );

  const updateDiningTableStatus = useCallback(
    async (tableId: string, status: DiningTable["status"]) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.updateDiningTableStatus(tableId, status);
        setDiningTables((current) =>
          current.map((table) => (table.id === tableId ? updated : table))
        );
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update table status";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const updateTableSessionState = useCallback(
    async (sessionId: string, payload: UpdateTableSessionStateDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.updateTableSessionState(
          sessionId,
          payload
        );
        setTableSessions((current) =>
          current.map((session) => (session.id === sessionId ? updated : session))
        );
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update table session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const changeTableSeating = useCallback(
    async (sessionId: string, change: TableSeatingChangeDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const updated = await cashierService.changeTableSeating(sessionId, change);
        const [tables, sessions] = await Promise.all([
          cashierService.getDiningTables({ page: 1, limit: 200 }),
          cashierService.getTableSessions({
            page: 1,
            limit: 200,
            sortBy: "openedAt",
            sortOrder: "desc",
          }),
        ]);
        setDiningTables(tables);
        setTableSessions(sessions);
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to change the table";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const selectOrderById = useCallback(
    async (orderId: string) => {
      setIsLoading(true);
      clearError();
      try {
        const order = withOpenedServiceType(
          await cashierService.getSalesOrderById(orderId)
        );
        await selectOrder(order);
        return order;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, selectOrder, withOpenedServiceType]
  );

  const openTableSession = useCallback(
    async (payload: OpenTableSessionDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const session = await cashierService.openTableSession(payload);
        setTableSessions((prev) => [session, ...prev]);
        setDiningTables((current) =>
          current.map((table) =>
            table.id === payload.tableId
              ? new DiningTable({ ...table, status: "OCCUPIED" })
              : table
          )
        );
        if (session.salesOrderId) {
          await selectOrderById(session.salesOrderId);
        }
        return session;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to open table session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, selectOrderById]
  );

  const checkoutTableSession = useCallback(
    async (sessionId: string, payload: TableSessionCheckoutDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const session = await cashierService.checkoutTableSession(sessionId, payload);
        const [tables, sessions] = await Promise.all([
          cashierService.getDiningTables({ page: 1, limit: 200 }),
          cashierService.getTableSessions({ page: 1, limit: 200 }),
        ]);
        setDiningTables(tables);
        setTableSessions(sessions);
        clearOrderSelection();
        return session;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to checkout table session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, clearOrderSelection]
  );

  const fireToKds = useCallback(
    async (payload: FireKdsDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const result = await cashierService.fireToKds(payload);
        const orderId =
          payload.salesOrderId ||
          tableSessions.find((session) => session.id === payload.sessionId)
            ?.salesOrderId;
        if (orderId && selectedOrder?.id === orderId) {
          const lines = await cashierService.getSalesOrderLines(orderId);
          setSelectedOrderLines(lines);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fire to KDS";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, selectedOrder?.id, tableSessions]
  );

  const getLatestSessionByTableId = useCallback(
    (tableId: string) => {
      return (
        findOpenTableSession(tableSessions, tableId) ||
        tableSessions
          .filter((session) => session.tableId === tableId)
          .sort(
            (a, b) =>
              new Date(b.openedAt || 0).getTime() -
              new Date(a.openedAt || 0).getTime()
          )[0]
      );
    },
    [tableSessions]
  );

  const addProductToTableSession = useCallback(
    async (
      sessionId: string,
      product: Product,
      variantId?: string,
      quantity: number = 1,
      keepSelectedOrderId?: string,
      modifiers?: ChosenModifier[],
      priceOverride?: string,
      hostessId?: string,
      note?: string
    ) => {
      setIsLoading(true);
      clearError();
      try {
        const variants = await ensureVariants(product.id);
        const selectedVariant =
          variants.find((variant) => variant.id === variantId) || variants[0];

        if (!selectedVariant?.id) {
          throw new Error(`No variant found for product ${product.name}`);
        }

        const variantModifier = Number(selectedVariant?.priceModifier || 0);
        const unitPrice = priceOverride
          ? Number(priceOverride)
          : Number(product.basePrice || 0) + variantModifier + modifierExtra(modifiers);

        const line = await cashierService.addTableSessionLine(sessionId, {
          variantId: selectedVariant.id,
          quantity: Math.max(1, quantity).toFixed(4),
          unitPrice: unitPrice.toFixed(4),
          lineDiscount: "0.0000",
          ...(modifiers?.length ? { selectedModifiers: modifiers } : {}),
          ...(hostessId ? { hostessId } : {}),
          ...(note ? { note } : {}),
        });

        if (keepSelectedOrderId && keepSelectedOrderId !== line.salesOrderId) {
          return line;
        }

        setSelectedOrderLines((current) => {
          const index = current.findIndex((item) => item.id === line.id);
          if (index >= 0) {
            const next = current.slice();
            next[index] = line;
            return next;
          }
          return [...current, line];
        });

        return line;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add product to table";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, ensureVariants]
  );

  /**
   * Puts an extra fee (a container, delivery) on an open bill or a table's bill,
   * at the amount and name the cashier chose. A fee is never merged with another.
   */
  const addExtraFeeLine = useCallback(
    async (
      target: { orderId: string } | { sessionId: string },
      fee: ChosenFee,
      keepSelectedOrderId?: string
    ) => {
      setIsLoading(true);
      clearError();
      try {
        const payload = {
          variantId: fee.variantId,
          quantity: Math.max(1, fee.quantity).toFixed(4),
          unitPrice: Math.max(0, fee.unitPrice).toFixed(4),
          lineDiscount: "0.0000",
          name: fee.name,
        };
        if ("orderId" in target) {
          const created = await cashierService.addSalesOrderLine(target.orderId, payload);
          const lines = await cashierService.getSalesOrderLines(target.orderId);
          setSelectedOrderLines(lines);
          return lines.find((line) => line.id === created.id) || created;
        }
        const added = await cashierService.addTableSessionLine(target.sessionId, payload);
        const line = Object.assign(added, { productName: added.productName || fee.name });
        if (!keepSelectedOrderId || keepSelectedOrderId === line.salesOrderId) {
          setSelectedOrderLines((current) => [
            ...current.filter((item) => item.id !== line.id),
            line,
          ]);
        }
        return line;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add the fee";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const pickupCounterOrder = useCallback(
    async (counterOrderId: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.pickupCounterOrder(counterOrderId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to mark order picked up";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const getCounterOrderById = useCallback(
    async (counterOrderId: string) => {
      setIsLoading(true);
      clearError();
      try {
        return await cashierService.getCounterOrderById(counterOrderId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load counter order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError]
  );

  const listKdsTickets = useCallback(
    async (params?: KdsTicketFilterDTO) => {
      clearError();
      try {
        return await cashierService.listKdsTickets(params);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load KDS tickets";
        setError(message);
        throw err;
      }
    },
    [cashierService, clearError]
  );

  const getKdsTicketById = useCallback(
    async (ticketId: string) => {
      clearError();
      try {
        return await cashierService.getKdsTicketById(ticketId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load KDS ticket";
        setError(message);
        throw err;
      }
    },
    [cashierService, clearError]
  );

  const processCheckout = useCallback(
    async (payload: CheckoutRequestDTO) => {
      setIsLoading(true);
      clearError();
      try {
        const result = await cashierService.checkout(payload);
        await fetchSalesOrders({ page: 1, limit: 100 });
        clearOrderSelection();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Checkout failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, clearOrderSelection, fetchSalesOrders]
  );

  const voidCheckout = useCallback(
    async (id: string, approverToken?: string) => {
      setIsLoading(true);
      clearError();
      try {
        const result = await cashierService.voidCheckout(id, approverToken);
        await fetchSalesOrders({ page: 1, limit: 100 });
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to cancel order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashierService, clearError, fetchSalesOrders]
  );

  const resolveTableWarning = useCallback(
    (openedAt?: string | null, nowMs?: number) =>
      cashierService.getTableWarningStatus(openedAt, nowMs),
    [cashierService]
  );

  const value = useMemo(
    () => ({
      products,
      inventoryLocations,
      activeLocationId,
      setActiveLocationId,
      salesOrders,
      selectedOrder,
      selectedOrderLines,
      selectedOrderPayments,
      paymentMethods,
      discountReasons,
      voidReasons,
      diningZones,
      diningTables,
      tableSessions,
      waitlistEntries,
      tipPools,
      tipPoolAllocations,
      variantsByProductId,
      activeServiceType,
      setActiveServiceType,
      isLoading,
      isLocationsLoading,
      error,
      fetchInventoryLocations,
      fetchProducts,
      fetchProduct,
      fetchProductVariants,
      fetchSalesOrders,
      fetchPaymentMethods,
      fetchPosRegisters,
      createPosRegister,
      fetchPosSessions,
      createPosSession,
      closePosSession,
      fetchDiscountReasons,
      fetchVoidReasons,
      fetchDiningZones,
      fetchDiningTables,
      fetchTableSessions,
      refreshDiningTableStatus,
      updateDiningTableStatus,
      updateTableSessionState,
      changeTableSeating,
      fetchWaitlist,
      createWaitlistEntry,
      updateWaitlistEntry,
      notifyWaitlistEntry,
      seatWaitlistEntry,
      cancelWaitlistEntry,
      noShowWaitlistEntry,
      fetchTipPools,
      getTipPoolById,
      createTipPool,
      updateTipPool,
      distributeTipPool,
      settleTipPool,
      fetchTipPoolAllocations,
      createTipPoolAllocation,
      updateTipPoolAllocation,
      deleteTipPoolAllocation,
      openTableSession,
      checkoutTableSession,
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
      getCounterOrderById,
      pickupCounterOrder,
      listKdsTickets,
      getKdsTicketById,
      addPayment,
      processCheckout,
      voidCheckout,
      resolveTableWarning,
      clearOrderSelection,
      clearError,
    }),
    [
      products,
      inventoryLocations,
      activeLocationId,
      setActiveLocationId,
      salesOrders,
      selectedOrder,
      selectedOrderLines,
      selectedOrderPayments,
      paymentMethods,
      discountReasons,
      voidReasons,
      diningZones,
      diningTables,
      tableSessions,
      waitlistEntries,
      tipPools,
      tipPoolAllocations,
      variantsByProductId,
      activeServiceType,
      isLoading,
      isLocationsLoading,
      error,
      fetchInventoryLocations,
      fetchProducts,
      fetchProduct,
      fetchProductVariants,
      fetchSalesOrders,
      fetchPaymentMethods,
      fetchPosRegisters,
      createPosRegister,
      fetchPosSessions,
      createPosSession,
      closePosSession,
      fetchDiscountReasons,
      fetchVoidReasons,
      fetchDiningZones,
      fetchDiningTables,
      fetchTableSessions,
      refreshDiningTableStatus,
      updateDiningTableStatus,
      updateTableSessionState,
      changeTableSeating,
      fetchWaitlist,
      createWaitlistEntry,
      updateWaitlistEntry,
      notifyWaitlistEntry,
      seatWaitlistEntry,
      cancelWaitlistEntry,
      noShowWaitlistEntry,
      fetchTipPools,
      getTipPoolById,
      createTipPool,
      updateTipPool,
      distributeTipPool,
      settleTipPool,
      fetchTipPoolAllocations,
      createTipPoolAllocation,
      updateTipPoolAllocation,
      deleteTipPoolAllocation,
      openTableSession,
      checkoutTableSession,
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
      getCounterOrderById,
      pickupCounterOrder,
      listKdsTickets,
      getKdsTicketById,
      addPayment,
      processCheckout,
      voidCheckout,
      resolveTableWarning,
      clearOrderSelection,
      clearError,
    ]
  );

  return value;
}
