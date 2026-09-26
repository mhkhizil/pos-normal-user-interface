import {
  CompSalesOrderLineDTO,
  CreateSalesOrderDTO,
  SalesOrderFilterDTO,
  SalesOrderLineListResponseDTO,
  SalesOrderListResponseDTO,
  UpdateSalesOrderDTO,
  UpdateSalesOrderLineDTO,
  UpsertSalesOrderLineDTO,
  VoidSalesOrderLineDTO,
  SettleSalesOrderDTO,
  SettleSalesOrderResultDTO,
} from "../../application/dtos/SalesOrderDTO";
import { SalesOrder, SalesOrderLine } from "../entities/Cashier";

export interface ISalesOrderService {
  getSalesOrders(params?: SalesOrderFilterDTO): Promise<SalesOrderListResponseDTO>;
  getSalesOrderById(id: string): Promise<SalesOrder>;
  createSalesOrder(payload: CreateSalesOrderDTO): Promise<SalesOrder>;
  updateSalesOrder(id: string, payload: UpdateSalesOrderDTO): Promise<SalesOrder>;
  deleteSalesOrder(id: string): Promise<SalesOrder>;
  settleSalesOrder(
    id: string,
    payload: SettleSalesOrderDTO
  ): Promise<SettleSalesOrderResultDTO>;
  getSalesOrderLines(
    salesOrderId: string,
    params?: SalesOrderFilterDTO
  ): Promise<SalesOrderLineListResponseDTO>;
  getSalesOrderLineById(
    salesOrderId: string,
    lineId: string
  ): Promise<SalesOrderLine>;
  addSalesOrderLine(
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  updateSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  deleteSalesOrderLine(salesOrderId: string, lineId: string): Promise<SalesOrderLine>;
  fireSalesOrderLine(salesOrderId: string, lineId: string): Promise<SalesOrderLine>;
  readySalesOrderLine(salesOrderId: string, lineId: string): Promise<SalesOrderLine>;
  serveSalesOrderLine(salesOrderId: string, lineId: string): Promise<SalesOrderLine>;
  voidSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: VoidSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
  compSalesOrderLine(
    salesOrderId: string,
    lineId: string,
    payload: CompSalesOrderLineDTO
  ): Promise<SalesOrderLine>;
}
