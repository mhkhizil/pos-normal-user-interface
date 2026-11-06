import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import type { Customer } from "@/core/domain/entities/Customer";
import container from "@/core/infrastructure/di/container";
import type { CustomerManagementService } from "@/core/application/services/CustomerManagementService";
import { creditAvailable } from "@/lib/pos/credit";

const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Whose account a bill goes on: customers with a credit account, by name or phone. */
export function CreditCustomerPicker({
  amount,
  onPick,
  onCancel,
}: {
  /** What goes on account; a customer without that much room left can't be picked. */
  amount: number;
  onPick: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const service = container.resolve<CustomerManagementService>("customerService");
        const result = await service.getCustomers({
          page: 1,
          limit: 100,
          ...(search.trim() ? { search: search.trim() } : {}),
        });
        if (live) setCustomers(result.customers.filter((customer) => customer.hasCreditAccount));
      } catch (caught) {
        if (live) setError(caught instanceof Error ? caught.message : t("cashier.credit.loadFailed"));
      } finally {
        if (live) setIsLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search, t]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("cashier.credit.title")}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col gap-3 rounded-lg border border-slate-700 bg-slate-950 p-5 text-slate-100"
      >
        <h2 className="text-lg font-bold">{t("cashier.credit.title")}</h2>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("cashier.credit.search")}
          aria-label={t("cashier.credit.search")}
          className="h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 focus:border-blue-500 focus:outline-none"
        />
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {isLoading ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {!isLoading && !error && !customers.length ? (
            <p className="text-sm text-slate-400">{t("cashier.credit.none")}</p>
          ) : null}
          {customers.map((customer) => {
            const available = creditAvailable(customer);
            const enough = available >= amount;
            return (
              <button
                key={customer.id}
                type="button"
                disabled={!enough}
                onClick={() => onPick(customer)}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  {customer.phone ? (
                    <span className="block text-xs text-slate-400">{customer.phone}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block text-slate-300">
                    {t("cashier.credit.owes", { amount: money(Number(customer.currentCreditBalance || 0)) })}
                  </span>
                  <span className={`block ${enough ? "text-emerald-300" : "text-red-300"}`}>
                    {enough
                      ? t("cashier.credit.available", { amount: money(available) })
                      : t("cashier.credit.limitReached")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">{t("cashier.credit.hint")}</p>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
