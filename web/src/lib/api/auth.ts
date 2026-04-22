import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  GoogleAuthRequest,
  GoogleAuthResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyEmailResponse,
} from "@golightly/shared-types";

import { logger } from "@/lib/logger";

import apiClient from "./client";

export const register = async (
  data: RegisterRequest,
): Promise<RegisterResponse> => {
  const response = await apiClient.post<RegisterResponse>("/users/register", data);
  return response.data;
};

export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>("/users/login", data);
  return response.data;
};

export const forgotPassword = async (
  data: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> => {
  const response = await apiClient.post<ForgotPasswordResponse>(
    "/users/forgot-password",
    data,
  );
  return response.data;
};

export const resetPassword = async (
  data: ResetPasswordRequest,
): Promise<ResetPasswordResponse> => {
  const response = await apiClient.post<ResetPasswordResponse>(
    "/users/reset-password",
    data,
  );
  return response.data;
};

export const verifyEmail = async (
  token: string,
): Promise<VerifyEmailResponse> => {
  const response = await apiClient.get<VerifyEmailResponse>(
    `/users/verify?token=${token}`,
  );
  return response.data;
};

export const googleAuth = async (
  data: GoogleAuthRequest,
): Promise<GoogleAuthResponse> => {
  logger.info("Calling Google auth API endpoint", {
    endpoint: "/users/google-auth",
    hasToken: !!data.idToken,
  });

  try {
    const response = await apiClient.post<GoogleAuthResponse>(
      "/users/google-auth",
      data,
    );

    logger.info("Google auth API response received", {
      status: response.status,
      hasAccessToken: !!response.data.accessToken,
      userId: response.data.user?.id,
      authProvider: response.data.user?.authProvider,
    });

    return response.data;
  } catch (error: any) {
    logger.error("Google auth API call failed", {
      status: error.response?.status,
      errorCode: error.response?.data?.error?.code,
      errorMessage: error.response?.data?.error?.message,
    });
    throw error;
  }
};
