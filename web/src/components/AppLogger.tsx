"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * AppLogger Component
 *
 * Logs application startup information to the console.
 * This runs once when the app initializes.
 */
export default function AppLogger() {
  useEffect(() => {
    const mode = process.env.NEXT_PUBLIC_MODE || "unknown";
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "not configured";
    const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    logger.info("Go Lightly application started", {
      mode,
      apiUrl,
      googleAuthConfigured: hasGoogleClientId,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "unknown",
    });
  }, []);

  return null; // This component doesn't render anything
}
