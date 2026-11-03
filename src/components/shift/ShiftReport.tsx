import { useTranslation } from "react-i18next";
import type { ShiftSummary } from "@/core/domain/entities/Shift";
import { shiftGroupBlocks } from "@/lib/pos/shiftGroups";
import { money } from "./shiftApi";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

/** What a shift sold and who ran it; printable as it is. */
export function ShiftReport({ summary }: { summary: ShiftSummary }) {
  const { t } = useTranslation();
  const head: [string, React.ReactNode][] = [
    [t("shift.till"), summary.registerName],
    [t("shift.cashier"), summary.cashierName ?? "—"],
    [t("shift.opened"), when(summary.openedAt)],
    [t("shift.closed"), when(summary.closedAt)],
  ];
  const totals: [string, React.ReactNode][] = [
    [t("shift.sales"), `${money(summary.totalSales)} (${summary.salesCount})`],
    [t("shift.refunds"), `${money(summary.totalRefunds)} (${summary.refundCount})`],
    [t("shift.net"), money(summary.netTotal)],
  ];
  const blocks = summary.groups
    ? shiftGroupBlocks(summary.groups, {
        staffMeal: t("shift.groups.staffMeal"),
        other: t("shift.groups.other"),
        rooms: t("shift.groups.rooms"),
        takeaway: t("shift.groups.takeaway"),
        credit: t("shift.groups.credit"),
        noAccount: t("shift.groups.noAccount"),
      })
    : [];
  const pairs = (rows: [string, React.ReactNode][]) => (
    <dl className="space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="whitespace-pre text-slate-400">{label}</dt>
          <dd className="text-right tabular-nums text-slate-100">{value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="shift-report rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
      <h3 className="mb-3 text-center font-semibold text-white">{t("shift.report")}</h3>
      {pairs(head)}
      {blocks.map((block) => (
        <section key={block.key} className="mt-4 border-t border-slate-800 pt-3">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="w-1/2 pb-1 font-semibold text-slate-200">{block.title}</th>
                <th className="pb-1 text-right font-medium">{t(`shift.groups.${block.unit}`)}</th>
                <th className="pb-1 text-right font-medium">{t("shift.groups.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={`${row.name}-${index}`} className="text-slate-300">
                  <td className="truncate py-0.5 pr-2">{row.name}</td>
                  <td className="py-0.5 text-right tabular-nums">{row.count}</td>
                  <td className="py-0.5 text-right tabular-nums">{money(row.amount)}</td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-100">
                <td className="truncate pt-1 pr-2">{t("shift.groups.total", { name: block.title })}</td>
                <td className="pt-1 text-right tabular-nums">{block.total.count}</td>
                <td className="pt-1 text-right tabular-nums">{money(block.total.amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      {blocks.length ? <p className="mt-2 text-xs text-slate-500">{t("shift.groups.note")}</p> : null}
      <div className="mt-4 border-t border-slate-800 pt-3">{pairs(totals)}</div>
      <h4 className="mb-1 mt-4 font-medium text-slate-300">{t("shift.byPayment")}</h4>
      {summary.paymentBreakdown.length ? (
        <dl className="space-y-1">
          {summary.paymentBreakdown.map((row) => (
            <div key={row.methodName} className="flex justify-between gap-4">
              <dt className="text-slate-400">
                {row.methodName} <span className="text-slate-500">({row.transactionCount})</span>
              </dt>
              <dd className="text-right tabular-nums text-slate-100">{money(row.totalAmount)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-slate-500">—</p>
      )}
    </div>
  );
}
