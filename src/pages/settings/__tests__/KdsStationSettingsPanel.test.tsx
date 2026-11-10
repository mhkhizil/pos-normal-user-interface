import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KdsStationSettingsPanel } from "../KdsStationSettingsPanel";

const mocks = vi.hoisted(() => ({
  createStation: vi.fn(),
  updateStation: vi.fn(),
  deleteStation: vi.fn(),
  stations: [] as Array<{
    id: string;
    name: string;
    displayColor?: string;
    printerIds: string[];
    routingRules: { categoryIds: string[] };
  }>,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) =>
    values?.station ? `${key}:${values.station}` : key }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({ user: { tenantId: "tenant-1" } }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({ activeLocationId: "location-1" }),
}));

vi.mock("@/core/presentation/hooks/useCategoryManagement", () => ({
  useCategoryManagement: () => ({
    categories: [
      { id: "drink", name: "Drink" },
      { id: "rice", name: "Rice" },
    ],
    listCategories: vi.fn().mockResolvedValue({ categories: [] }),
  }),
}));

vi.mock("@/core/presentation/hooks/useKitchenPrinterManagement", () => ({
  useKitchenPrinterManagement: () => ({
    printers: [
      { id: "printer-drink", name: "Drink printer", sectors: ["KDS"] },
      { id: "printer-food", name: "Food printer", sectors: ["KDS"] },
      { id: "printer-checkout", name: "Checkout printer", sectors: ["CHECKOUT"] },
    ],
    listPrinters: vi.fn().mockResolvedValue({ printers: [] }),
  }),
}));

vi.mock("@/core/presentation/hooks/useKdsStationManagement", () => ({
  useKdsStationManagement: () => ({
    stations: mocks.stations,
    isLoading: false,
    error: null,
    listStations: vi.fn().mockResolvedValue({ stations: [] }),
    createStation: mocks.createStation,
    updateStation: mocks.updateStation,
    deleteStation: mocks.deleteStation,
  }),
}));

describe("KdsStationSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stations = [];
    mocks.createStation.mockResolvedValue({ id: "station-1" });
  });

  it("saves every selected printer on the KDS station", async () => {
    render(<KdsStationSettingsPanel />);

    fireEvent.change(screen.getByLabelText("settings.kdsStation.name"), {
      target: { value: "Kitchen" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Drink printer" })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Food printer" })
    );
    expect(
      screen.queryByRole("checkbox", { name: "Checkout printer" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Drink" }));
    fireEvent.click(
      screen.getByRole("button", { name: "settings.kdsStation.save" })
    );

    await waitFor(() =>
      expect(mocks.createStation).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        locationId: "location-1",
        name: "Kitchen",
        displayColor: "#2563eb",
        printerIds: ["printer-drink", "printer-food"],
        routingRules: { categoryIds: ["drink"] },
      })
    );
  });

  it("will not save a station that carries no category", async () => {
    render(<KdsStationSettingsPanel />);

    fireEvent.change(screen.getByLabelText("settings.kdsStation.name"), {
      target: { value: "Kitchen" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Drink printer" }));

    const save = screen.getByRole("button", { name: "settings.kdsStation.save" });
    // A station with no category would receive nothing, so it cannot be saved.
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form") as HTMLFormElement);

    expect(mocks.createStation).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("settings.kdsStation.categoriesRequired").length
    ).toBeGreaterThan(0);
  });

  it("lets a category another station has be picked too, and says where else it is", () => {
    mocks.stations = [
      {
        id: "station-bar",
        name: "Bar",
        printerIds: ["printer-drink"],
        routingRules: { categoryIds: ["drink"] },
      },
    ];

    render(<KdsStationSettingsPanel />);

    const shared = screen
      .getAllByRole("checkbox")
      .find((checkbox) =>
        checkbox.parentElement?.textContent?.includes("settings.kdsStation.assignedTo:Bar")
      );
    expect(shared).toBeDefined();
    expect(shared).toBeEnabled();
  });
});
