"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/api/auth";
import { validateEmail } from "@/lib/utils/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await forgotPassword({ email: normalizedEmail });
      setSuccess("Password reset link sent to email.");
      setEmail("");
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setError("Email not found.");
      } else {
        setError(err?.response?.data?.error?.message || "Unable to send reset link.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16">
        <div className="rounded-3xl border border-calm-200/70 bg-white/90 p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Account help</p>
          <h1 className="mt-3 text-3xl font-display font-semibold text-calm-900">Forgot password</h1>
          <p className="mt-3 text-sm text-calm-600">
            Enter your email and we will send a reset link.
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
              <label htmlFor="email" className="block text-sm font-semibold text-calm-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-calm-200 px-3 py-2 text-sm text-calm-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                placeholder="you@example.com"
                disabled={isSubmitting}
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 text-xs text-calm-500">
            <Link href="/?login=1" className="font-semibold text-primary-700 hover:text-primary-800">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
