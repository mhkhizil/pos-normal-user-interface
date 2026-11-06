import type { Customer } from "@/core/domain/entities/Customer";
import type { PaymentMethod } from "@/core/domain/entities/Cashier";

/** A tender that puts the bill on a customer's account. */
export const isCreditMethod = (method?: Pick<PaymentMethod, "kind"> | null) =>
  String(method?.kind || "").toUpperCase() === "CUSTOMER_CREDIT";

/** Room left under a customer's credit limit. */
export const creditAvailable = (customer: Pick<Customer, "maxCreditLimit" | "currentCreditBalance">) =>
  Math.max(0, Number(customer.maxCreditLimit || 0) - Number(customer.currentCreditBalance || 0));
