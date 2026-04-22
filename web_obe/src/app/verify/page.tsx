"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyEmail } from "@/lib/api/auth";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      // Missing token - redirect to home with error
      const errorTitle = "Verification Link Invalid";
      const errorMessage = "Verification token is missing. Please check your email and try again.";
      router.push(
        `/?verify_error=1&error_title=${encodeURIComponent(errorTitle)}&error_message=${encodeURIComponent(errorMessage)}`
      );
      return;
    }

    const runVerification = async () => {
      try {
        const response = await verifyEmail(token);
        setStatus("success");
        setMessage(response.message || "Email verified successfully.");
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push("/?login=1");
        }, 2000);
      } catch (err: any) {
        // Handle errors by redirecting to home with error modal
        let errorTitle = "Verification Failed";
        let errorMessage = "Unable to verify your email. Please try again.";

        const errorCode = err?.response?.data?.error?.code;
        const apiMessage = err?.response?.data?.error?.message;

        if (errorCode === "TOKEN_EXPIRED") {
          errorTitle = "Verification Link Expired";
          errorMessage = apiMessage || "This verification link has expired. Please request a new verification email.";
        } else if (errorCode === "INVALID_TOKEN") {
          errorTitle = "Invalid Verification Link";
          errorMessage = apiMessage || "This verification link is invalid. Please contact support if you need assistance.";
        } else if (apiMessage) {
          errorMessage = apiMessage;
        }

        router.push(
          `/?verify_error=1&error_title=${encodeURIComponent(errorTitle)}&error_message=${encodeURIComponent(errorMessage)}`
        );
      }
    };

    runVerification();
  }, [router, searchParams]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16">
        <div className="rounded-3xl border border-calm-200/70 bg-white/90 p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Email verification</p>
          <h1 className="mt-3 text-3xl font-display font-semibold text-calm-900">
            {status === "success" ? "Verified" : "Please wait"}
          </h1>
          <p className="mt-3 text-sm text-calm-600">{message}</p>

          {status === "success" && (
            <p className="mt-4 text-xs text-calm-500">
              Redirecting you to login...
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
