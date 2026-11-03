import { User } from "../../domain/entities/User";

export type AuthSignInTypeDTO = "user";

export interface BranchAccessDTO {
  branchId: string;
  roles: string[];
  permissions: string[];
}

export interface LoginInputDTO {
  userId: string;
  password: string;
}

export interface SignInRequestDTO {
  userId: string;
  password: string;
  type: AuthSignInTypeDTO;
  /** "pos": the account is signed in on this device only; the one before is signed out. */
  app?: "pos";
}

export interface SetActiveBranchRequestDTO {
  branchId: string;
}

export interface AuthSessionUserDTO {
  id: string;
  email?: string;
  username?: string;
  loginId?: string;
  fullName: string;
  type: string;
  tenantId: string;
}

export interface AuthSessionPayloadDTO {
  access_token: string;
  /** Lasts 7 days; swapped at /auth/refresh before the hour-long access_token runs out. */
  refresh_token?: string;
  user: AuthSessionUserDTO;
  activeBranch: string;
  access: BranchAccessDTO[];
}

export interface ApiEnvelopeDTO<T> {
  success?: boolean;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
  data: T;
}

export interface AuthResultDTO {
  user: User;
  token: string;
  activeBranch: string;
  access: BranchAccessDTO[];
}
