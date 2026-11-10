import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  printers: [] as Record<string, unknown>[],
  stations: [] as Record<string, unknown>[],
  listPrinters: vi.fn(),
  listStations: vi.fn(),
  createPrinter: vi.fn(),
  updatePrinter: vi.fn(),
  deletePrinter: vi.fn(),
  updateStation: vi.fn(),
  discover: vi.fn(),
  verify: vi.fn(),
  saveBinding: vi.fn(),
  removeBinding: vi.fn(),
  bindings: [] as Record<string, unknown>[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({ user: { tenantId: "tenant-1" } }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({
    activeLocationId: "location-1",
    activePosRegisterId: "register-1",
  }),
}));

vi.mock("@/core/presentation/hooks/useKitchenPrinterManagement", () => ({
  useKitchenPrinterManagement: () => ({
    printers: mocks.printers,
    isLoading: false,
    error: null,
    listPrinters: mocks.listPrinters,
    createPrinter: mocks.createPrinter,
    updatePrinter: mocks.updatePrinter,
    deletePrinter: mocks.deletePrinter,
  }),
}));

vi.mock("@/core/presentation/hooks/useKdsStationManagement", () => ({
  useKdsStationManagement: () => ({
    stations: mocks.stations,
    isLoading: false,
    error: null,
    listStations: mocks.listStations,
    updateStation: mocks.updateStation,
  }),
}));

vi.mock("@/core/presentation/hooks/usePrinterConnection", () => ({
  usePrinterConnection: () => ({
    nativeBridge: false,
    isConnected: true,
    isConnecting: false,
    error: null,
    bindings: mocks.bindings,
    defaultBinding: null,
    connect: vi.fn(),
    discover: mocks.discover,
    verify: mocks.verify,
    saveBinding: mocks.saveBinding,
    removeBinding: mocks.removeBinding,
    makeDefault: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("@/core/infrastructure/printing/PrinterClient", () => ({
  isBrowserPrinting: () => false,
}));

import { PrinterSettingsPanel } from "../PrinterSettingsPanel";

const bar = {
  id: "printer-bar",
  name: "Bar",
  ipAddress: "192.168.201.92",
  port: 9100,
  sectors: ["KDS"],
  isActive: true,
};
const cashier = {
  id: "printer-cashier",
  name: "Cashier",
  ipAddress: "192.168.201.91",
  port: 9100,
  sectors: ["CHECKOUT"],
  printsFor: ["BAR"],
  isActive: true,
};
const barStation = {
  id: "station-bar",
  name: "BarStation",
  printerIds: ["printer-bar"],
  routingRules: { categoryIds: ["drink"] },
};

const saveButton = () =>
  screen.getByRole("button", { name: "settings.printer.save" });

beforeEach(() => {
  localStorage.clear();
  mocks.printers = [bar];
  mocks.stations = [];
  mocks.bindings = [];
  for (const fn of [
    mocks.listPrinters,
    mocks.listStations,
    mocks.createPrinter,
    mocks.updatePrinter,
    mocks.deletePrinter,
    mocks.updateStation,
    mocks.discover,
    mocks.verify,
    mocks.saveBinding,
    mocks.removeBinding,
  ]) {
    fn.mockReset();
  }
  mocks.listPrinters.mockResolvedValue({ printers: mocks.printers });
  mocks.listStations.mockResolvedValue({ stations: mocks.stations });
  mocks.updatePrinter.mockResolvedValue(bar);
  mocks.createPrinter.mockResolvedValue(bar);
});

describe("PrinterSettingsPanel save", () => {
  // The station list loads after the printer is picked, so the checkbox mirror
  // is still empty when Save runs. Sending that empty list is what used to strip
  // the printer from every station and stop the kitchen printing everywhere.
  it("keeps a printer's stations when the operator never touched them", async () => {
    const { rerender } = render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Bar/ }));

    mocks.stations = [barStation];
    rerender(<PrinterSettingsPanel />);

    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.updatePrinter).toHaveBeenCalled());

    expect(mocks.updateStation).not.toHaveBeenCalled();
  });

  it("does not write this device's reachability into the shared printer record", async () => {
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Bar/ }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.updatePrinter).toHaveBeenCalled());
    const [id, payload] = mocks.updatePrinter.mock.calls[0];
    expect(id).toBe("printer-bar");
    expect(payload).not.toHaveProperty("isActive");
    expect(payload.sectors).toEqual(["KDS"]);
  });

  // A failed test print used to delete the printer from this till, so the device
  // kept printing yesterday's configuration until it was saved again.
  it("saves the printer on this device even when its test print fails", async () => {
    mocks.verify.mockRejectedValue(new Error("Printer is offline"));
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Bar/ }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.saveBinding).toHaveBeenCalled());
    const [binding] = mocks.saveBinding.mock.calls[0];
    expect(binding.backendPrinterId).toBe("printer-bar");
    expect(binding.sectors).toEqual(["KDS"]);
    expect(binding.host).toBe("192.168.201.92");
    expect(mocks.removeBinding).not.toHaveBeenCalled();
  });

  // A slip belongs to a part of the venue, so a printer that prints slips says
  // which ones; a kitchen printer prints tickets for its stations instead.
  it("offers the places a slip printer prints for", () => {
    mocks.printers = [cashier];
    mocks.updatePrinter.mockResolvedValue(cashier);
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Cashier/ }));

    expect(
      screen.getByRole("checkbox", { name: "settings.printer.areaBar" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "settings.printer.areaKtv" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "settings.printer.areaSpa" })
    ).not.toBeChecked();
  });

  it("offers no places for a kitchen printer", () => {
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Bar/ }));

    expect(
      screen.queryByRole("checkbox", { name: "settings.printer.areaKtv" })
    ).not.toBeInTheDocument();
  });

  it("saves the places the operator chose", async () => {
    mocks.printers = [cashier];
    mocks.updatePrinter.mockResolvedValue(cashier);
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Cashier/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "settings.printer.areaKtv" })
    );
    fireEvent.click(saveButton());

    await waitFor(() => expect(mocks.updatePrinter).toHaveBeenCalled());
    const [, payload] = mocks.updatePrinter.mock.calls[0];
    expect(payload.printsFor).toEqual(["BAR", "KTV"]);
    expect(payload.sectors).toEqual(["CHECKOUT"]);
  });

  it("will not save a slip printer with no place ticked", async () => {
    mocks.printers = [cashier];
    render(<PrinterSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Cashier/ }));

    // The Cashier is ticked CHECKOUT and prints the Bar's slips; untick the place.
    fireEvent.click(
      screen.getByRole("checkbox", { name: "settings.printer.areaBar" })
    );
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(
        screen.getAllByText("settings.printer.placesRequired").length
      ).toBeGreaterThan(0)
    );
    expect(mocks.updatePrinter).not.toHaveBeenCalled();
  });
});
