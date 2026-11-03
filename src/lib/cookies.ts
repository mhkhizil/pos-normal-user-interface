/**
 * Cookie utility functions for secure token storage
 * Provides methods to set, get, and remove cookies with proper security settings
 * Falls back to sessionStorage if cookies are not available
 */

interface CookieOptions {
  expires?: Date;
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  httpOnly?: boolean;
}

/**
 * JWT Token utilities for validation and expiration checking
 */
interface JWTPayload {
  sub: string; // Subject (user ID)
  email: string;
  role: string;
  iat: number; // Issued at
  exp: number; // Expires at
}

/**
 * Decode JWT token without verification (client-side only)
 * Note: This doesn't verify the signature, only decodes the payload
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode JWT token:", error);
    return null;
  }
}

const CLOCK_SKEW_KEY = "wms_clock_skew";

/**
 * The server's time in seconds. A tablet clock that is off would otherwise make
 * a fresh token look expired, or an expired one look fresh.
 */
function serverNow(): number {
  const skew =
    typeof window === "undefined" ? 0 : Number(sessionStorage.getItem(CLOCK_SKEW_KEY)) || 0;
  return Math.floor(Date.now() / 1000) + skew;
}

/** Learns how far this device's clock is from the server's, from a token it just issued. */
function learnClockSkew(token: string): void {
  const payload = decodeJWT(token);
  if (typeof window === "undefined" || typeof payload?.iat !== "number") return;
  sessionStorage.setItem(CLOCK_SKEW_KEY, String(payload.iat - Math.floor(Date.now() / 1000)));
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || typeof payload.exp !== "number") {
    // Opaque or non-standard tokens must be validated by the API, not the client.
    return false;
  }

  return payload.exp < serverNow();
}

/**
 * Check if JWT token will expire soon (within 5 minutes)
 */
export function isTokenExpiringSoon(
  token: string,
  warningMinutes: number = 5
): boolean {
  const payload = decodeJWT(token);
  if (!payload || typeof payload.exp !== "number") return false;

  const warningTime = warningMinutes * 60; // Convert to seconds
  return payload.exp - serverNow() < warningTime;
}

/**
 * Get token expiration time as Date object
 */
export function getTokenExpiration(token: string): Date | null {
  const payload = decodeJWT(token);
  if (!payload) return null;

  return new Date(payload.exp * 1000);
}

/**
 * Get time until token expires in seconds
 */
export function getTimeUntilExpiration(token: string): number {
  const payload = decodeJWT(token);
  if (!payload) return 0;

  return Math.max(0, payload.exp - serverNow());
}

export function clearAuthAndRedirectToLogin(reason?: string): void {
  tokenCookies.clearAll();

  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    window.location.href = `/login${params}`;
  }
}

/**
 * Set a cookie with secure defaults
 */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  const {
    expires,
    maxAge,
    path = "/",
    domain,
    secure = typeof window !== "undefined" && window.location.protocol === "https:",
    sameSite = "Strict",
    httpOnly = false,
  } = options;

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (expires) {
    cookieString += `; expires=${expires.toUTCString()}`;
  }

  if (maxAge) {
    cookieString += `; max-age=${maxAge}`;
  }

  if (path) {
    cookieString += `; path=${path}`;
  }

  if (domain) {
    cookieString += `; domain=${domain}`;
  }

  if (secure) {
    cookieString += "; secure";
  }

  if (sameSite) {
    cookieString += `; samesite=${sameSite}`;
  }

  if (httpOnly) {
    cookieString += "; httponly";
  }

  // Note: httpOnly cookies can only be set by the server
  // For client-side cookies, we'll use secure defaults
  document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  const nameEQ = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length));
    }
  }

  return null;
}

/**
 * Remove a cookie by setting it to expire in the past
 */
export function removeCookie(name: string, path: string = "/"): void {
  document.cookie = `${encodeURIComponent(
    name
  )}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
}

/**
 * Check if cookies are supported/enabled
 */
export function areCookiesEnabled(): boolean {
  try {
    const testCookie = "test_cookie";
    setCookie(testCookie, "test", { maxAge: 1 });
    const exists = getCookie(testCookie) !== null;
    removeCookie(testCookie);
    return exists;
  } catch {
    return false;
  }
}

/**
 * Secure storage interface that uses cookies when available, falls back to sessionStorage
 */
class SecureStorage {
  private useCookies: boolean;

  constructor() {
    this.useCookies = areCookiesEnabled();
  }

  setItem(key: string, value: string): void {
    if (this.useCookies) {
      setCookie(key, value, {
        maxAge: 24 * 60 * 60, // 24 hours
        path: "/",
        secure:
          typeof window !== "undefined" &&
          window.location.protocol === "https:",
        sameSite: "Strict",
      });
    } else {
      // Fallback to sessionStorage (more secure than localStorage)
      sessionStorage.setItem(key, value);
    }
  }

  getItem(key: string): string | null {
    if (this.useCookies) {
      return getCookie(key);
    } else {
      return sessionStorage.getItem(key);
    }
  }

  removeItem(key: string): void {
    if (this.useCookies) {
      removeCookie(key);
    } else {
      sessionStorage.removeItem(key);
    }
  }

  clear(): void {
    if (this.useCookies) {
      removeCookie("wms_token");
      removeCookie("wms_user");
      removeCookie("wms_csrf_token");
    } else {
      sessionStorage.removeItem("wms_token");
      sessionStorage.removeItem("wms_user");
      sessionStorage.removeItem("wms_csrf_token");
    }
  }
}

// Create singleton instance
const secureStorage = new SecureStorage();

// Auth session keys — stored in sessionStorage because backend JWTs with large
// permission payloads exceed browser cookie size limits (~4KB).
const AUTH_TOKEN_KEY = "wms_token";
const AUTH_USER_KEY = "wms_user";
const CSRF_TOKEN_KEY = "wms_csrf_token";
const REFRESH_TOKEN_KEY = "wms_refresh_token";

const readSessionValue = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(key);
};

const writeSessionValue = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, value);
};

const removeSessionValue = (key: string): void => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key);
};

/**
 * Token-specific storage functions.
 * Auth token/user use sessionStorage; CSRF may use the smaller cookie path.
 */
export const tokenCookies = {
  setToken: (token: string) => {
    writeSessionValue(AUTH_TOKEN_KEY, token);
    learnClockSkew(token);
  },

  setRefreshToken: (token: string) => {
    writeSessionValue(REFRESH_TOKEN_KEY, token);
  },

  getRefreshToken: (): string | null => readSessionValue(REFRESH_TOKEN_KEY),

  getToken: (): string | null => {
    const fromSession = readSessionValue(AUTH_TOKEN_KEY);
    if (fromSession) return fromSession;

    // Migrate legacy cookie storage if present.
    const fromCookie = getCookie(AUTH_TOKEN_KEY);
    if (fromCookie) {
      writeSessionValue(AUTH_TOKEN_KEY, fromCookie);
      removeCookie(AUTH_TOKEN_KEY);
      return fromCookie;
    }

    return null;
  },

  removeToken: () => {
    removeSessionValue(AUTH_TOKEN_KEY);
    removeCookie(AUTH_TOKEN_KEY);
  },

  setUser: (userData: string) => {
    writeSessionValue(AUTH_USER_KEY, userData);
  },

  getUser: (): string | null => {
    const fromSession = readSessionValue(AUTH_USER_KEY);
    if (fromSession) return fromSession;

    const fromCookie = getCookie(AUTH_USER_KEY);
    if (fromCookie) {
      writeSessionValue(AUTH_USER_KEY, fromCookie);
      removeCookie(AUTH_USER_KEY);
      return fromCookie;
    }

    return null;
  },

  removeUser: () => {
    removeSessionValue(AUTH_USER_KEY);
    removeCookie(AUTH_USER_KEY);
  },

  setCsrfToken: (token: string) => {
    secureStorage.setItem(CSRF_TOKEN_KEY, token);
  },

  getCsrfToken: (): string | null => {
    return secureStorage.getItem(CSRF_TOKEN_KEY);
  },

  removeCsrfToken: () => {
    secureStorage.removeItem(CSRF_TOKEN_KEY);
  },

  clearAll: () => {
    removeSessionValue(AUTH_TOKEN_KEY);
    removeSessionValue(REFRESH_TOKEN_KEY);
    removeSessionValue(CLOCK_SKEW_KEY);
    removeSessionValue(AUTH_USER_KEY);
    removeSessionValue(CSRF_TOKEN_KEY);
    removeCookie(AUTH_TOKEN_KEY);
    removeCookie(AUTH_USER_KEY);
    removeCookie(CSRF_TOKEN_KEY);
    secureStorage.removeItem(CSRF_TOKEN_KEY);
  },
};
