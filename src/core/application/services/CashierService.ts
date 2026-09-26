import { ICashierRepository } from "../../domain/repositories/ICashierRepository";
import { ICashierService } from "../../domain/services/ICashierService";
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
  toApiServiceType,
  UpdateTableSessionStateDTO,
  UpdateTipPoolDTO,
  UpdateSalesOrderLineDTO,
  UpdateWaitlistEntryDTO,
  UpsertSalesOrderLineDTO,
  VoidCheckoutResultDTO,
  WaitlistFilterDTO,
  TableWarningPolicyDTO,
  TableWarningStatusDTO,
} from "../dtos/CashierDTO";
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
} from "../../domain/entities/Cashier";
import { PosPaymentCatalog } from "./PosPaymentCatalog";
import { TableWarningPolicy } from "./TableWarningPolicy";

export class CashierService implements ICashierService {
  constructor(private readonly cashierRepository: ICashierRepository) {}

  async getInventoryLocations(): Promise<InventoryLocation[]> {
    return this.cashierRepository.getInventoryLocations();
  }

  async getProducts(params?: ProductFilterDTO): Promise<Product[]> {
    return this.cashierRepository.getProducts(params);
  }

  async getVariants(productId: string): Promise<ProductVariant[]> {
    if (!productId?.trim()) {
      throw new Error("Product ID is required");
    }
    return this.cashierRepository.getVariants(productId);
  }

  async getSalesOrders(params?: SalesOrderFilterDTO): Promise<SalesOrder[]> {
    return this.cashierRepository.getSalesOrders(params);
  }

  async getSalesOrderById(id: string): Promise<SalesOrder> {
    if (!id?.trim()) {
      throw new Error("Sales order ID is required");
    }
    return this.cashierRepository.getSalesOrderById(id);
  }

  async createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder> {
    if (!payload.tenantId?.trim()) {
      throw new Error("Tenant ID is required");
    }
    if (!payload.locationId?.trim()) {
      throw new Error("Location ID is required");
    }

    return this.cashierRepository.createSalesOrder(payload);
  }

  async addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    if (!payload.variantId?.trim()) {
      throw new Error("Variant ID is required");
    }

    return this.cashierRepository.addSalesOrderLine(salesOrderId, payload);
  }

  async updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    if (!lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    if (!payload.quantity && !payload.variantId) {
      throw new Error("At least one line field is required");
    }

    return this.cashierRepository.updateSalesOrderLine(salesOrderId, lineId, payload);
  }

  async deleteSalesOrderLine(salesOrderId: string, lineId: string): Promise<void> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    if (!lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.cashierRepository.deleteSalesOrderLine(salesOrderId, lineId);
  }

  async getSalesOrderLines(salesOrderId: string): Promise<SalesOrderLine[]> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    return this.cashierRepository.getSalesOrderLines(salesOrderId);
  }

  async createOrderPayment(
    salesOrderId: string,
    payload: CreateOrderPaymentDTO
  ): Promise<OrderPayment> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    if (!payload.paymentMethodId?.trim()) {
      throw new Error("Payment method is required");
    }
    if (!payload.tenantId?.trim()) {
      throw new Error("Tenant ID is required");
    }
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    return this.cashierRepository.createOrderPayment(salesOrderId, payload);
  }

  async getOrderPayments(salesOrderId: string): Promise<OrderPayment[]> {
    if (!salesOrderId?.trim()) {
      throw new Error("Sales order ID is required");
    }
    return this.cashierRepository.getOrderPayments(salesOrderId);
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const methods = await this.cashierRepository.getPaymentMethods();
    return PosPaymentCatalog.withMemberCard(methods);
  }

  getTableWarningStatus(
    openedAt?: string | null,
    nowMs: number = Date.now(),
    policy?: TableWarningPolicyDTO
  ): TableWarningStatusDTO | null {
    return TableWarningPolicy.resolve(openedAt, nowMs, policy);
  }

  async getPosRegisters(params?: PosRegisterFilterDTO): Promise<PosRegister[]> {
    return this.cashierRepository.getPosRegisters(params);
  }

  async createPosRegister(payload: CreatePosRegisterDTO): Promise<PosRegister> {
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.locationId?.trim()) throw new Error("Location ID is required");
    if (!payload.code?.trim()) throw new Error("Register code is required");
    if (!payload.name?.trim()) throw new Error("Register name is required");
    return this.cashierRepository.createPosRegister(payload);
  }

  async getPosSessions(params?: PosSessionFilterDTO): Promise<PosSession[]> {
    return this.cashierRepository.getPosSessions(params);
  }

  async createPosSession(payload: CreatePosSessionDTO): Promise<PosSession> {
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.registerId?.trim()) throw new Error("Register ID is required");
    if (!payload.cashierId?.trim()) throw new Error("Cashier ID is required");
    if (!payload.openingCashFloat?.trim()) {
      throw new Error("Opening cash float is required");
    }
    return this.cashierRepository.createPosSession(payload);
  }

  async closePosSession(sessionId: string): Promise<PosSession> {
    if (!sessionId?.trim()) throw new Error("POS session ID is required");
    return this.cashierRepository.closePosSession(sessionId);
  }

  async getDiningZones(): Promise<DiningZone[]> {
    return this.cashierRepository.getDiningZones();
  }

  async getDiningTables(params?: DiningTableFilterDTO): Promise<DiningTable[]> {
    return this.cashierRepository.getDiningTables(params);
  }

  async updateDiningTableStatus(
    tableId: string,
    status: DiningTable["status"]
  ): Promise<DiningTable> {
    if (!tableId?.trim()) {
      throw new Error("Table ID is required");
    }
    return this.cashierRepository.updateDiningTableStatus(tableId, status);
  }

  async getTableSessions(params?: TableSessionFilterDTO): Promise<TableSession[]> {
    return this.cashierRepository.getTableSessions(params);
  }

  async openTableSession(payload: OpenTableSessionDTO): Promise<TableSession> {
    if (!payload.tableId?.trim()) throw new Error("Table ID is required");
    if (!payload.locationId?.trim()) throw new Error("Location ID is required");
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.guestCount || payload.guestCount < 1) {
      throw new Error("Guest count must be greater than zero");
    }
    return this.cashierRepository.openTableSession(payload);
  }

  async updateTableSessionState(
    sessionId: string,
    payload: UpdateTableSessionStateDTO
  ): Promise<TableSession> {
    if (!sessionId?.trim()) throw new Error("Session ID is required");
    return this.cashierRepository.updateTableSessionState(sessionId, payload);
  }

  async addTableSessionLine(
    sessionId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!sessionId?.trim()) throw new Error("Session ID is required");
    if (!payload.variantId?.trim()) throw new Error("Variant ID is required");
    return this.cashierRepository.addTableSessionLine(sessionId, payload);
  }

  async checkoutTableSession(
    sessionId: string,
    payload: TableSessionCheckoutDTO
  ): Promise<TableSession> {
    if (!sessionId?.trim()) throw new Error("Session ID is required");
    if (!payload.payments.length) {
      throw new Error("At least one payment is required");
    }
    if (
      payload.payments.some(
        (payment) =>
          !payment.paymentMethodId?.trim() ||
          !Number.isFinite(Number(payment.amount)) ||
          Number(payment.amount) <= 0
      )
    ) {
      throw new Error("Every payment requires a method and positive amount");
    }
    const methods = await this.getPaymentMethods();
    PosPaymentCatalog.assertNoLocalFallbackPayments(payload.payments, methods);
    PosPaymentCatalog.assertGuestCardPayments(payload.payments, methods);
    return this.cashierRepository.checkoutTableSession(sessionId, payload);
  }

  async fireToKds(payload: FireKdsDTO): Promise<Record<string, unknown>> {
    if (!payload.sessionId && !payload.salesOrderId) {
      throw new Error("sessionId or salesOrderId is required");
    }
    return this.cashierRepository.fireToKds(payload);
  }

  async getDiscountReasons(activeOnly: boolean = true): Promise<AdjustmentReason[]> {
    return this.cashierRepository.getDiscountReasons(activeOnly);
  }

  async getVoidReasons(activeOnly: boolean = true): Promise<AdjustmentReason[]> {
    return this.cashierRepository.getVoidReasons(activeOnly);
  }

  async getWaitlist(params?: WaitlistFilterDTO): Promise<WaitlistEntry[]> {
    return this.cashierRepository.getWaitlist(params);
  }

  async createWaitlistEntry(payload: CreateWaitlistEntryDTO): Promise<WaitlistEntry> {
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.locationId?.trim()) throw new Error("Location ID is required");
    if (!payload.guestName?.trim()) throw new Error("Guest name is required");
    if (!payload.guestPhone?.trim()) throw new Error("Guest phone is required");
    if (!payload.partySize || payload.partySize < 1) {
      throw new Error("Party size must be at least 1");
    }
    return this.cashierRepository.createWaitlistEntry(payload);
  }

  async updateWaitlistEntry(
    id: string,
    payload: UpdateWaitlistEntryDTO
  ): Promise<WaitlistEntry> {
    if (!id?.trim()) throw new Error("Waitlist ID is required");
    if (payload.partySize !== undefined && payload.partySize < 1) {
      throw new Error("Party size must be at least 1");
    }
    return this.cashierRepository.updateWaitlistEntry(id, payload);
  }

  async notifyWaitlistEntry(id: string): Promise<WaitlistEntry> {
    if (!id?.trim()) throw new Error("Waitlist ID is required");
    return this.cashierRepository.notifyWaitlistEntry(id);
  }

  async seatWaitlistEntry(
    id: string,
    payload: SeatWaitlistEntryDTO
  ): Promise<WaitlistEntry> {
    if (!id?.trim()) throw new Error("Waitlist ID is required");
    if (!payload.tableId?.trim()) throw new Error("Table ID is required");
    if (!payload.guestCount || payload.guestCount < 1) {
      throw new Error("Guest count must be at least 1");
    }
    return this.cashierRepository.seatWaitlistEntry(id, payload);
  }

  async cancelWaitlistEntry(id: string): Promise<WaitlistEntry> {
    if (!id?.trim()) throw new Error("Waitlist ID is required");
    return this.cashierRepository.cancelWaitlistEntry(id);
  }

  async noShowWaitlistEntry(id: string): Promise<WaitlistEntry> {
    if (!id?.trim()) throw new Error("Waitlist ID is required");
    return this.cashierRepository.noShowWaitlistEntry(id);
  }

  async getTipPools(params?: TipPoolFilterDTO): Promise<TipPool[]> {
    return this.cashierRepository.getTipPools(params);
  }

  async getTipPoolById(id: string): Promise<TipPool> {
    if (!id?.trim()) throw new Error("Tip pool ID is required");
    return this.cashierRepository.getTipPoolById(id);
  }

  async createTipPool(payload: CreateTipPoolDTO): Promise<TipPool> {
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.locationId?.trim()) throw new Error("Location ID is required");
    if (!payload.name?.trim()) throw new Error("Pool name is required");
    if (!payload.periodStart || !payload.periodEnd) {
      throw new Error("Pool period is required");
    }
    if (new Date(payload.periodEnd) <= new Date(payload.periodStart)) {
      throw new Error("Pool end must be after its start");
    }
    return this.cashierRepository.createTipPool(payload);
  }

  async updateTipPool(id: string, payload: UpdateTipPoolDTO): Promise<TipPool> {
    if (!id?.trim()) throw new Error("Tip pool ID is required");
    if (
      payload.periodStart &&
      payload.periodEnd &&
      new Date(payload.periodEnd) <= new Date(payload.periodStart)
    ) {
      throw new Error("Pool end must be after its start");
    }
    return this.cashierRepository.updateTipPool(id, payload);
  }

  async distributeTipPool(id: string): Promise<TipPool> {
    if (!id?.trim()) throw new Error("Tip pool ID is required");
    return this.cashierRepository.distributeTipPool(id);
  }

  async settleTipPool(id: string): Promise<TipPool> {
    if (!id?.trim()) throw new Error("Tip pool ID is required");
    return this.cashierRepository.settleTipPool(id);
  }

  async getTipPoolAllocations(poolId: string): Promise<TipPoolAllocation[]> {
    if (!poolId?.trim()) throw new Error("Tip pool ID is required");
    return this.cashierRepository.getTipPoolAllocations(poolId);
  }

  async createTipPoolAllocation(
    poolId: string,
    payload: TipPoolAllocationDTO
  ): Promise<TipPoolAllocation> {
    if (!poolId?.trim()) throw new Error("Tip pool ID is required");
    if (!payload.userId?.trim()) throw new Error("A valid staff member is required");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.userId.trim()
      )
    ) {
      throw new Error("A valid staff member is required");
    }
    if (!payload.role?.trim()) throw new Error("Allocation role is required");
    const values = [payload.hoursWorked, payload.weight, payload.amount].filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );
    if (!values.length || values.some((value) => value < 0)) {
      throw new Error("Allocation requires a non-negative value");
    }
    if (!values.some((value) => value > 0)) {
      throw new Error("At least one allocation value must be greater than zero");
    }
    return this.cashierRepository.createTipPoolAllocation(poolId, payload);
  }

  async updateTipPoolAllocation(
    poolId: string,
    allocationId: string,
    payload: Partial<TipPoolAllocationDTO>
  ): Promise<TipPoolAllocation> {
    if (!poolId?.trim()) throw new Error("Tip pool ID is required");
    if (!allocationId?.trim()) throw new Error("Allocation ID is required");
    const values = [payload.hoursWorked, payload.weight, payload.amount].filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );
    if (values.some((value) => value < 0)) {
      throw new Error("Allocation values cannot be negative");
    }
    return this.cashierRepository.updateTipPoolAllocation(
      poolId,
      allocationId,
      payload
    );
  }

  async deleteTipPoolAllocation(poolId: string, allocationId: string): Promise<void> {
    if (!poolId?.trim()) throw new Error("Tip pool ID is required");
    if (!allocationId?.trim()) throw new Error("Allocation ID is required");
    return this.cashierRepository.deleteTipPoolAllocation(poolId, allocationId);
  }

  async getCounterOrderById(id: string): Promise<CounterOrderDetail> {
    if (!id?.trim()) throw new Error("Counter order ID is required");
    return this.cashierRepository.getCounterOrderById(id);
  }

  async pickupCounterOrder(id: string): Promise<SalesOrder | null> {
    if (!id?.trim()) throw new Error("Counter order ID is required");
    return this.cashierRepository.pickupCounterOrder(id);
  }

  async listKdsTickets(
    params?: KdsTicketFilterDTO
  ): Promise<KdsTicketListDTO & { tickets: KdsTicket[] }> {
    return this.cashierRepository.listKdsTickets(params);
  }

  async getKdsTicketById(id: string): Promise<KdsTicket> {
    if (!id?.trim()) throw new Error("KDS ticket ID is required");
    return this.cashierRepository.getKdsTicketById(id);
  }

  async startKdsTicket(id: string): Promise<KdsTicket> {
    if (!id?.trim()) throw new Error("Ticket ID is required");
    return this.cashierRepository.startKdsTicket(id);
  }

  async readyKdsTicket(id: string): Promise<KdsTicket> {
    if (!id?.trim()) throw new Error("Ticket ID is required");
    return this.cashierRepository.readyKdsTicket(id);
  }

  async checkout(payload: CheckoutRequestDTO): Promise<Record<string, unknown>> {
    if (!payload.tenantId?.trim()) {
      throw new Error("Tenant ID is required");
    }
    if (!payload.locationId?.trim()) {
      throw new Error("Location ID is required");
    }
    if (!payload.items.length) {
      throw new Error("At least one item is required");
    }
    if (!payload.payments.length) {
      throw new Error("At least one payment is required");
    }
    if (
      payload.payments.some(
        (payment) =>
          !payment.paymentMethodId?.trim() ||
          !Number.isFinite(Number(payment.amount)) ||
          Number(payment.amount) <= 0
      )
    ) {
      throw new Error("Every payment requires a method and positive amount");
    }

    const methods = await this.getPaymentMethods();
    PosPaymentCatalog.assertNoLocalFallbackPayments(payload.payments, methods);
    PosPaymentCatalog.assertGuestCardPayments(payload.payments, methods);

    return this.cashierRepository.checkout({
      ...payload,
      serviceType: toApiServiceType(payload.serviceType),
    });
  }

  async voidCheckout(id: string): Promise<VoidCheckoutResultDTO> {
    if (!id?.trim()) {
      throw new Error("Checkout ID is required");
    }
    return this.cashierRepository.voidCheckout(id.trim());
  }
}
