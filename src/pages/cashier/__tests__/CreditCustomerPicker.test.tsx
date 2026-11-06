import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Customer } from "@/core/domain/entities/Customer";
import { CreditCustomerPicker } from "../CreditCustomerPicker";

const service = vi.hoisted(() => ({ getCustomers: vi.fn() }));
vi.mock("@/core/infrastructure/di/container", () => ({
  default: { resolve: () => service },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { amount?: string }) => (options?.amount ? `${key}:${options.amount}` : key),
  }),
}));

const customer = (data: Partial<Customer>) =>
  new Customer({ id: "c", name: "", phone: "", hasCreditAccount: true, maxCreditLimit: "0", currentCreditBalance: "0", ...data });

describe("CreditCustomerPicker", () => {
  it("lists only credit accounts and won't pick one without room for the bill", async () => {
    service.getCustomers.mockResolvedValue({
      customers: [
        customer({ id: "kyaw", name: "U Kyaw", maxCreditLimit: "200000", currentCreditBalance: "85000" }),
        customer({ id: "zaw", name: "Ko Zaw", maxCreditLimit: "50000", currentCreditBalance: "48000" }),
        customer({ id: "walk", name: "Walk-in", hasCreditAccount: false }),
      ],
      total: 3,
    });
    const onPick = vi.fn();
    render(<CreditCustomerPicker amount={8840} onPick={onPick} onCancel={vi.fn()} />);

    const kyaw = await screen.findByRole("button", { name: /U Kyaw/ });
    expect(kyaw).toHaveTextContent("cashier.credit.available:115,000");
    expect(screen.getByRole("button", { name: /Ko Zaw/ })).toBeDisabled();
    expect(screen.queryByText("Walk-in")).toBeNull();

    fireEvent.click(kyaw);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "kyaw" }));
  });
});
