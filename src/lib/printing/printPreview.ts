import type { SaleReceipt } from "./formatKdsTicket";

const KEY = "pos.printPreview";

export interface PendingPreview {
  receipt: SaleReceipt;
  answer: (print: boolean) => void;
}

let pending: PendingPreview | null = null;
let on = readSetting();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function readSetting(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const printPreviewOn = () => on;

export const setPrintPreviewOn = (next: boolean) => {
  on = next;
  try {
    if (next) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Kept for this visit only when the browser will not store it.
  }
  emit();
};

/** Shows the slip on screen when this device previews before printing; true means print it. */
export const previewBeforePrint = (receipt: SaleReceipt): Promise<boolean> => {
  if (!on) return Promise.resolve(true);
  pending?.answer(false);
  return new Promise((resolve) => {
    const shown: PendingPreview = {
      receipt,
      answer: (print) => {
        if (pending === shown) pending = null;
        emit();
        resolve(print);
      },
    };
    pending = shown;
    emit();
  });
};

export const subscribeToPrintPreview = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const currentPrintPreview = () => pending;
