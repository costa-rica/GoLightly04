"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { resetPassword } from "@/lib/api/auth";
import { validatePassword } from "@/lib/utils/validation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message || "Password is invalid.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token, newPassword: password });
      setSuccess("Password reset successfully. Redirecting to login...");
      setPassword("");
      setTimeout(() => router.push("/?login=1"), 2000);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Reset token has expired. Please request a new reset link.");
      } else {
        setError(err?.response?.data?.error?.message || "Unable to reset password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16">
        <div className="rounded-3xl border border-calm-200/70 bg-white/90 p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Password reset</p>
          <h1 className="mt-3 text-3xl font-display font-semibold text-calm-900">Set a new password</h1>
          <p className="mt-3 text-sm text-calm-600">
            Choose a new password for your account.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-calm-700">
                New password
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-calm-200 px-3 py-2 pr-10 text-sm text-calm-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-calm-500 transition hover:text-calm-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isSubmitting}
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
            </div>

            <button
              type="submit"
              className="w-full rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Reset password"}
            </button>
          </form>

          <div className="mt-6 text-xs text-calm-500">
            <Link href="/forgot-password" className="font-semibold text-primary-700 hover:text-primary-800">
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
