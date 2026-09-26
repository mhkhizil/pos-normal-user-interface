import type { OrderStatus } from "./CashierDTO";
import type {
  CreateSalesOrderDTO,
  SalesOrderFilterDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
} from "./CashierDTO";
import { SalesOrder, SalesOrderLine } from "../../domain/entities/Cashier";

export type {
  CreateSalesOrderDTO,
  SalesOrderFilterDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
};

export interface SalesOrderListResponseDTO {
  orders: SalesOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SalesOrderLineListResponseDTO {
  lines: SalesOrderLine[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UpdateSalesOrderDTO {
  tenantId?: string;
  customerId?: string;
  locationId?: string;
  orderNumber?: string;
  salesChannel?: string;
  idempotencyKey?: string;
  subtotal?: string;
  totalDiscount?: string;
  totalTax?: string;
  grandTotal?: string;
  status?: OrderStatus;
}

export interface SettlePaymentDTO {
  paymentMethodId: string;
  amount?: string;
  guestCardId?: string;
  tipAmount?: string;
  transactionReference?: string;
}

export interface SettleSalesOrderDTO {
  payments: SettlePaymentDTO[];
  customerId?: string;
  posSessionId?: string;
  tipAmount?: string;
  serviceCharge?: string;
  idempotencyKey?: string;
}

export interface SettleSalesOrderResultDTO {
  orderId: string;
  orderNumber: string;
  grandTotal: string;
  totalPaid: string;
  change: string;
  status: string;
}

export interface VoidSalesOrderLineDTO {
  voidReasonId: string;
  notes?: string;
}

export interface CompSalesOrderLineDTO {
  compReasonId: string;
  notes?: string;
}
