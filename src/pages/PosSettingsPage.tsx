import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import {
  QuickChip,
  SettingsField,
  SettingsSection,
  SettingsToggleRow,
} from "./settings/settingsUi";
import { DevicesSettingsPanel } from "./settings/DevicesSettingsPanel";
import { PrinterSettingsPanel } from "./settings/PrinterSettingsPanel";
import { PrintTemplateSettingsPanel } from "./settings/PrintTemplateSettingsPanel";
import { KdsStationSettingsPanel } from "./settings/KdsStationSettingsPanel";
import { ShiftSettingsPanel } from "./settings/ShiftSettingsPanel";
import { CloseShiftDialog } from "@/components/shift/CloseShiftDialog";
import { usePosWorkspace } from "@/core/presentation/hooks/usePosWorkspace";
import {
  printPreviewOn,
  setPrintPreviewOn,
  subscribeToPrintPreview,
} from "@/lib/printing/printPreview";

type SettingsTab =
  | "cashier"
  | "devices"
  | "printer"
  | "print-template"
  | "kds-station"
  | "pos-terminal"
  | "shift"
  | "logout";

const tabIds: SettingsTab[] = [
  // "cashier",
  "shift",
  "devices",
  "printer",
  "print-template",
  "kds-station",
  // "pos-terminal",
  "logout",
];

const DEFAULT_SETTINGS_TAB: SettingsTab = "devices";

const serviceTypes = ["DINE_IN", "TAKE_AWAY", "DELIVERY", "PICK_UP"] as const;

const quickActions = [
  "soldOut",
  "kitchenPrint",
  "reserve",
  "seasonalItems",
  "bookkeeping",
  "storage",
  "pickUp",
] as const;

function UserAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-bold text-slate-600">
      {initial}
    </div>
  );
}

export function PosSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const { user, logout } = useAuth();
  const { currentShift, activePosSessionId, shiftClosed } = usePosWorkspace();
  const [endingShift, setEndingShift] = useState(false);
  const previewOn = useSyncExternalStore(subscribeToPrintPreview, printPreviewOn);
  const cashierShiftOpen = Boolean(activePosSessionId && currentShift?.shiftRule !== "DAILY");

  const activeTab = tabIds.includes((tab || "") as SettingsTab)
    ? (tab as SettingsTab)
    : DEFAULT_SETTINGS_TAB;

  const displayName = user?.nickname || user?.name || t("shell.userFallback");

  const [activeQuickAction, setActiveQuickAction] =
    useState<(typeof quickActions)[number]>("seasonalItems");
  const [autoCheckout, setAutoCheckout] = useState<Record<string, boolean>>({
    DINE_IN: false,
    TAKE_AWAY: false,
    DELIVERY: false,
    PICK_UP: true,
  });
  const [openNewOrderAfterCheckout, setOpenNewOrderAfterCheckout] = useState(false);
  const [quickOrder, setQuickOrder] = useState(true);
  const [priorityOrderMemo, setPriorityOrderMemo] = useState(false);

  const [terminalName, setTerminalName] = useState("");
  const [terminalRegisterId, setTerminalRegisterId] = useState("");
  const [receiptHeader, setReceiptHeader] = useState("");

  const tabLabels = useMemo(
    () =>
      ({
        cashier: t("settings.tabs.cashier"),
        devices: t("settings.tabs.devices"),
        printer: t("settings.tabs.printer"),
        "print-template": t("settings.tabs.printTemplate"),
        "kds-station": t("settings.tabs.kdsStation"),
        "pos-terminal": t("settings.tabs.posTerminal"),
        shift: t("shift.tab"),
        logout: t("settings.tabs.logout"),
      }) satisfies Record<SettingsTab, string>,
    [t]
  );

  const selectTab = (nextTab: SettingsTab) => {
    navigate(`/settings/${nextTab}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <section className="pos-split flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 md:flex-row">
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-56">
        <div className="hidden border-b border-slate-100 px-4 py-5 text-center md:block">
          <div className="flex justify-center">
            <UserAvatar name={displayName} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">{displayName}</p>
        </div>

        <nav className="flex gap-2 overflow-x-auto p-2 md:block md:min-h-0 md:flex-1 md:overflow-y-auto">
          {tabIds.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => selectTab(tabId)}
              className={[
                "shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition md:mb-1 md:w-full",
                activeTab === tabId
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {tabLabels[tabId]}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {activeTab === "cashier" ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <QuickChip
                  key={action}
                  label={t(`settings.cashier.quickActions.${action}`)}
                  active={activeQuickAction === action}
                  onClick={() => setActiveQuickAction(action)}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span>{t("settings.cashier.shortcutKey")}</span>
              <button
                type="button"
                className="rounded p-1 text-blue-600 hover:bg-blue-50"
                aria-label={t("settings.cashier.editShortcut")}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
              </button>
            </div>

            <SettingsSection title={t("settings.cashier.autoCheckout.title")}>
              <p className="text-sm leading-6 text-slate-500">
                {t("settings.cashier.autoCheckout.description")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {serviceTypes.map((type) => {
                  const enabled = autoCheckout[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setAutoCheckout((current) => ({
                          ...current,
                          [type]: !current[type],
                        }))
                      }
                      className={[
                        "flex min-h-16 min-w-24 flex-col items-center justify-center rounded-lg border px-3 text-xs font-semibold transition",
                        enabled
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                    >
                      <span className="mb-1 text-base" aria-hidden="true">
                        {type === "DINE_IN"
                          ? "🍽"
                          : type === "TAKE_AWAY"
                            ? "🥡"
                            : type === "DELIVERY"
                              ? "🚚"
                              : "🛍"}
                      </span>
                      {t(`settings.cashier.serviceTypes.${type}`)}
                    </button>
                  );
                })}
              </div>
            </SettingsSection>

            <SettingsSection title={t("settings.cashier.behaviorTitle")}>
              <SettingsToggleRow
                title={t("settings.cashier.openNewOrder.title")}
                description={t("settings.cashier.openNewOrder.description")}
                checked={openNewOrderAfterCheckout}
                onChange={setOpenNewOrderAfterCheckout}
              />
              <SettingsToggleRow
                title={t("settings.cashier.quickOrder.title")}
                description={t("settings.cashier.quickOrder.description")}
                checked={quickOrder}
                onChange={setQuickOrder}
              />
              <SettingsToggleRow
                title={t("settings.cashier.priorityMemo.title")}
                description={t("settings.cashier.priorityMemo.description")}
                checked={priorityOrderMemo}
                onChange={setPriorityOrderMemo}
              />
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "shift" ? <ShiftSettingsPanel /> : null}

        {activeTab === "devices" ? <DevicesSettingsPanel /> : null}

        {activeTab === "printer" ? (
          <div className="mx-auto max-w-5xl space-y-4">
            <SettingsSection title={t("settings.printer.title")}>
              <SettingsToggleRow
                title={t("settings.printer.previewTitle")}
                description={t("settings.printer.previewDescription")}
                checked={previewOn}
                onChange={setPrintPreviewOn}
              />
            </SettingsSection>
            <PrinterSettingsPanel />
          </div>
        ) : null}

        {activeTab === "print-template" ? (
          <div className="mx-auto max-w-5xl">
            <PrintTemplateSettingsPanel />
          </div>
        ) : null}

        {activeTab === "kds-station" ? (
          <div className="mx-auto h-full min-h-0 max-w-5xl">
            <KdsStationSettingsPanel />
          </div>
        ) : null}

        {activeTab === "pos-terminal" ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <SettingsSection title={t("settings.posTerminal.title")}>
              <div className="space-y-3">
                <SettingsField
                  label={t("settings.posTerminal.name")}
                  value={terminalName}
                  onChange={setTerminalName}
                  placeholder={t("settings.posTerminal.namePlaceholder")}
                />
                <SettingsField
                  label={t("settings.posTerminal.registerId")}
                  value={terminalRegisterId}
                  onChange={setTerminalRegisterId}
                />
                <label className="block text-sm text-slate-600">
                  {t("settings.posTerminal.receiptHeader")}
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                    value={receiptHeader}
                    onChange={(event) => setReceiptHeader(event.target.value)}
                    placeholder={t("settings.posTerminal.receiptHeaderPlaceholder")}
                  />
                </label>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                {t("settings.posTerminal.hint")}
              </p>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "logout" ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true">
                <path d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H9v2h10v14H9v2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              {t("settings.logout.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {activePosSessionId
                ? t(cashierShiftOpen ? "shift.logoutCashier" : "shift.logoutRoom")
                : t("settings.logout.description")}
            </p>
            {cashierShiftOpen ? (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" className="min-w-40" onClick={() => void handleLogout()}>
                  {t("shift.break")}
                </Button>
                <Button variant="destructive" className="min-w-40" onClick={() => setEndingShift(true)}>
                  {t("shift.endShift")}
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="mt-6 min-w-40"
                onClick={() => void handleLogout()}
              >
                {t("shell.logout")}
              </Button>
            )}
          </div>
        ) : null}
        {endingShift && activePosSessionId ? (
          <CloseShiftDialog
            sessionId={activePosSessionId}
            title={t("shift.endShift")}
            onCancel={() => setEndingShift(false)}
            onClosed={() => {
              setEndingShift(false);
              void shiftClosed({ signingOut: true }).then(handleLogout);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
