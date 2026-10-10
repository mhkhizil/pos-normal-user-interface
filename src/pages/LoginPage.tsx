import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/core/presentation/hooks/useAuth";
import { APP_VERSION } from "@/lib/appVersion";

const inputClassName =
  "w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#3ec4ff] focus:ring-2 focus:ring-[#3ec4ff]/30";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.1" />
      <path d="M6.1 6.1C4 7.7 2.5 10 2 12s3.5 7 10 7c1.4 0 2.7-.2 3.9-.6" />
    </svg>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, user, isAuthenticated, isLoading, error } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } })?.from
    ?.pathname;
  const sessionExpired = searchParams.get("reason") === "session_expired";

  if (isAuthenticated && user) {
    return <Navigate to={from || "/cashier"} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    try {
      await login({
        userId: userId.trim(),
        password,
      });
      navigate(from || "/cashier", { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("login.errorFallback");
      setLocalError(message);
    }
  };

  return (
    <section className="flex h-dvh items-center justify-center overflow-y-auto bg-black px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0c] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt=""
            className="mx-auto -my-6 h-44 w-44 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {t("login.title")}
          </h1>
          <p className="mt-2 text-sm text-white/55">
            {t("login.subtitle")}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-white/80"
              htmlFor="userId"
            >
              {t("login.userIdLabel")}
            </label>
            <input
              id="userId"
              className={inputClassName}
              type="text"
              autoComplete="username"
              placeholder={t("login.userIdPlaceholder")}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-white/80"
              htmlFor="password"
            >
              {t("login.passwordLabel")}
            </label>
            <div className="relative">
              <input
                id="password"
                className={`${inputClassName} pr-11`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/50 hover:bg-white/10"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword
                    ? t("login.hidePassword")
                    : t("login.showPassword")
                }
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {(sessionExpired || localError || error) && (
            <p className="rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {localError ||
                error ||
                (sessionExpired ? t("login.sessionExpired") : null)}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            className="!border-transparent !bg-gradient-to-r !from-[#ffc83d] !via-[#ff8a1a] !to-[#ff5a00] !text-black !focus:ring-[#3ec4ff]/50"
          >
            {isLoading ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-white/35">
          {t("shell.appVersion", { version: APP_VERSION })}
        </p>
      </div>
    </section>
  );
}
