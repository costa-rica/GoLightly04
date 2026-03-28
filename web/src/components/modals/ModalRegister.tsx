"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { register, googleAuth } from "@/lib/api/auth";
import {
  validateEmail,
  validatePassword,
} from "@/lib/utils/validation";
import { useAppDispatch } from "@/store/hooks";
import { showLoading, hideLoading } from "@/store/features/uiSlice";
import { login as loginAction } from "@/store/features/authSlice";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { logger } from "@/lib/logger";

interface ModalRegisterProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

export default function ModalRegister({
  isOpen,
  onClose,
  onSwitchToLogin,
}: ModalRegisterProps) {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setSuccessMessage("");
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email
    if (!validateEmail(normalizedEmail)) {
      setErrors({ email: "Please enter a valid email address" });
      return;
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setErrors({ password: passwordValidation.message });
      return;
    }

    setIsLoading(true);
    dispatch(showLoading("Creating your account..."));

    try {
      await register({ email: normalizedEmail, password });

      // Show success message
      setSuccessMessage(
        "Registration successful! Please check your email to verify your account before logging in.",
      );

      // Reset form
      setEmail("");
      setPassword("");

      // Automatically switch to login after 3 seconds
      timeoutRef.current = setTimeout(() => {
        onSwitchToLogin();
      }, 3000);
    } catch (error: any) {
      if (error.response?.status === 409) {
        setErrors({ general: "An account with this email already exists" });
      } else if (error.response?.data?.error?.message) {
        setErrors({ general: error.response.data.error.message });
      } else {
        setErrors({ general: "Registration failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
      dispatch(hideLoading());
    }
  };

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    logger.info("Google Sign-In button clicked in registration modal", {
      hasCredential: !!credentialResponse.credential,
    });

    if (!credentialResponse.credential) {
      logger.error("Google Sign-In failed: No credential received in registration");
      setErrors({ general: "Google Sign-In failed. Please try again." });
      return;
    }

    setIsLoading(true);
    setErrors({});
    dispatch(showLoading("Signing up with Google..."));

    try {
      logger.info("Sending Google registration request to API");
      const response = await googleAuth({ idToken: credentialResponse.credential });

      logger.info("Google registration successful", {
        userId: response.user.id,
        email: response.user.email,
        authProvider: response.user.authProvider,
        isAdmin: response.user.isAdmin,
      });

      // Update Redux state
      dispatch(
        loginAction({
          user: response.user,
          accessToken: response.accessToken,
        }),
      );

      // Close modal and reset form
      setEmail("");
      setPassword("");
      onClose();
    } catch (error: any) {
      logger.error("Google registration failed", {
        status: error.response?.status,
        errorCode: error.response?.data?.error?.code,
        errorMessage: error.response?.data?.error?.message,
      });

      if (error.response?.data?.error?.message) {
        setErrors({ general: error.response.data.error.message });
      } else {
        setErrors({ general: "Google Sign-In failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
      dispatch(hideLoading());
    }
  };

  const handleGoogleError = () => {
    logger.error("Google Sign-In error callback triggered in registration");
    setErrors({ general: "Google Sign-In failed. Please try again." });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-calm-400 hover:text-calm-600 transition"
          aria-label="Close modal"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Modal header */}
        <h2 className="mb-6 text-2xl font-display font-bold text-calm-900">
          Create Account
        </h2>

        {/* Success message */}
        {successMessage && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {/* Error message */}
        {errors.general && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {errors.general}
          </div>
        )}

        {/* Register form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email field */}
          <div>
            <label
              htmlFor="register-email"
              className="block text-sm font-medium text-calm-700 mb-1"
            >
              Email
            </label>
            <input
              type="email"
              id="register-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`input-field ${errors.email ? "border-red-500" : ""}`}
              placeholder="you@example.com"
              disabled={isLoading || !!successMessage}
              autoComplete="email"
              required
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Password field */}
          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-calm-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="register-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`input-field pr-10 ${errors.password ? "border-red-500" : ""}`}
                placeholder="••••••••"
                disabled={isLoading || !!successMessage}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-calm-500 transition hover:text-calm-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isLoading || !!successMessage}
              >
                {showPassword ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.9 9.9a3 3 0 104.2 4.2"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
            <p className="mt-1 text-xs text-calm-500">Minimum 4 characters</p>
          </div>

          {/* Register button */}
          <button
            type="submit"
            disabled={isLoading || !!successMessage}
            className="btn-primary w-full"
          >
            {isLoading ? "Creating account..." : "Register"}
          </button>
        </form>

        {/* Divider */}
        {!successMessage && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-calm-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-calm-500">Or sign up with</span>
              </div>
            </div>

            {/* Google Sign-In Button */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap={false}
                theme="outline"
                size="large"
                text="signup_with"
                width="384"
              />
            </div>
          </>
        )}

        {/* Login link */}
        {!successMessage && (
          <div className="mt-6 text-center text-sm text-calm-600">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-primary-600 hover:text-primary-700"
            >
              Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
