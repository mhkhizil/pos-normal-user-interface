import { useCallback, useState } from "react";
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
} from "../../application/dtos/SalesOrderDTO";
import { SalesOrder, SalesOrderLine } from "../../domain/entities/Cashier";
import { ISalesOrderService } from "../../domain/services/ISalesOrderService";
import container from "../../infrastructure/di/container";

interface UseSalesOrderManagementReturn {
  orders: SalesOrder[];
  totalOrders: number;
  page: number;
  limit: number;
  totalPages: number;
  selectedOrder: SalesOrder | null;
  orderLines: SalesOrderLine[];
  isLoading: boolean;
  error: string | null;
  fetchOrders: (params?: SalesOrderFilterDTO) => Promise<SalesOrderListResponseDTO>;
  fetchOrderById: (id: string) => Promise<SalesOrder>;
  createOrder: (payload: CreateSalesOrderDTO) => Promise<SalesOrder>;
  updateOrder: (id: string, payload: UpdateSalesOrderDTO) => Promise<SalesOrder>;
  deleteOrder: (id: string) => Promise<SalesOrder>;
  settleOrder: (
    id: string,
    payload: SettleSalesOrderDTO
  ) => Promise<SettleSalesOrderResultDTO>;
  fetchOrderLines: (
    salesOrderId: string,
    params?: SalesOrderFilterDTO
  ) => Promise<SalesOrderLineListResponseDTO>;
  addOrderLine: (
    salesOrderId: string,
    payload: UpsertSalesOrderLineDTO
  ) => Promise<SalesOrderLine>;
  updateOrderLine: (
    salesOrderId: string,
    lineId: string,
    payload: UpdateSalesOrderLineDTO
  ) => Promise<SalesOrderLine>;
  deleteOrderLine: (salesOrderId: string, lineId: string) => Promise<SalesOrderLine>;
  fireOrderLine: (salesOrderId: string, lineId: string) => Promise<SalesOrderLine>;
  readyOrderLine: (salesOrderId: string, lineId: string) => Promise<SalesOrderLine>;
  serveOrderLine: (salesOrderId: string, lineId: string) => Promise<SalesOrderLine>;
  voidOrderLine: (
    salesOrderId: string,
    lineId: string,
    payload: VoidSalesOrderLineDTO
  ) => Promise<SalesOrderLine>;
  compOrderLine: (
    salesOrderId: string,
    lineId: string,
    payload: CompSalesOrderLineDTO
  ) => Promise<SalesOrderLine>;
  clearSelectedOrder: () => void;
  clearError: () => void;
}

export function useSalesOrderManagement(): UseSalesOrderManagementReturn {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [orderLines, setOrderLines] = useState<SalesOrderLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salesOrderService =
    container.resolve<ISalesOrderService>("salesOrderService");

  const applyOrderList = (result: SalesOrderListResponseDTO) => {
    setOrders(result.orders);
    setTotalOrders(result.total);
    setPage(result.page);
    setLimit(result.limit);
    setTotalPages(result.totalPages);
  };

  const clearError = useCallback(() => setError(null), []);

  const clearSelectedOrder = useCallback(() => {
    setSelectedOrder(null);
    setOrderLines([]);
  }, []);

  const fetchOrders = useCallback(
    async (params?: SalesOrderFilterDTO) => {
      try {
        setIsLoading(true);
        clearError();
        const result = await salesOrderService.getSalesOrders(params);
        applyOrderList(result);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch sales orders";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const fetchOrderById = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        clearError();
        const order = await salesOrderService.getSalesOrderById(id);
        setSelectedOrder(order);
        return order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch sales order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const createOrder = useCallback(
    async (payload: CreateSalesOrderDTO) => {
      try {
        setIsLoading(true);
        clearError();
        const order = await salesOrderService.createSalesOrder(payload);
        setOrders((current) => [order, ...current]);
        setTotalOrders((current) => current + 1);
        setSelectedOrder(order);
        return order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create sales order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const updateOrder = useCallback(
    async (id: string, payload: UpdateSalesOrderDTO) => {
      try {
        setIsLoading(true);
        clearError();
        const order = await salesOrderService.updateSalesOrder(id, payload);
        setOrders((current) =>
          current.map((entry) => (entry.id === order.id ? order : entry))
        );
        setSelectedOrder((current) => (current?.id === order.id ? order : current));
        return order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update sales order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const settleOrder = useCallback(
    async (id: string, payload: SettleSalesOrderDTO) => {
      try {
        setIsLoading(true);
        clearError();
        return await salesOrderService.settleSalesOrder(id, payload);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to settle sales order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const deleteOrder = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        clearError();
        const order = await salesOrderService.deleteSalesOrder(id);
        setOrders((current) => current.filter((entry) => entry.id !== id));
        setTotalOrders((current) => Math.max(0, current - 1));
        setSelectedOrder((current) => (current?.id === id ? null : current));
        setOrderLines((current) =>
          selectedOrder?.id === id ? [] : current
        );
        return order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete sales order";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService, selectedOrder?.id]
  );

  const fetchOrderLines = useCallback(
    async (salesOrderId: string, params?: SalesOrderFilterDTO) => {
      try {
        setIsLoading(true);
        clearError();
        const result = await salesOrderService.getSalesOrderLines(
          salesOrderId,
          params
        );
        setOrderLines(result.lines);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch order lines";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError, salesOrderService]
  );

  const mutateLine = useCallback(
    async (action: () => Promise<SalesOrderLine>): Promise<SalesOrderLine> => {
      try {
        setIsLoading(true);
        clearError();
        const line = await action();
        setOrderLines((current) =>
          current.map((entry) => (entry.id === line.id ? line : entry))
        );
        return line;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update order line";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearError]
  );

  const addOrderLine = useCallback(
    async (salesOrderId: string, payload: UpsertSalesOrderLineDTO) =>
      mutateLine(() =>
        salesOrderService.addSalesOrderLine(salesOrderId, payload)
      ).then((line) => {
        setOrderLines((current) => [...current, line]);
        return line;
      }),
    [mutateLine, salesOrderService]
  );

  const updateOrderLine = useCallback(
    async (
      salesOrderId: string,
      lineId: string,
      payload: UpdateSalesOrderLineDTO
    ) =>
      mutateLine(() =>
        salesOrderService.updateSalesOrderLine(salesOrderId, lineId, payload)
      ),
    [mutateLine, salesOrderService]
  );

  const deleteOrderLine = useCallback(
    async (salesOrderId: string, lineId: string) =>
      mutateLine(() =>
        salesOrderService.deleteSalesOrderLine(salesOrderId, lineId)
      ).then((line) => {
        setOrderLines((current) => current.filter((entry) => entry.id !== lineId));
        return line;
      }),
    [mutateLine, salesOrderService]
  );

  const fireOrderLine = useCallback(
    async (salesOrderId: string, lineId: string) =>
      mutateLine(() =>
        salesOrderService.fireSalesOrderLine(salesOrderId, lineId)
      ),
    [mutateLine, salesOrderService]
  );

  const readyOrderLine = useCallback(
    async (salesOrderId: string, lineId: string) =>
      mutateLine(() =>
        salesOrderService.readySalesOrderLine(salesOrderId, lineId)
      ),
    [mutateLine, salesOrderService]
  );

  const serveOrderLine = useCallback(
    async (salesOrderId: string, lineId: string) =>
      mutateLine(() =>
        salesOrderService.serveSalesOrderLine(salesOrderId, lineId)
      ),
    [mutateLine, salesOrderService]
  );

  const voidOrderLine = useCallback(
    async (
      salesOrderId: string,
      lineId: string,
      payload: VoidSalesOrderLineDTO
    ) =>
      mutateLine(() =>
        salesOrderService.voidSalesOrderLine(salesOrderId, lineId, payload)
      ),
    [mutateLine, salesOrderService]
  );

  const compOrderLine = useCallback(
    async (
      salesOrderId: string,
      lineId: string,
      payload: CompSalesOrderLineDTO
    ) =>
      mutateLine(() =>
        salesOrderService.compSalesOrderLine(salesOrderId, lineId, payload)
      ),
    [mutateLine, salesOrderService]
  );

  return {
    orders,
    totalOrders,
    page,
    limit,
    totalPages,
    selectedOrder,
    orderLines,
    isLoading,
    error,
    fetchOrders,
    fetchOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    settleOrder,
    fetchOrderLines,
    addOrderLine,
    updateOrderLine,
    deleteOrderLine,
    fireOrderLine,
    readyOrderLine,
    serveOrderLine,
    voidOrderLine,
    compOrderLine,
    clearSelectedOrder,
    clearError,
  };
}
