import type { PosKind } from "./Shift";

export type PrinterSector = "KDS" | "CHECKOUT" | "FINANCE";

export const PRINTER_SECTORS: PrinterSector[] = ["CHECKOUT", "FINANCE", "KDS"];

/**
 * The area of the venue a printer serves. A KTV till prints its guest slip on
 * the KTV counter printer, never on the bar's, so the areas a printer is set up
 * for decide who prints what.
 */
export type PrinterArea = PosKind;

export const PRINTER_AREAS: PrinterArea[] = ["BAR", "KTV", "SPA"];

export interface PrinterCategoryRoute {
  printerId: string;
  categoryId: string;
  category?: {
    id: string;
    name: string;
  };
}

export class KitchenPrinter {
  id!: string;
  tenantId!: string;
  locationId!: string;
  name!: string;
  ipAddress?: string;
  port!: number;
  sectors!: PrinterSector[];
  /** POS areas it prints for; empty means every area, as it does for sectors. */
  printsFor!: PrinterArea[];
  isActive!: boolean;
  categories!: PrinterCategoryRoute[];
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  constructor(data: Partial<KitchenPrinter>) {
    Object.assign(this, { sectors: [], printsFor: [], categories: [], ...data });
  }
}
