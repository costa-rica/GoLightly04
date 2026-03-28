import apiClient from './client';
import { User } from '@/store/features/authSlice';
import { logger } from '@/lib/logger';

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
  userId: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  accessToken: string;
  user: User;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface VerifyEmailResponse {
  message: string;
}

export interface GoogleAuthRequest {
  idToken: string;
}

export interface GoogleAuthResponse {
  message: string;
  accessToken: string;
  user: User;
}

// POST /users/register
export const register = async (data: RegisterRequest): Promise<RegisterResponse> => {
  const response = await apiClient.post<RegisterResponse>('/users/register', data);
  return response.data;
};

// POST /users/login
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/users/login', data);
  return response.data;
};

// POST /users/forgot-password
export const forgotPassword = async (data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> => {
  const response = await apiClient.post<ForgotPasswordResponse>('/users/forgot-password', data);
  return response.data;
};

// POST /users/reset-password
export const resetPassword = async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
  const response = await apiClient.post<ResetPasswordResponse>('/users/reset-password', data);
  return response.data;
};

// GET /users/verify
export const verifyEmail = async (token: string): Promise<VerifyEmailResponse> => {
  const response = await apiClient.get<VerifyEmailResponse>(`/users/verify?token=${token}`);
  return response.data;
};

// POST /users/google-auth
export const googleAuth = async (data: GoogleAuthRequest): Promise<GoogleAuthResponse> => {
  logger.info('Calling Google auth API endpoint', {
    endpoint: '/users/google-auth',
    hasToken: !!data.idToken,
  });

  try {
    const response = await apiClient.post<GoogleAuthResponse>('/users/google-auth', data);

    logger.info('Google auth API response received', {
      status: response.status,
      hasAccessToken: !!response.data.accessToken,
      userId: response.data.user?.id,
      authProvider: response.data.user?.authProvider,
    });

    return response.data;
  } catch (error: any) {
    logger.error('Google auth API call failed', {
      status: error.response?.status,
      errorCode: error.response?.data?.error?.code,
      errorMessage: error.response?.data?.error?.message,
    });
    throw error;
  }
};
