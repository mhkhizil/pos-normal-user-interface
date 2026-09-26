import { FormEvent, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { CardCaptureStatus } from "@/components/ui/CardCaptureStatus";
import { useCardCapture } from "@/core/presentation/hooks/useCardCapture";

export function CardTapDialog({
  title,
  children,
  error,
  isBusy,
  onCardRead,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  error?: string | null;
  isBusy: boolean;
  onCardRead: (uid: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [uid, setUid] = useState("");
  const { nfcSupported, nfcActive, nfcError, lastUid, startNfc } = useCardCapture({
    enabled: !isBusy,
    onRead: onCardRead,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (uid.trim()) onCardRead(uid.trim());
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-lg border border-teal-500 bg-slate-950 p-5"
        onSubmit={submit}
      >
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("spa.tapPrompt")}</p>
        </div>
        {children ? (
          <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
            {children}
          </div>
        ) : null}
        <CardCaptureStatus
          nfcSupported={nfcSupported}
          nfcActive={nfcActive}
          nfcError={nfcError}
          lastUid={lastUid}
          onEnableNfc={() => void startNfc()}
        />
        <div className="flex gap-2">
          <input
            value={uid}
            onChange={(event) => setUid(event.target.value)}
            placeholder={t("spa.cardUid")}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
          <Button type="submit" isLoading={isBusy} disabled={!uid.trim()}>
            {t("spa.checkCard")}
          </Button>
        </div>
        {error ? (
          <p className="rounded border border-red-500/60 bg-red-950/50 p-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
