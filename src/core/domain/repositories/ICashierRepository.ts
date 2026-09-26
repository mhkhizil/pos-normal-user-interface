import {
  CheckoutRequestDTO,
  CreateOrderPaymentDTO,
  CreateSalesOrderDTO,
  CreateTipPoolDTO,
  CreateWaitlistEntryDTO,
  DiningTableFilterDTO,
  FireKdsDTO,
  KdsTicketFilterDTO,
  KdsTicketListDTO,
  OpenTableSessionDTO,
  PosRegisterFilterDTO,
  PosSessionFilterDTO,
  ProductFilterDTO,
  SalesOrderFilterDTO,
  SeatWaitlistEntryDTO,
  TableSessionCheckoutDTO,
  TableSessionFilterDTO,
  CreatePosRegisterDTO,
  CreatePosSessionDTO,
  TipPoolAllocationDTO,
  TipPoolFilterDTO,
  UpdateTableSessionStateDTO,
  UpdateTipPoolDTO,
  UpdateWaitlistEntryDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
  VoidCheckoutResultDTO,
  WaitlistFilterDTO,
} from "../../application/dtos/CashierDTO";
import {
  AdjustmentReason,
  DiningTable,
  DiningZone,
  InventoryLocation,
  OrderPayment,
  PaymentMethod,
  PosRegister,
  PosSession,
  Product,
  ProductVariant,
  SalesOrder,
  SalesOrderLine,
  KdsTicket,
  TableSession,
  TipPool,
  TipPoolAllocation,
  WaitlistEntry,
  CounterOrderDetail,
} from "../entities/Cashier";

export interface ICashierRepository {
  getInventoryLocations(): Promise<InventoryLocation[]>;
  getProducts(params?: ProductFilterDTO): Promise<Product[]>;
  getVariants(productId: string): Promise<ProductVariant[]>;
  getSalesOrders(params?: SalesOrderFilterDTO): Promise<SalesOrder[]>;
  getSalesOrderById(id: string): Promise<SalesOrder>;
  createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder>;
  addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  deleteSalesOrderLine(salesOrderId: string, lineId: string): Promise<void>;
  getSalesOrderLines(salesOrderId: string): Promise<SalesOrderLine[]>;
  createOrderPayment(
    salesOrderId: string,
    payload: CreateOrderPaymentDTO
  ): Promise<OrderPayment>;
  getOrderPayments(salesOrderId: string): Promise<OrderPayment[]>;
  getPaymentMethods(): Promise<PaymentMethod[]>;
  getPosRegisters(params?: PosRegisterFilterDTO): Promise<PosRegister[]>;
  createPosRegister(payload: CreatePosRegisterDTO): Promise<PosRegister>;
  getPosSessions(params?: PosSessionFilterDTO): Promise<PosSession[]>;
  createPosSession(payload: CreatePosSessionDTO): Promise<PosSession>;
  closePosSession(sessionId: string): Promise<PosSession>;
  getDiningZones(): Promise<DiningZone[]>;
  getDiningTables(params?: DiningTableFilterDTO): Promise<DiningTable[]>;
  updateDiningTableStatus(
    tableId: string,
    status: DiningTable["status"]
  ): Promise<DiningTable>;
  getTableSessions(params?: TableSessionFilterDTO): Promise<TableSession[]>;
  openTableSession(payload: OpenTableSessionDTO): Promise<TableSession>;
  updateTableSessionState(
    sessionId: string,
    payload: UpdateTableSessionStateDTO
  ): Promise<TableSession>;
  addTableSessionLine(
    sessionId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  checkoutTableSession(
    sessionId: string,
    payload: TableSessionCheckoutDTO
  ): Promise<TableSession>;
  fireToKds(payload: FireKdsDTO): Promise<Record<string, unknown>>;
  getDiscountReasons(activeOnly?: boolean): Promise<AdjustmentReason[]>;
  getVoidReasons(activeOnly?: boolean): Promise<AdjustmentReason[]>;
  getWaitlist(params?: WaitlistFilterDTO): Promise<WaitlistEntry[]>;
  createWaitlistEntry(payload: CreateWaitlistEntryDTO): Promise<WaitlistEntry>;
  updateWaitlistEntry(
    id: string,
    payload: UpdateWaitlistEntryDTO
  ): Promise<WaitlistEntry>;
  notifyWaitlistEntry(id: string): Promise<WaitlistEntry>;
  seatWaitlistEntry(id: string, payload: SeatWaitlistEntryDTO): Promise<WaitlistEntry>;
  cancelWaitlistEntry(id: string): Promise<WaitlistEntry>;
  noShowWaitlistEntry(id: string): Promise<WaitlistEntry>;
  getTipPools(params?: TipPoolFilterDTO): Promise<TipPool[]>;
  getTipPoolById(id: string): Promise<TipPool>;
  createTipPool(payload: CreateTipPoolDTO): Promise<TipPool>;
  updateTipPool(id: string, payload: UpdateTipPoolDTO): Promise<TipPool>;
  distributeTipPool(id: string): Promise<TipPool>;
  settleTipPool(id: string): Promise<TipPool>;
  getTipPoolAllocations(poolId: string): Promise<TipPoolAllocation[]>;
  createTipPoolAllocation(
    poolId: string,
    payload: TipPoolAllocationDTO
  ): Promise<TipPoolAllocation>;
  updateTipPoolAllocation(
    poolId: string,
    allocationId: string,
    payload: Partial<TipPoolAllocationDTO>
  ): Promise<TipPoolAllocation>;
  deleteTipPoolAllocation(poolId: string, allocationId: string): Promise<void>;
  getCounterOrderById(id: string): Promise<CounterOrderDetail>;
  pickupCounterOrder(id: string): Promise<SalesOrder | null>;
  listKdsTickets(
    params?: KdsTicketFilterDTO
  ): Promise<KdsTicketListDTO & { tickets: KdsTicket[] }>;
  getKdsTicketById(id: string): Promise<KdsTicket>;
  startKdsTicket(id: string): Promise<KdsTicket>;
  readyKdsTicket(id: string): Promise<KdsTicket>;
  checkout(payload: CheckoutRequestDTO): Promise<Record<string, unknown>>;
  voidCheckout(id: string): Promise<VoidCheckoutResultDTO>;
}
