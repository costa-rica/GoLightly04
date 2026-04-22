"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { logger } from "@/lib/logger";
import { useEffect } from "react";

export default function GoogleAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      logger.error("Google OAuth provider initialization failed", {
        reason: "NEXT_PUBLIC_GOOGLE_CLIENT_ID is not defined",
      });
    } else {
      logger.info("Google OAuth provider initialized", {
        clientIdConfigured: true,
        clientIdPrefix: clientId.substring(0, 20) + "...",
      });
    }
  }, [clientId]);

  if (!clientId) {
    return <>{children}</>;
  }

  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
