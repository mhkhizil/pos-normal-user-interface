import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { saleReceiptPreview } from "@/lib/printing/formatKdsTicket";
import { currentPrintPreview, subscribeToPrintPreview } from "@/lib/printing/printPreview";
import { SlipPreview } from "./SlipPreview";

export function PrintPreviewDialog() {
  const { t } = useTranslation();
  const pending = useSyncExternalStore(subscribeToPrintPreview, currentPrintPreview);
  const slip = useMemo(() => (pending ? saleReceiptPreview(pending.receipt) : null), [pending]);
  if (!pending || !slip) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("receipt.preview.title")}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex max-h-full w-full max-w-md flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <h2 className="border-b border-slate-700 px-4 py-3 text-base font-bold text-white">
          {t("receipt.preview.title")}
        </h2>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-800 p-4">
          <SlipPreview slip={slip} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={() => pending.answer(false)}
            className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => pending.answer(true)}
            className="min-h-11 rounded-lg bg-[#1a9bff] px-5 text-sm font-semibold text-white hover:bg-[#0f86e0]"
          >
            {t("receipt.preview.print")}
          </button>
        </div>
      </div>
    </div>
  );
}
