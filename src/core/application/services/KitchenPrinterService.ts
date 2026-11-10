import {
  CreateKitchenPrinterDTO,
  KitchenPrinterFilterDTO,
  KitchenPrinterListDTO,
  UpdateKitchenPrinterDTO,
} from "../dtos/KitchenPrinterDTO";
import { KitchenPrinter } from "../../domain/entities/KitchenPrinter";
import { IKitchenPrinterRepository } from "../../domain/repositories/IKitchenPrinterRepository";
import { IKitchenPrinterService } from "../../domain/services/IKitchenPrinterService";

export class KitchenPrinterService implements IKitchenPrinterService {
  constructor(private repository: IKitchenPrinterRepository) {}

  list(params?: KitchenPrinterFilterDTO): Promise<KitchenPrinterListDTO> {
    return this.repository.list(params);
  }

  getById(id: string): Promise<KitchenPrinter> {
    if (!id.trim()) throw new Error("Printer ID is required");
    return this.repository.getById(id);
  }

  create(payload: CreateKitchenPrinterDTO): Promise<KitchenPrinter> {
    if (!payload.tenantId.trim() || !payload.locationId.trim()) {
      throw new Error("Tenant and location are required");
    }
    if (!payload.name.trim()) {
      throw new Error("Printer name is required");
    }
    if (!payload.sectors.length) {
      throw new Error("At least one printer sector is required");
    }
    if (!Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535) {
      throw new Error("Printer port must be between 1 and 65535");
    }
    const ipAddress = payload.ipAddress?.trim();
    return this.repository.create({
      tenantId: payload.tenantId,
      locationId: payload.locationId,
      name: payload.name.trim(),
      port: payload.port,
      sectors: Array.from(new Set(payload.sectors)),
      printsFor: Array.from(new Set(payload.printsFor || [])),
      isActive: payload.isActive,
      ...(ipAddress ? { ipAddress } : {}),
    });
  }

  update(id: string, payload: UpdateKitchenPrinterDTO): Promise<KitchenPrinter> {
    if (!id.trim()) throw new Error("Printer ID is required");
    if (payload.sectors && !payload.sectors.length) {
      throw new Error("At least one printer sector is required");
    }
    return this.repository.update(id, {
      ...payload,
      sectors: payload.sectors
        ? Array.from(new Set(payload.sectors))
        : undefined,
      printsFor: payload.printsFor
        ? Array.from(new Set(payload.printsFor))
        : undefined,
      ipAddress: payload.ipAddress?.trim() || undefined,
    });
  }

  delete(id: string): Promise<KitchenPrinter> {
    if (!id.trim()) throw new Error("Printer ID is required");
    return this.repository.delete(id);
  }

  attachCategory(id: string, categoryId: string): Promise<void> {
    if (!id.trim() || !categoryId.trim()) {
      throw new Error("Printer and category IDs are required");
    }
    return this.repository.attachCategory(id, categoryId);
  }

  detachCategory(id: string, categoryId: string): Promise<void> {
    if (!id.trim() || !categoryId.trim()) {
      throw new Error("Printer and category IDs are required");
    }
    return this.repository.detachCategory(id, categoryId);
  }
}
