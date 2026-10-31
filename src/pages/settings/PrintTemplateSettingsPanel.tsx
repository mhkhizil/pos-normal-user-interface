import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SlipPreview } from "@/components/printing/SlipPreview";
import {
  PriceCurrency,
  PrintCompany,
  PrintPaperWidth,
  PrintTemplateSettings,
  PrintTemplateType,
  defaultPrintTemplateSettings,
} from "@/core/domain/entities/PrintTemplate";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import { printCompanyFor } from "@/core/presentation/hooks/usePrinterConnection";
import { useVenueSetting } from "@/core/presentation/hooks/useVenueSetting";
import { useKdsDeleteSlipShopSetting } from "@/core/presentation/hooks/useKdsDeleteSlipShopSetting";
import type { ShiftSummary } from "@/core/domain/entities/Shift";
import { usePrintTemplateManagement } from "@/core/presentation/hooks/usePrintTemplateManagement";
import { SettingsToggleRow } from "./settingsUi";
import {
  PrintLine,
  itemTextScaleOf,
  kitchenSlipPreview,
  saleReceiptPreview,
} from "@/lib/printing/formatKdsTicket";
import type { PrintImage } from "@/lib/printing/printImage";
import { printLogoFor } from "@/lib/printing/printLogo";
import { shiftSlip } from "@/lib/printing/shiftSlip";
import { templatesForType } from "@/lib/printing/selectPrintTemplate";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500";

type Draft = {
  id: string;
  name: string;
  locationScope: "CURRENT" | "ALL";
  type: PrintTemplateType;
  paperWidth: PrintPaperWidth;
  isDefault: boolean;
  settings: PrintTemplateSettings;
};

const DEFAULT_NAMES: Record<PrintTemplateType, string> = {
  RECEIPT: "Default receipt",
  KITCHEN: "Default kitchen",
  FINANCE: "Default finance",
  SHIFT: "Shift report",
};

const emptyDraft = (): Draft => ({
  id: "",
  name: DEFAULT_NAMES.RECEIPT,
  locationScope: "CURRENT",
  type: "RECEIPT",
  paperWidth: "MM80",
  isDefault: true,
  settings: defaultPrintTemplateSettings(),
});

const isPresetName = (name: string) =>
  Object.values(DEFAULT_NAMES).includes(name.trim());

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 text-sm text-slate-700">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

const TEXT_SCALES = [
  ["1H1W", "sizeNormal"],
  ["2H1W", "sizeTall"],
  ["1H2W", "sizeWide"],
  ["2H2W", "sizeBig"],
] as const;

const COPIES = [
  ["CUSTOMER", "copyCustomer"],
  ["ORDER_RECEIPT", "copyOrder"],
  ["FINANCE", "copyFinance"],
] as const;

const sampleTime = (hours: number, minutes: number) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const SAMPLE_LINES: PrintLine[] = [
  {
    name: "KTV 2 hours",
    quantity: "2",
    unitPrice: "25000",
    categoryName: "Rooms",
  },
  {
    name: "Fried rice",
    altName: "ထမင်းကြော်",
    quantity: "1",
    unitPrice: "6500",
    modifiers: "Extra egg",
    modifierPrices: "500",
    remarks: "No chili",
    categoryName: "Food",
    seat: "2",
  },
];

const SAMPLE_SHIFT: ShiftSummary = {
  sessionId: "sample",
  registerName: "Front desk",
  cashierName: "Aung Aung",
  openedAt: sampleTime(8, 0),
  closedAt: sampleTime(16, 0),
  openingCashFloat: 0,
  expectedClosingCash: 0,
  actualClosingCash: null,
  cashVariance: null,
  totalSales: 70000,
  totalRefunds: 5000,
  netTotal: 65000,
  salesCount: 4,
  refundCount: 1,
  nonSalesCashIn: 0,
  nonSalesCashOut: 0,
  paymentBreakdown: [
    { methodName: "Cash", transactionCount: 3, totalAmount: 40000 },
    { methodName: "KBZPay", transactionCount: 1, totalAmount: 30000 },
  ],
};

/** A sample bill drawn by the same code that prints, so the preview is the paper. */
function TemplatePreview({
  settings,
  paperWidth,
  type,
  outletName,
  company,
  currency,
  logo,
}: {
  settings: PrintTemplateSettings;
  paperWidth: PrintPaperWidth;
  type: PrintTemplateType;
  outletName: string;
  company: PrintCompany | null;
  currency?: PriceCurrency;
  logo: PrintImage | null;
}) {
  const slip =
    type === "SHIFT"
      ? saleReceiptPreview({
          ...shiftSlip(SAMPLE_SHIFT),
          logo,
          template: settings,
          paperWidth,
          company,
          outletName,
          currency,
        })
      : type === "KITCHEN"
      ? kitchenSlipPreview({
          title: "0012",
          stationName: "Kitchen",
          place: "KTV K3",
          placeDetail: "KTV - 4 guests",
          orderRef: "SO-R01-0012",
          firedAt: sampleTime(14, 5),
          sentBy: "Aung Aung",
          outletName,
          lines: SAMPLE_LINES.slice(1).concat({ name: "Lime juice", quantity: "2", unitPrice: "2500" }),
          template: settings,
          paperWidth,
        })
      : saleReceiptPreview({
          title: type === "FINANCE" ? "Finance copy" : "Receipt",
          place: type === "FINANCE" ? "FINANCE" : "CHECKOUT",
          receiptId: "SO-R01-0012",
          paidAt: sampleTime(14, 31),
          company,
          logo,
          outletName,
          serviceType: "KTV",
          tableOrRoom: "K3",
          startTime: "13:00",
          endTime: "14:30",
          cashier: "Aung Aung",
          pickupCode: "A12",
          lines: SAMPLE_LINES,
          subtotal: "56500",
          discount: "2825",
          total: "53675",
          payments: [{ name: "Cash", amount: "60000" }],
          change: "6325",
          template: settings,
          paperWidth,
          currency,
        });
  return <SlipPreview slip={slip} />;
}

export function PrintTemplateSettingsPanel() {
  const { t } = useTranslation();
  const { activeLocationId } = usePosWorkspace();
  const { user } = useAuth();
  const { currency } = useVenueSetting();
  const kdsDeleteSlip = useKdsDeleteSlipShopSetting();
  const [company, setCompany] = useState<PrintCompany | null>(null);
  const [logo, setLogo] = useState<PrintImage | null>(null);
  const {
    templates,
    isLoading,
    error,
    listTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = usePrintTemplateManagement();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listTemplates({ page: 1, limit: 50 }).catch(() => undefined);
  }, [listTemplates]);

  useEffect(() => {
    if (!user?.tenantId) return;
    let cancelled = false;
    void printCompanyFor(user.tenantId).then((found) => {
      if (!cancelled) setCompany(found);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.tenantId]);

  const logoUrl = company?.logoUrl;
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    void printLogoFor(logoUrl, draft.paperWidth).then((found) => {
      if (!cancelled) setLogo(found);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl, draft.paperWidth]);

  const patchSettings = (settings: PrintTemplateSettings) =>
    setDraft((current) => ({ ...current, settings }));

  const applyType = (type: PrintTemplateType) => {
    setDraft((current) => {
      if (current.id) return current;
      const settings = defaultPrintTemplateSettings();
      if (type === "KITCHEN") {
        settings.item.price = false;
        settings.header.logo = false;
      }
      if (type === "FINANCE") {
        settings.header.logo = false;
      }
      if (type === "SHIFT") {
        settings.header = {
          logo: false,
          outletName: true,
          address: false,
          contact: false,
          email: false,
        };
        settings.other = {
          ...settings.other,
          orderNumber: false,
          serviceType: false,
          tableOrRoom: false,
          pickupCode: false,
          footerText: "",
        };
      }
      return {
        ...current,
        type,
        isDefault: true,
        name: isPresetName(current.name) ? DEFAULT_NAMES[type] : current.name,
        settings,
      };
    });
  };

  const types: PrintTemplateType[] = ["KITCHEN", "RECEIPT", "FINANCE", "SHIFT"];
  const typeCopy: Record<PrintTemplateType, { label: string; hint: string }> = {
    KITCHEN: {
      label: t("settings.printTemplate.placeKds"),
      hint: t("settings.printTemplate.placeKdsHint"),
    },
    RECEIPT: {
      label: t("settings.printTemplate.placeCheckout"),
      hint: t("settings.printTemplate.placeCheckoutHint"),
    },
    FINANCE: {
      label: t("settings.printTemplate.placeFinance"),
      hint: t("settings.printTemplate.placeFinanceHint"),
    },
    SHIFT: {
      label: t("settings.printTemplate.placeShift"),
      hint: t("settings.printTemplate.placeShiftHint"),
    },
  };

  const selectTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) {
      setDraft(emptyDraft());
      return;
    }
    setDraft({
      id: template.id,
      name: template.name,
      locationScope: template.locationId ? "CURRENT" : "ALL",
      type: template.type,
      paperWidth: template.paperWidth,
      isDefault: Boolean(template.isDefault),
      settings: template.settings,
    });
    setNotice(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const locationId =
      draft.locationScope === "CURRENT" ? activeLocationId || undefined : undefined;
    try {
      if (draft.id) {
        const updated = await updateTemplate(draft.id, {
          name: draft.name,
          paperWidth: draft.paperWidth,
          isDefault: draft.isDefault,
          settings: draft.settings,
        });
        setDraft((current) => ({ ...current, id: updated.id }));
      } else {
        const created = await createTemplate({
          type: draft.type,
          name: draft.name,
          locationId,
          paperWidth: draft.paperWidth,
          isDefault: draft.isDefault,
          settings: draft.settings,
        });
        setDraft((current) => ({ ...current, id: created.id }));
      }
      setNotice(t("settings.printTemplate.saved"));
    } catch {
      setNotice(null);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    await deleteTemplate(draft.id);
    setDraft(emptyDraft());
    setNotice(t("settings.printTemplate.deleted"));
  };

  const { settings } = draft;
  const otherFields =
    draft.type === "SHIFT"
      ? (["cashier"] as const)
      : draft.type === "KITCHEN"
      ? (["orderNumber"] as const)
      : ([
          "orderNumber",
          "cashier",
          "serviceType",
          "tableOrRoom",
          "pickupCode",
        ] as const);
  const billFields =
    draft.type === "SHIFT"
      ? (["totalPayment"] as const)
      : (["amountAfterDiscount", "totalPayment", "payTime"] as const);
  const headerFields =
    draft.type === "KITCHEN"
      ? (["logo", "outletName"] as const)
      : (["logo", "outletName", "address", "contact", "email"] as const);

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        {kdsDeleteSlip.canWrite ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <SettingsToggleRow
              title={t("settings.printTemplate.deleteSlip.title")}
              description={t("settings.printTemplate.deleteSlip.description")}
              checked={kdsDeleteSlip.enabled}
              onChange={(enabled) => void kdsDeleteSlip.save(enabled)}
              disabled={kdsDeleteSlip.isSaving}
            />
            {kdsDeleteSlip.isSaving ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("settings.printTemplate.deleteSlip.saving")}
              </p>
            ) : null}
            {kdsDeleteSlip.error ? (
              <p className="mt-2 text-sm text-red-600">{kdsDeleteSlip.error}</p>
            ) : null}
          </section>
        ) : null}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            {t("settings.printTemplate.howTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t("settings.printTemplate.howBody")}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {types.map((item) => {
              const competing = templatesForType(item, templates, activeLocationId);
              const active = competing.length === 1 ? competing[0] : undefined;
              const body = (
                <>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {typeCopy[item].label}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">
                    {active?.name ||
                      (competing.length > 1
                        ? competing.map((template) => template.name).join(", ")
                        : t("settings.printTemplate.builtin"))}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {competing.length > 1
                      ? t("settings.printTemplate.conflict", {
                          name: competing.map((template) => template.name).join(", "),
                        })
                      : competing.length === 1
                        ? t("settings.printTemplate.printingNow")
                        : t("settings.printTemplate.usingBuiltin")}
                  </span>
                </>
              );
              return active ? (
                <button
                  key={item}
                  type="button"
                  onClick={() => selectTemplate(active.id)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:border-blue-300"
                >
                  {body}
                </button>
              ) : (
                <div
                  key={item}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600 sm:col-span-2">
              {t("settings.printTemplate.savedTemplates")}
              <select
                className={fieldClass}
                value={draft.id}
                onChange={(event) => selectTemplate(event.target.value)}
              >
                <option value="">{t("settings.printTemplate.newTemplate")}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} — {typeCopy[template.type].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600 sm:col-span-2">
              {t("settings.printTemplate.name")}
              <input
                className={fieldClass}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm text-slate-600">
                {t("settings.printTemplate.usedFor")}
              </legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {types.map((item) => {
                  const selected = draft.type === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      disabled={Boolean(draft.id) && !selected}
                      onClick={() => applyType(item)}
                      className={[
                        "rounded-lg border px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50",
                        selected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-800",
                      ].join(" ")}
                    >
                      <span className="block text-sm font-semibold">
                        {typeCopy[item].label}
                      </span>
                      <span
                        className={[
                          "mt-1 block text-xs leading-5",
                          selected ? "text-blue-100" : "text-slate-500",
                        ].join(" ")}
                      >
                        {typeCopy[item].hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              {draft.id ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t("settings.printTemplate.lockedType")}
                </p>
              ) : null}
            </fieldset>
            <label className="text-sm text-slate-600">
              {t("settings.printTemplate.paperWidth")}
              <select
                className={fieldClass}
                value={draft.paperWidth}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    paperWidth: event.target.value as PrintPaperWidth,
                  }))
                }
              >
                <option value="MM58">58mm</option>
                <option value="MM80">80mm</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              {t("settings.printTemplate.location")}
              <select
                className={fieldClass}
                value={draft.locationScope}
                disabled={Boolean(draft.id)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    locationScope: event.target.value as Draft["locationScope"],
                  }))
                }
              >
                <option value="CURRENT">{t("settings.printTemplate.currentBranch")}</option>
                <option value="ALL">{t("settings.printTemplate.allOutlets")}</option>
              </select>
              {draft.id ? (
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {t("settings.printTemplate.lockedLocation")}
                </span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isDefault: event.target.checked,
                  }))
                }
              />
              {t("settings.printTemplate.defaultStatus")}
            </label>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{t("settings.printTemplate.header")}</h3>
          {settings.header.logo && company && !company.logoUrl ? (
            <p className="text-xs leading-5 text-amber-700">{t("settings.printTemplate.noLogo")}</p>
          ) : null}
          {headerFields.map((field) => (
            <ToggleField
              key={field}
              label={t(`settings.printTemplate.${field}`)}
              checked={settings.header[field]}
              onChange={(checked) =>
                patchSettings({ ...settings, header: { ...settings.header, [field]: checked } })
              }
            />
          ))}
        </section>

        {draft.type === "RECEIPT" ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="font-semibold">{t("settings.printTemplate.copies")}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("settings.printTemplate.copiesHint")}
            </p>
            {COPIES.map(([copy, label]) => (
              <ToggleField
                key={copy}
                label={t(`settings.printTemplate.${label}`)}
                checked={settings.copies.includes(copy)}
                onChange={(checked) =>
                  patchSettings({
                    ...settings,
                    copies: checked
                      ? [...settings.copies.filter((item) => item !== copy), copy]
                      : settings.copies.filter((item) => item !== copy),
                  })
                }
              />
            ))}
            {settings.copies.includes("ORDER_RECEIPT") ? (
              <ToggleField
                label={t("settings.printTemplate.hidePriceOnOrderBill")}
                checked={settings.item.hidePriceOnOrderBill}
                onChange={(hidePriceOnOrderBill) =>
                  patchSettings({
                    ...settings,
                    item: { ...settings.item, hidePriceOnOrderBill },
                  })
                }
              />
            ) : null}
          </section>
        ) : null}

        {draft.type === "SHIFT" ? null : (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{t("settings.printTemplate.item")}</h3>
          {(
            [
              ["itemTextScale", "itemTextSize"],
              ["otherTextScale", "otherTextSize"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block py-2 text-sm text-slate-700">
              {t(`settings.printTemplate.${label}`)}
              <select
                className={fieldClass}
                value={
                  field === "itemTextScale"
                    ? itemTextScaleOf(settings, draft.type === "KITCHEN")
                    : settings.item.otherTextScale
                }
                onChange={(event) =>
                  patchSettings({
                    ...settings,
                    item: {
                      ...settings.item,
                      [field]: event.target.value,
                      // The size switch now decides; the older font size goes back to its start.
                      ...(field === "itemTextScale"
                        ? { fontSize: draft.type === "KITCHEN" ? "LARGE" : "MIDDLE" }
                        : {}),
                    },
                  })
                }
              >
                {TEXT_SCALES.map(([scale, name]) => (
                  <option key={scale} value={scale}>
                    {t(`settings.printTemplate.${name}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {(
            [
              ["qtyFirst", "qtyFirst"],
              ["price", "price"],
              ["modifiers", "modifiers"],
              ["categorySubtotal", "categorySubtotal"],
            ] as const
          ).map(([field, label]) => (
            <ToggleField
              key={field}
              label={t(`settings.printTemplate.${label}`)}
              checked={settings.item[field]}
              onChange={(checked) =>
                patchSettings({
                  ...settings,
                  item: {
                    ...settings.item,
                    [field]: checked,
                  },
                })
              }
            />
          ))}
        </section>
        )}

        {draft.type === "KITCHEN" ? null : (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{t("settings.printTemplate.bill")}</h3>
          {billFields.map((field) => (
            <ToggleField
              key={field}
              label={t(
                draft.type === "SHIFT"
                  ? "settings.printTemplate.paymentsByMethod"
                  : `settings.printTemplate.${field}`
              )}
              checked={settings.bill[field]}
              onChange={(checked) =>
                patchSettings({
                  ...settings,
                  bill: { ...settings.bill, [field]: checked },
                })
              }
            />
          ))}
        </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold">{t("settings.printTemplate.other")}</h3>
          {otherFields.map((field) => (
            <ToggleField
              key={field}
              label={t(`settings.printTemplate.${field}`)}
              checked={settings.other[field]}
              onChange={(checked) =>
                patchSettings({
                  ...settings,
                  other: { ...settings.other, [field]: checked },
                })
              }
            />
          ))}
          <label className="block py-2 text-sm text-slate-700">
            {t("settings.printTemplate.footerText")}
            <input
              className={fieldClass}
              value={settings.other.footerText}
              onChange={(event) =>
                patchSettings({
                  ...settings,
                  other: { ...settings.other, footerText: event.target.value },
                })
              }
            />
          </label>
        </section>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" isLoading={isLoading}>
            {t("settings.printTemplate.save")}
          </Button>
          {draft.id ? (
            <Button type="button" variant="outline" onClick={() => void remove()}>
              {t("settings.printTemplate.delete")}
            </Button>
          ) : null}
        </div>
      </div>
      <aside className="rounded-xl bg-slate-100 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-600">
          {t("settings.printTemplate.previewTitle")}
        </p>
        <TemplatePreview
          settings={settings}
          paperWidth={draft.paperWidth}
          type={draft.type}
          outletName={t("settings.printTemplate.previewOutlet")}
          company={company}
          currency={currency}
          logo={logoUrl ? logo : null}
        />
        <p className="mt-3 text-xs text-slate-500">{t("settings.printTemplate.previewHint")}</p>
      </aside>
    </form>
  );
}
