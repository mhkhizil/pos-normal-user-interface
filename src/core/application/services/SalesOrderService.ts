import { ISalesOrderRepository } from "../../domain/repositories/ISalesOrderRepository";
import { ISalesOrderService } from "../../domain/services/ISalesOrderService";
import {
  CompSalesOrderLineDTO,
  CreateSalesOrderDTO,
  SalesOrderFilterDTO,
  SalesOrderLineListResponseDTO,
  SalesOrderListResponseDTO,
  UpdateSalesOrderDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
  SettleSalesOrderDTO,
  SettleSalesOrderResultDTO,
  VoidSalesOrderLineDTO,
} from "../dtos/SalesOrderDTO";
import { SalesOrder, SalesOrderLine } from "../../domain/entities/Cashier";

export class SalesOrderService implements ISalesOrderService {
  constructor(private readonly salesOrderRepository: ISalesOrderRepository) {}

  async getSalesOrders(
    params?: SalesOrderFilterDTO
  ): Promise<SalesOrderListResponseDTO> {
    return this.salesOrderRepository.getSalesOrders(params);
  }

  async getSalesOrderById(id: string): Promise<SalesOrder> {
    if (!id?.trim()) throw new Error("Sales order ID is required");
    return this.salesOrderRepository.getSalesOrderById(id);
  }

  async createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder> {
    if (!payload.tenantId?.trim()) throw new Error("Tenant ID is required");
    if (!payload.locationId?.trim()) throw new Error("Location ID is required");
    return this.salesOrderRepository.createSalesOrder(payload);
  }

  async updateSalesOrder(
    id: string,
    payload: UpdateSalesOrderDTO
  ): Promise<SalesOrder> {
    if (!id?.trim()) throw new Error("Sales order ID is required");
    return this.salesOrderRepository.updateSalesOrder(id, payload);
  }

  async deleteSalesOrder(id: string): Promise<SalesOrder> {
    if (!id?.trim()) throw new Error("Sales order ID is required");
    return this.salesOrderRepository.deleteSalesOrder(id);
  }

  async settleSalesOrder(
    id: string,
    payload: SettleSalesOrderDTO
  ): Promise<SettleSalesOrderResultDTO> {
    if (!id?.trim()) throw new Error("Sales order ID is required");
    if (!payload.payments.length) throw new Error("At least one payment is required");
    return this.salesOrderRepository.settleSalesOrder(id, payload);
  }

  async getSalesOrderLines(
    salesOrderId: string,
    params?: SalesOrderFilterDTO
  ): Promise<SalesOrderLineListResponseDTO> {
    if (!salesOrderId?.trim()) throw new Error("Sales order ID is required");
    return this.salesOrderRepository.getSalesOrderLines(salesOrderId, params);
  }

  async getSalesOrderLineById(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.getSalesOrderLineById(salesOrderId, lineId);
  }

  async addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim()) throw new Error("Sales order ID is required");
    if (!payload.variantId?.trim()) throw new Error("Variant ID is required");
    return this.salesOrderRepository.addSalesOrderLine(salesOrderId, payload);
  }

  async updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.updateSalesOrderLine(
      salesOrderId,
      lineId,
      payload
    );
  }

  async deleteSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.deleteSalesOrderLine(salesOrderId, lineId);
  }

  async fireSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.fireSalesOrderLine(salesOrderId, lineId);
  }

  async readySalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.readySalesOrderLine(salesOrderId, lineId);
  }

  async serveSalesOrderLine(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    return this.salesOrderRepository.serveSalesOrderLine(salesOrderId, lineId);
  }

  async voidSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: VoidSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    if (!payload.voidReasonId?.trim()) {
      throw new Error("Void reason ID is required");
    }
    return this.salesOrderRepository.voidSalesOrderLine(
      salesOrderId,
      lineId,
      payload
    );
  }

  async compSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: CompSalesOrderLineDTO
  ): Promise<SalesOrderLine> {
    if (!salesOrderId?.trim() || !lineId?.trim()) {
      throw new Error("Sales order line ID is required");
    }
    if (!payload.compReasonId?.trim()) {
      throw new Error("Comp reason ID is required");
    }
    return this.salesOrderRepository.compSalesOrderLine(
      salesOrderId,
      lineId,
      payload
    );
  }
}
