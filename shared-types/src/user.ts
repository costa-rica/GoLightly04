export type AuthProvider = "local" | "google" | "both";

export type User = {
  id: number;
  email: string;
  isAdmin: boolean;
  authProvider: AuthProvider;
};

export type RegisterRequest = {
  email: string;
  password: string;
};

export type RegisterResponse = {
  message: string;
  userId: number;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  message: string;
  accessToken: string;
  user: User;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ForgotPasswordResponse = {
  message: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type ResetPasswordResponse = {
  message: string;
};

export type VerifyEmailResponse = {
  message: string;
};

export type GoogleAuthRequest = {
  idToken: string;
};

export type GoogleAuthResponse = {
  message: string;
  accessToken: string;
  user: User;
};
