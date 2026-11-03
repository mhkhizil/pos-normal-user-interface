import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { API_CONFIG, API_ENDPOINTS } from "./constants";

const normalizeErrorText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeErrorText(item))
      .filter((item): item is string => Boolean(item));
    if (parts.length) return parts.join(". ");
  }
  if (value && typeof value === "object") {
    const payload = value as Record<string, unknown>;
    return (
      normalizeErrorText(payload.message) ||
      normalizeErrorText(payload.messages) ||
      normalizeErrorText(payload.errors)
    );
  }
  return undefined;
};

const readApiErrorMessage = (data: unknown): string | undefined => {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return undefined;
  const payload = data as Record<string, unknown>;
  const fromMessage = normalizeErrorText(payload.message);
  if (fromMessage) return fromMessage;
  const fromErrors = normalizeErrorText(payload.errors);
  if (fromErrors) return fromErrors;
  const nested = payload.error;
  if (typeof nested === "string" && nested.trim() && nested !== "Bad Request") {
    return nested.trim();
  }
  if (nested && typeof nested === "object") {
    return normalizeErrorText((nested as Record<string, unknown>).message);
  }
  return undefined;
};

export const applyAxiosErrorMessage = (error: unknown): unknown => {
  if (!axios.isAxiosError(error)) return error;
  const apiMessage = readApiErrorMessage(error.response?.data);
  if (
    error.response?.status === 429 ||
    /throttlerexception|too many requests/i.test(apiMessage || "")
  ) {
    error.message = "Too many requests. Wait a moment and try again.";
  } else if (apiMessage) {
    error.message = apiMessage;
  } else if (
    error.response?.status === 400 &&
    /^Request failed with status code 400$/i.test(error.message)
  ) {
    error.message = "Check the highlighted fields and try again.";
  }
  return error;
};
import {
  tokenCookies,
  isTokenExpired,
  isTokenExpiringSoon,
  getTimeUntilExpiration,
  clearAuthAndRedirectToLogin,
} from "@/lib/cookies";

type SignOutReason = "session_expired" | "signed_in_elsewhere";

const signOutReason = (message: unknown): SignOutReason =>
  /another device/i.test(String(message || "")) ? "signed_in_elsewhere" : "session_expired";

/** The server refused to renew the session: the staff member must sign in again. */
export class SessionEndedError extends Error {
  constructor(readonly reason: SignOutReason) {
    super("Authentication required");
  }
}

let renewing: Promise<string> | null = null;
const retriedRequests = new WeakSet<object>();

/**
 * Swaps the saved refresh token for a new pair, once at a time however many
 * requests ask. Rejects with SessionEndedError when the server says the session
 * is over; any other failure (no network) leaves the saved tokens alone.
 */
export const renewSession = (baseUrl: string = API_CONFIG.BASE_URL): Promise<string> => {
  const refreshToken = tokenCookies.getRefreshToken();
  if (!refreshToken) return Promise.reject(new SessionEndedError("session_expired"));
  renewing ??= axios
    .post(
      `${baseUrl}${API_ENDPOINTS.AUTH.REFRESH}`,
      { refresh_token: refreshToken },
      { withCredentials: false }
    )
    .then((response) => {
      const body = response.data as {
        access_token?: string;
        refresh_token?: string;
        data?: { access_token?: string; refresh_token?: string };
      };
      const pair = body?.access_token ? body : body?.data;
      if (!pair?.access_token) throw new SessionEndedError("session_expired");
      tokenCookies.setToken(pair.access_token);
      if (pair.refresh_token) tokenCookies.setRefreshToken(pair.refresh_token);
      return pair.access_token;
    })
    .catch((error: unknown) => {
      if (error instanceof SessionEndedError) throw error;
      const response = axios.isAxiosError(error) ? error.response : undefined;
      if (response?.status === 401 || response?.status === 403) {
        throw new SessionEndedError(signOutReason(response.data?.message));
      }
      throw error;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
};

/**
 * Base HTTP client using Axios
 * Handles common configuration and error handling for API requests
 * Implements CSRF protection for all non-GET requests (except login)
 * Includes JWT token expiration handling and automatic redirect
 */
export class HttpClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private csrfToken: string | null = null;
  private csrfSupported: boolean = true;
  private isRedirecting: boolean = false;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_CONFIG.BASE_URL;
    this.csrfToken = tokenCookies.getCsrfToken();

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
      },
      // JWT auth uses Authorization header; credentials cookies are not required
      // and break cross-origin login when the API CORS policy is strict.
      withCredentials: false,
    });

    // Add request interceptor for auth token and CSRF protection
    this.client.interceptors.request.use(
      async (config) => {
        let token = tokenCookies.getToken();

        // Renew the hour-long sign-in before it runs out, so a shift is never cut short.
        if (token && config.url !== API_ENDPOINTS.AUTH.SIGNIN && isTokenExpiringSoon(token, 5)) {
          try {
            token = await renewSession(this.baseUrl);
          } catch (error) {
            if (error instanceof SessionEndedError) {
              if (isTokenExpired(token)) {
                this.handleTokenExpiration(error.reason);
                return Promise.reject(error);
              }
            } else if (isTokenExpired(token)) {
              return Promise.reject(error);
            }
          }
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Handle FormData requests by removing Content-Type header
        // This allows the browser to set the proper multipart/form-data header with boundary
        if (config.data instanceof FormData) {
          delete config.headers["Content-Type"];
        }

        // CSRF Protection Logic
        // Skip CSRF for GET, HEAD, and OPTIONS requests
        if (
          ["GET", "HEAD", "OPTIONS"].includes(
            config.method?.toUpperCase() || ""
          )
        ) {
          return config;
        }

        // Skip CSRF for sign-in endpoint
        if (config.url === API_ENDPOINTS.AUTH.SIGNIN) {
          return config;
        }

        // Reuse an existing CSRF token if one was already established during
        // login or a previous session, but do not auto-fetch a new token here.
        // This prevents admin actions from triggering a fresh /csrf/token call
        // every time the first protected request is made.
        if (this.csrfSupported && this.csrfToken) {
          config.headers["X-CSRF-Token"] = this.csrfToken;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Handle token expiration or auth errors
        if (error.response?.status === 401) {
          const isLoginRequest = error.config?.url === API_ENDPOINTS.AUTH.SIGNIN;
          const isSessionRequest =
            error.config?.url === API_ENDPOINTS.AUTH.SESSION;
          const isOnLoginPage = window.location.pathname === "/login";

          if (!isLoginRequest && !isOnLoginPage && !isSessionRequest) {
            const reason = signOutReason(error.response?.data?.message);
            // A sign-in that ran out mid-request: renew it and send the request once more.
            if (reason === "session_expired" && error.config && !retriedRequests.has(error.config)) {
              try {
                const token = await renewSession(this.baseUrl);
                retriedRequests.add(error.config);
                error.config.headers.Authorization = `Bearer ${token}`;
                return this.client.request(error.config);
              } catch (renewError) {
                if (!(renewError instanceof SessionEndedError)) {
                  return Promise.reject(renewError);
                }
                this.handleTokenExpiration(renewError.reason);
                return Promise.reject(renewError);
              }
            }
            this.handleTokenExpiration(reason);
            return Promise.reject(new Error("Authentication required"));
          }

          return Promise.reject(error);
        }

        if (error.response?.status === 403) {
          const isSessionRequest =
            error.config?.url === API_ENDPOINTS.AUTH.SESSION;
          const isOnLoginPage = window.location.pathname === "/login";

          if (isSessionRequest && isOnLoginPage) {
            tokenCookies.clearAll();
            return Promise.reject(error);
          }
        }

        // Handle CSRF token errors
        if (
          error.response?.status === 403 &&
          error.response?.data?.message?.includes("CSRF")
        ) {
          // Clear CSRF token and retry
          this.csrfToken = null;
          this.csrfSupported = true;
          tokenCookies.removeCsrfToken();
          console.error("CSRF token invalid, please retry");
        }

        applyAxiosErrorMessage(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle token expiration by clearing tokens and redirecting to login
   */
  private handleTokenExpiration(reason = "session_expired"): void {
    if (this.isRedirecting) return; // Prevent multiple redirects

    this.isRedirecting = true;

    // Clear all tokens
    this.csrfToken = null;
    this.csrfSupported = true;

    // Show user-friendly message
    console.log("Your session has expired. Please log in again.");

    clearAuthAndRedirectToLogin(reason);
  }

  /**
   * Check if current token is valid (not expired)
   */
  public isTokenValid(): boolean {
    const token = tokenCookies.getToken();
    if (!token) return false;
    return !isTokenExpired(token);
  }

  /**
   * Check if current token is expiring soon
   */
  public isTokenExpiringSoon(warningMinutes: number = 5): boolean {
    const token = tokenCookies.getToken();
    if (!token) return false;
    return isTokenExpiringSoon(token, warningMinutes);
  }

  /**
   * Get time until token expires in seconds
   */
  public getTimeUntilExpiration(): number {
    const token = tokenCookies.getToken();
    if (!token) return 0;

    return getTimeUntilExpiration(token);
  }

  /**
   * Manually refresh CSRF token
   * Useful when token expires or becomes invalid
   */
  async refreshCsrfToken(): Promise<string | null> {
    try {
      const token = tokenCookies.getToken();
      if (!token) {
        throw new Error("No JWT token available");
      }

      if (!this.csrfSupported) {
        return null;
      }

      const response = await axios.get(
        `${this.baseUrl}${API_ENDPOINTS.CSRF.TOKEN}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: false,
        }
      );

      this.csrfToken = response.data.token;
      if (this.csrfToken) {
        tokenCookies.setCsrfToken(this.csrfToken);
      }
      return this.csrfToken;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.csrfSupported = false;
      } else {
        console.error("Failed to refresh CSRF token:", error);
      }
      this.csrfToken = null;
      tokenCookies.removeCsrfToken();
      return null;
    }
  }

  /**
   * Clear CSRF token (useful for logout)
   */
  clearCsrfToken(): void {
    this.csrfToken = null;
    this.csrfSupported = true;
    tokenCookies.removeCsrfToken();
  }

  /**
   * Make a GET request
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  /**
   * Make a POST request
   */
  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(
      url,
      data,
      config
    );
    return response.data;
  }

  /**
   * Make a PUT request
   */
  async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(
      url,
      data,
      config
    );
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }
}
