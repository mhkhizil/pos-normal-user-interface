import type { ShiftSalesGroups } from "@/core/domain/entities/Shift";

export interface ShiftGroupBlock {
  key: string;
  title: string;
  /** What the count column means: items, hours or bills. */
  unit: "qty" | "hours" | "orders" | "bill";
  rows: { name: string; count: string; amount: number }[];
  total: { count: string; amount: number };
}

export interface ShiftGroupLabels {
  staffMeal: string;
  other: string;
  rooms: string;
  takeaway: string;
  credit: string;
  noAccount: string;
}

const count = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** A shift's sales by group, as the report lists them; empty groups are left out. */
export function shiftGroupBlocks(groups: ShiftSalesGroups, labels: ShiftGroupLabels): ShiftGroupBlock[] {
  const blocks: ShiftGroupBlock[] = groups.sections.map((section) => ({
    key: section.key,
    title:
      section.kind === "STAFF_MEAL"
        ? labels.staffMeal
        : section.kind === "OTHER"
          ? labels.other
          : section.name || labels.other,
    unit: "qty",
    rows: section.items.map((item) => ({
      name: item.name,
      count: count(item.quantity),
      amount: item.amount,
    })),
    total: { count: count(section.quantity), amount: section.amount },
  }));
  if (groups.rooms.rows.length) {
    blocks.push({
      key: "rooms",
      title: labels.rooms,
      unit: "hours",
      rows: groups.rooms.rows.map((row) => ({
        name: row.room,
        count: count(row.hours),
        amount: row.amount,
      })),
      total: { count: count(groups.rooms.hours), amount: groups.rooms.amount },
    });
  }
  if (groups.takeaway.orders) {
    blocks.push({
      key: "takeaway",
      title: labels.takeaway,
      unit: "orders",
      rows: [],
      total: { count: String(groups.takeaway.orders), amount: groups.takeaway.amount },
    });
  }
  if (groups.credit.rows.length) {
    blocks.push({
      key: "credit",
      title: labels.credit,
      unit: "bill",
      rows: groups.credit.rows.map((row) => ({
        name: row.account || labels.noAccount,
        count: row.orderNumber,
        amount: row.amount,
      })),
      total: { count: "", amount: groups.credit.amount },
    });
  }
  return blocks;
}
