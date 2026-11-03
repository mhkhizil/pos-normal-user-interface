import axios from "axios";
import { User } from "../../domain/entities/User";
import { IAuthRepository } from "../../domain/repositories/IAuthRepository";
import { HttpClient, renewSession } from "../api/HttpClient";
import { API_ENDPOINTS, API_CONFIG } from "../api/constants";
import { isTokenExpired, tokenCookies } from "@/lib/cookies";
import {
  ApiEnvelopeDTO,
  AuthResultDTO,
  AuthSessionPayloadDTO,
  BranchAccessDTO,
  SetActiveBranchRequestDTO,
  SignInRequestDTO,
} from "../../application/dtos/AuthDTO";

/**
 * API response types for auth endpoints
 */
interface ApiAuthUser {
  id: string;
  email?: string;
  username?: string;
  loginId?: string;
  fullName?: string;
  type?: string;
  tenantId?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  profileImageUrl?: string;
  activeBranch?: string;
  access?: BranchAccessDTO[];
  createdDate?: string;
  updatedDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Auth Repository implementation for API calls
 * Handles authentication through HTTP API
 */
export class ApiAuthRepository implements IAuthRepository {
  private httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Login user with User ID (username) and password
   */
  async login(payload: SignInRequestDTO): Promise<AuthResultDTO> {
    try {
      this.clearPersistedAuthenticatedSession();
      const response = await this.httpClient.post<ApiEnvelopeDTO<AuthSessionPayloadDTO>>(
        API_ENDPOINTS.AUTH.SIGNIN,
        payload
      );
      return this.persistSessionFromEnvelope(response);
    } catch (error: unknown) {
      console.error("Error during login:", error);

      throw new Error(this.resolveApiErrorMessage(error, "Unable to sign in"));
    }
  }

  async setActiveBranch(payload: SetActiveBranchRequestDTO): Promise<AuthResultDTO> {
    try {
      const response = await this.httpClient.post<ApiEnvelopeDTO<AuthSessionPayloadDTO>>(
        API_ENDPOINTS.AUTH.SET_ACTIVE_BRANCH,
        payload
      );
      return this.persistSessionFromEnvelope(response);
    } catch (error: unknown) {
      console.error("Error switching active branch:", error);

      throw new Error(
        this.resolveApiErrorMessage(error, "Unable to switch branch")
      );
    }
  }

  private persistAuthenticatedSession(token: string, user: User): void {
    tokenCookies.setToken(token);
    tokenCookies.setUser(JSON.stringify(user));
  }

  private clearPersistedAuthenticatedSession(): void {
    tokenCookies.clearAll();
  }

  async checkSession(): Promise<void> {
    await this.httpClient.get<unknown>(API_ENDPOINTS.AUTH.PING);
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // Clear CSRF token
      this.httpClient.clearCsrfToken();

      // Clear stored data from all client-side auth storage
      this.clearPersistedAuthenticatedSession();
    } catch (error) {
      console.error("Error during logout:", error);
    }
  }

  /**
   * Restore session from login/signin response stored locally.
   * Unlike NextAuth, this app uses JWT + local cache instead of a server session cookie.
   */
  async getCurrentUser(): Promise<User | null> {
    const token = tokenCookies.getToken();
    if (!token) {
      this.clearPersistedAuthenticatedSession();
      return null;
    }

    if (isTokenExpired(token)) {
      try {
        await renewSession();
      } catch {
        this.clearPersistedAuthenticatedSession();
        return null;
      }
    }

    const cachedUser = this.restoreCachedUser();
    if (cachedUser) {
      return cachedUser;
    }

    try {
      const sessionResponse =
        await this.httpClient.get<ApiEnvelopeDTO<AuthSessionPayloadDTO>>(
          API_ENDPOINTS.AUTH.SESSION
        );
      const result = this.persistSessionFromEnvelope(sessionResponse);
      return result.user;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        [401, 403].includes(error.response?.status ?? 0)
      ) {
        this.clearPersistedAuthenticatedSession();
        return null;
      }

      console.error("Error getting current user:", error);
      return null;
    }
  }

  private restoreCachedUser(): User | null {
    const userJson = tokenCookies.getUser();
    if (!userJson) return null;

    try {
      const parsed = JSON.parse(userJson) as Partial<User> & Partial<ApiAuthUser>;
      if (!parsed.id || !parsed.name) return null;

      return this.mapApiResponseToUser(
        {
          id: String(parsed.id),
          email: parsed.email ? String(parsed.email) : undefined,
          username: parsed.username || parsed.loginId,
          loginId: parsed.loginId || parsed.username,
          fullName: parsed.fullName || parsed.name,
          name: parsed.name,
          tenantId: parsed.tenantId,
          role: parsed.role,
          permissions: parsed.permissions,
          profileImageUrl: parsed.profileImageUrl,
          activeBranch: parsed.activeBranchId || parsed.activeBranch,
        },
        parsed.activeBranchId || parsed.activeBranch,
        parsed.branchAccess || []
      );
    } catch {
      return null;
    }
  }

  /**
   * Map API response to User entity
   */
  private mapApiResponseToUser(
    apiUser: ApiAuthUser,
    activeBranch?: string,
    access: BranchAccessDTO[] = []
  ): User {
    const activeBranchAccess = this.resolveActiveBranchAccess(access, activeBranch);
    const normalizedRole = this.normalizeRole(activeBranchAccess.roles, apiUser.role);
    const rolePermissions = this.resolvePermissions(activeBranchAccess.permissions, access);

    const loginId =
      apiUser.loginId || apiUser.username
        ? String(apiUser.loginId || apiUser.username)
        : undefined;

    return new User({
      id: String(apiUser.id),
      name: apiUser.fullName || apiUser.name || "",
      nickname: apiUser.fullName || apiUser.name || "",
      email: apiUser.email || "",
      loginId,
      tenantId: apiUser.tenantId,
      phone: "",
      role: normalizedRole,
      adminRoleName: activeBranchAccess.roles[0],
      permissions: rolePermissions,
      activeBranchId: activeBranch || apiUser.activeBranch,
      branchAccess: access,
      profileImageUrl: this.convertToFullUrl(apiUser.profileImageUrl),
      createdDate: new Date(apiUser.createdDate || apiUser.createdAt || Date.now()),
      updatedDate: new Date(apiUser.updatedDate || apiUser.updatedAt || Date.now()),
    });
  }

  /**
   * Convert relative URL to full URL
   */
  private convertToFullUrl(url?: string): string | undefined {
    if (!url) {
      return undefined;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `${API_CONFIG.BASE_URL}${url}`;
  }

  private resolveApiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data as
        | { message?: string; error?: { message?: string } }
        | undefined;
      const message = payload?.error?.message || payload?.message;
      if (message) return String(message);
      if (error.message) return error.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private persistSessionFromEnvelope(
    envelope: ApiEnvelopeDTO<AuthSessionPayloadDTO> | AuthSessionPayloadDTO
  ): AuthResultDTO {
    const session = this.unwrapSessionPayload(envelope);
    const accessToken =
      session.access_token ||
      (session as { accessToken?: string }).accessToken;

    if (!accessToken) {
      throw new Error("Auth response did not include access_token");
    }
    if (!session?.user) {
      throw new Error("Auth response did not include user");
    }

    const access = Array.isArray(session.access) ? session.access : [];
    const user = this.mapApiResponseToUser(
      session.user,
      session.activeBranch,
      access
    );

    this.persistAuthenticatedSession(accessToken, user);
    if (session.refresh_token) tokenCookies.setRefreshToken(session.refresh_token);

    if (!tokenCookies.getToken()) {
      throw new Error("Unable to save login session in this browser");
    }

    return {
      token: accessToken,
      user,
      activeBranch: session.activeBranch,
      access,
    };
  }

  private unwrapSessionPayload(
    envelope: ApiEnvelopeDTO<AuthSessionPayloadDTO> | AuthSessionPayloadDTO
  ): AuthSessionPayloadDTO {
    let current: unknown = envelope;

    while (current && typeof current === "object" && "data" in current) {
      const nested = (current as { data?: unknown }).data;
      if (!nested || nested === current) break;
      current = nested;
    }

    return current as AuthSessionPayloadDTO;
  }

  private resolveActiveBranchAccess(
    access: BranchAccessDTO[],
    activeBranch?: string
  ): BranchAccessDTO {
    const fallback: BranchAccessDTO = {
      branchId: activeBranch || "",
      roles: [],
      permissions: [],
    };
    if (!Array.isArray(access) || access.length === 0) return fallback;

    if (activeBranch) {
      const selected = access.find((entry) => entry.branchId === activeBranch);
      if (selected) return selected;
    }

    return access[0];
  }

  private normalizeRole(
    branchRoles: string[],
    fallbackRole?: string
  ): "ADMIN" | "STAFF" {
    const roleCandidates = [
      ...branchRoles,
      String(fallbackRole || ""),
    ]
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    const hasAdminRole = roleCandidates.some((value) =>
      ["ADMIN", "ROOT_ADMIN", "SUPER_ADMIN", "OWNER"].includes(value)
    );

    return hasAdminRole ? "ADMIN" : "STAFF";
  }

  private resolvePermissions(
    activeBranchPermissions: string[],
    access: BranchAccessDTO[]
  ): string[] {
    const source = activeBranchPermissions.length
      ? activeBranchPermissions
      : access.flatMap((entry) =>
          Array.isArray(entry.permissions) ? entry.permissions : []
        );

    return Array.from(
      new Set(
        source
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }
}
