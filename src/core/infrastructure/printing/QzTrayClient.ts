import qz from "qz-tray";
import { KdsTicket } from "../../domain/entities/Cashier";
import { PrinterBinding } from "@/lib/pos/printerBindingStorage";
import {
  formatKdsTicket,
  formatKitchenSlip,
  formatPrinterTest,
  formatSaleReceipt,
  KitchenSlip,
  SaleReceipt,
} from "@/lib/printing/formatKdsTicket";

const qzError = (caught: unknown): Error => {
  const message = caught instanceof Error ? caught.message : String(caught || "");
  if (/block|denied|reject|not allowed/i.test(message)) {
    return new Error(
      "QZ Tray blocked this site. Click Allow on the QZ Tray prompt, then try again."
    );
  }
  if (
    /ECONNREFUSED|Unable to establish connection|WebSocket connection failed|Connection closed before/i.test(
      message
    )
  ) {
    return new Error(
      "QZ Tray is not running. Install and open QZ Tray, then try again."
    );
  }
  return new Error(message || "Printer communication failed");
};

export class QzTrayClient {
  private connecting: Promise<void> | null = null;

  isConnected(): boolean {
    return qz.websocket.isActive();
  }

  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = qz.websocket
      .connect({
        host: "localhost",
        retries: 5,
        delay: 1,
        usingSecure: window.location.protocol === "https:",
      })
      .catch((caught: unknown) => {
        throw qzError(caught);
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  async disconnect(): Promise<void> {
    if (this.isConnected()) await qz.websocket.disconnect();
  }

  async findPrinters(): Promise<string[]> {
    await this.connect();
    try {
      const result = await qz.printers.find();
      return Array.isArray(result) ? result : result ? [result] : [];
    } catch (caught) {
      throw qzError(caught);
    }
  }

  private config(binding: PrinterBinding): unknown {
    if (binding.transport === "NETWORK") {
      if (!binding.host || !binding.port) {
        throw new Error("Network printer IP address and port are required");
      }
      return qz.configs.create({ host: binding.host, port: binding.port });
    }
    if (!binding.deviceName) {
      throw new Error("Select an installed printer");
    }
    return qz.configs.create(binding.deviceName);
  }

  private async printRaw(binding: PrinterBinding, data: string): Promise<void> {
    await this.connect();
    try {
      await qz.print(this.config(binding), [
        { type: "raw", format: "command", data },
      ]);
    } catch (caught) {
      throw qzError(caught);
    }
  }

  testPrint(binding: PrinterBinding): Promise<void> {
    return this.printRaw(binding, formatPrinterTest(binding.displayName));
  }

  printKdsTicket(binding: PrinterBinding, ticket: KdsTicket): Promise<void> {
    return this.printRaw(binding, formatKdsTicket(ticket));
  }

  printKitchen(binding: PrinterBinding, slip: KitchenSlip): Promise<void> {
    return this.printRaw(binding, formatKitchenSlip(slip));
  }

  printReceipt(binding: PrinterBinding, receipt: SaleReceipt): Promise<void> {
    return this.printRaw(binding, formatSaleReceipt(receipt));
  }
}

export const qzTrayClient = new QzTrayClient();
