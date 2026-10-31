import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintTemplateSettingsPanel } from "../PrintTemplateSettingsPanel";

const createTemplate = vi.fn();
const saveKdsDeleteSlip = vi.fn();

vi.mock("@/core/presentation/hooks/useKdsDeleteSlipShopSetting", () => ({
  useKdsDeleteSlipShopSetting: () => ({
    canWrite: true,
    enabled: true,
    isSaving: false,
    error: null,
    save: saveKdsDeleteSlip,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "settings.printTemplate.contact": "Phone",
        "settings.printTemplate.email": "Email",
        "settings.printTemplate.logo": "Logo",
        "settings.printTemplate.deleteSlip.title": "KDS delete slip",
        "settings.printTemplate.deleteSlip.description": "KDS delete slip description",
        "settings.printTemplate.deleteSlip.saving": "Saving…",
      };
      return labels[key] || key;
    },
  }),
}));

vi.mock("@/core/presentation/hooks/usePosWorkspace", () => ({
  usePosWorkspace: () => ({ activeLocationId: "location-1" }),
}));

vi.mock("@/core/presentation/hooks/useAuth", () => ({
  useAuth: () => ({ user: { tenantId: "tenant-1" } }),
}));

vi.mock("@/core/presentation/hooks/useVenueSetting", () => ({
  useVenueSetting: () => ({ currency: "MMK" }),
}));

vi.mock("@/core/presentation/hooks/usePrinterConnection", () => ({
  printCompanyFor: () =>
    Promise.resolve({ name: "Grand Spa", phone: "09 123", email: "hello@grandspa.com" }),
}));

vi.mock("@/core/presentation/hooks/usePrintTemplateManagement", () => ({
  usePrintTemplateManagement: () => ({
    templates: [],
    isLoading: false,
    error: null,
    listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    createTemplate,
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  }),
}));

describe("PrintTemplateSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a receipt template for the current branch", async () => {
    createTemplate.mockResolvedValue({ id: "template-1" });
    render(<PrintTemplateSettingsPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: "settings.printTemplate.save" })
    );

    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RECEIPT",
        name: "Default receipt",
        locationId: "location-1",
        paperWidth: "MM80",
        isDefault: true,
      })
    );
  });

  it("creates a finance template as its own type", async () => {
    createTemplate.mockResolvedValue({ id: "template-finance" });
    render(<PrintTemplateSettingsPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: /settings.printTemplate.placeFinanceHint/ })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings.printTemplate.save" })
    );

    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FINANCE",
        name: "Default finance",
        locationId: "location-1",
        isDefault: true,
      })
    );
  });

  it("previews the receipt with the code that prints it", async () => {
    render(<PrintTemplateSettingsPanel />);
    const preview = screen.getByTestId("slip-preview");

    expect(await screen.findByText("GRAND SPA")).toBeInTheDocument();
    expect(preview).toHaveTextContent("53,675");
    expect(preview).toHaveTextContent("+ Extra egg (+500)");
    expect(preview).toHaveTextContent("Cashier Aung Aung");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "settings.printTemplate.cashier" })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "settings.printTemplate.modifiers" })
    );
    expect(preview).not.toHaveTextContent("Aung Aung");
    expect(preview).not.toHaveTextContent("Extra egg");
  });

  it("narrows the preview to the paper width", () => {
    render(<PrintTemplateSettingsPanel />);
    const preview = screen.getByTestId("slip-preview");
    expect(preview.style.width).toContain("48ch");

    fireEvent.change(screen.getByLabelText("settings.printTemplate.paperWidth"), {
      target: { value: "MM58" },
    });
    expect(screen.getByTestId("slip-preview").style.width).toContain("32ch");
  });

  it("previews a kitchen ticket for a kitchen template", () => {
    render(<PrintTemplateSettingsPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /settings.printTemplate.placeKdsHint/ })
    );
    const preview = screen.getByTestId("slip-preview");
    expect(preview).toHaveTextContent("KTV K3");
    expect(preview).toHaveTextContent("FRIED RICE");
    expect(preview).not.toHaveTextContent("53,675");
  });

  it("previews the shift report for a shift template", async () => {
    render(<PrintTemplateSettingsPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /settings.printTemplate.placeShiftHint/ })
    );
    const preview = screen.getByTestId("slip-preview");
    expect(preview).toHaveTextContent("SHIFT REPORT");
    expect(preview).toHaveTextContent("NET 65,000");
    expect(preview).toHaveTextContent("KBZPay (1) 30,000");
    expect(screen.queryByLabelText("settings.printTemplate.itemTextSize")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "settings.printTemplate.paymentsByMethod" })
    );
    expect(preview).not.toHaveTextContent("KBZPay");
  });

  it("prints phone and email after their icons, each with its own switch", async () => {
    render(<PrintTemplateSettingsPanel />);
    const preview = screen.getByTestId("slip-preview");
    expect(await screen.findByRole("img", { name: "Email" })).toBeInTheDocument();
    expect(preview).toHaveTextContent("hello@grandspa.com");
    expect(screen.getByRole("img", { name: "Phone" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Email" }));
    expect(preview).not.toHaveTextContent("hello@grandspa.com");
    expect(preview).toHaveTextContent("09 123");
  });

  it("says when the logo is on but the business has none", async () => {
    render(<PrintTemplateSettingsPanel />);
    expect(await screen.findByText("settings.printTemplate.noLogo")).toBeInTheDocument();
  });

  it("chooses checkout copies, and hides order receipt prices only with that copy on", () => {
    render(<PrintTemplateSettingsPanel />);
    expect(
      screen.queryByRole("checkbox", { name: "settings.printTemplate.hidePriceOnOrderBill" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "settings.printTemplate.copyOrder" }));
    expect(
      screen.getByRole("checkbox", { name: "settings.printTemplate.hidePriceOnOrderBill" })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /settings.printTemplate.placeKdsHint/ })
    );
    expect(
      screen.queryByRole("checkbox", { name: "settings.printTemplate.copyOrder" })
    ).not.toBeInTheDocument();
  });

  it("sizes the preview's items with the item text size", () => {
    render(<PrintTemplateSettingsPanel />);
    const select = screen.getByLabelText("settings.printTemplate.itemTextSize");
    expect(select).toHaveValue("1H1W");
    fireEvent.change(select, { target: { value: "2H1W" } });
    expect(select).toHaveValue("2H1W");
  });

  it("shows the KDS delete slip setting in Print Template and saves it", async () => {
    render(<PrintTemplateSettingsPanel />);

    const toggle = await screen.findByRole("switch", { name: "KDS delete slip" });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(saveKdsDeleteSlip).toHaveBeenCalledWith(false);
  });
});
