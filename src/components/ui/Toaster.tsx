import { useSyncExternalStore } from "react";
import {
  currentToasts,
  dismissToast,
  subscribeToToasts,
  type ToastTone,
} from "@/lib/toast";

const accent: Record<ToastTone, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  info: "bg-slate-400",
};

export function Toaster() {
  const visible = useSyncExternalStore(subscribeToToasts, currentToasts);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {visible.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-start gap-3 rounded-md border border-slate-700 bg-slate-900/95 px-3 py-2.5 text-sm text-slate-100 shadow-lg shadow-black/40 backdrop-blur"
        >
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${accent[item.tone]}`} />
          <p className="min-w-0 flex-1 break-words">{item.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 text-slate-500 hover:text-slate-200"
            onClick={() => dismissToast(item.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
