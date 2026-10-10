import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { CloseShiftDialog } from "@/components/shift/CloseShiftDialog";
import type { InventoryLocation, PosRegister } from "@/core/domain/entities/Cashier";
import type { CurrentShift } from "@/core/domain/entities/Shift";

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

interface PosWorkspaceSetupModalProps {
  open: boolean;
  inventoryLocations: InventoryLocation[];
  activeLocationId: string;
  posRegisters: PosRegister[];
  activePosRegisterId: string;
  activePosSessionId: string;
  isLoading: boolean;
  errorMessage?: string | null;
  notice?: string | null;
  currentShift: CurrentShift | null;
  onLocationChange: (locationId: string) => void;
  onRegisterChange: (registerId: string) => void;
  onOpenSession: () => void;
  onShiftClosed: () => void;
  onContinue: () => void;
  /** Escape hatch: sign out so a stuck user is never trapped in this dialog. */
  onLogout?: () => void;
}

export function PosWorkspaceSetupModal({
  open,
  inventoryLocations,
  activeLocationId,
  posRegisters,
  activePosRegisterId,
  activePosSessionId,
  isLoading,
  errorMessage,
  notice,
  currentShift,
  onLocationChange,
  onRegisterChange,
  onOpenSession,
  onShiftClosed,
  onContinue,
  onLogout,
}: PosWorkspaceSetupModalProps) {
  const { t } = useTranslation();
  const [closingId, setClosingId] = useState<string | null>(null);

  if (!open) return null;

  const shift = currentShift?.registerId === activePosRegisterId ? currentShift : null;
  const dayOver = Boolean(activePosSessionId && shift?.overdue);
  const someoneElses = !activePosSessionId && shift?.shift ? shift.shift : null;
  const canContinue = Boolean(
    activeLocationId && activePosRegisterId && activePosSessionId && !dayOver && !isLoading
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-workspace-setup-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 text-center">
          <h2
            id="pos-workspace-setup-title"
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
          >
            {t("cashier.pos.setupTitle")}
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("cashier.pos.setupSubtitle")}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              htmlFor="pos-setup-location"
            >
              {t("cashier.location")}
            </label>
            <select
              id="pos-setup-location"
              value={activeLocationId}
              onChange={(event) => onLocationChange(event.target.value)}
              className={inputClassName}
              disabled={isLoading}
            >
              <option value="">{t("cashier.selectLocation")}</option>
              {inventoryLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              htmlFor="pos-setup-register"
            >
              {t("cashier.pos.register")}
            </label>
            <select
              id="pos-setup-register"
              value={activePosRegisterId}
              onChange={(event) => onRegisterChange(event.target.value)}
              className={inputClassName}
              disabled={isLoading || !activeLocationId}
            >
              <option value="">{t("cashier.pos.selectRegister")}</option>
              {posRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name} ({register.code})
                </option>
              ))}
            </select>
          </div>

          {activePosRegisterId && shift ? (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {shift.shiftRule === "DAILY" ? t("shift.dailyShift") : t("shift.perLoginShift")}
            </p>
          ) : null}

          {dayOver ? (
            <div className="space-y-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
              <p className="font-medium text-red-200">{t("shift.dayOver")}</p>
              <p className="text-sm text-red-300">{t("shift.dayOverHint")}</p>
              <Button type="button" variant="destructive" onClick={() => setClosingId(activePosSessionId)}>
                {t("shift.closeDay")}
              </Button>
            </div>
          ) : activePosSessionId ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("cashier.pos.sessionActive")}</p>
          ) : someoneElses ? (
            <div className="space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
              <p className="font-medium text-amber-200">
                {t("shift.openBy", { name: someoneElses.cashierName ?? "—" })}
              </p>
              <p className="text-sm text-amber-300/90">{t("shift.openByHint")}</p>
              <Button type="button" variant="secondary" onClick={() => setClosingId(someoneElses.id)}>
                {t("shift.closeTheirs")}
              </Button>
            </div>
          ) : activePosRegisterId ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("shift.openHint")}</p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              {notice}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={
                isLoading || !activePosRegisterId || Boolean(activePosSessionId || someoneElses)
              }
              onClick={onOpenSession}
            >
              {t("shift.openButton")}
            </Button>
            <Button
              type="button"
              disabled={!canContinue}
              onClick={onContinue}
            >
              {t("cashier.pos.continue")}
            </Button>
          </div>

          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t("shell.logout")}
            </button>
          ) : null}
        </div>
      </div>
      {closingId ? (
        <CloseShiftDialog
          sessionId={closingId}
          title={dayOver ? t("shift.closeDay") : t("shift.endShift")}
          onCancel={() => setClosingId(null)}
          onClosed={() => {
            setClosingId(null);
            onShiftClosed();
          }}
        />
      ) : null}
    </div>
  );
}
