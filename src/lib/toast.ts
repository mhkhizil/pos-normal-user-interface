export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const dismissToast = (id: number) => {
  items = items.filter((item) => item.id !== id);
  emit();
};

const push = (tone: ToastTone, message: string) => {
  if (!message) return;
  const id = nextId++;
  items = [...items.filter((item) => item.message !== message), { id, tone, message }].slice(-4);
  emit();
  window.setTimeout(() => dismissToast(id), tone === "error" ? 7000 : 4000);
};

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

export const subscribeToToasts = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const currentToasts = () => items;
