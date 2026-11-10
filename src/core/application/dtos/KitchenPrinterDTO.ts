import {
  KitchenPrinter,
  PrinterArea,
  PrinterSector,
} from "../../domain/entities/KitchenPrinter";

export interface CreateKitchenPrinterDTO {
  tenantId: string;
  locationId: string;
  name: string;
  ipAddress?: string;
  port: number;
  sectors: PrinterSector[];
  printsFor?: PrinterArea[];
  isActive: boolean;
}

export interface UpdateKitchenPrinterDTO {
  locationId?: string;
  name?: string;
  ipAddress?: string;
  port?: number;
  sectors?: PrinterSector[];
  printsFor?: PrinterArea[];
  isActive?: boolean;
}

export interface KitchenPrinterFilterDTO {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  locationId?: string;
  sector?: PrinterSector;
  /** Only the printers that serve this area of the venue. */
  area?: PrinterArea;
}

export interface KitchenPrinterListDTO {
  printers: KitchenPrinter[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
