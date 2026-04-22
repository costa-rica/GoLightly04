import type { Metadata } from "next";
import "@/styles/globals.css";
import StoreProvider from "@/store/StoreProvider";
import AppShell from "@/components/AppShell";
import GoogleAuthProvider from "@/components/GoogleAuthProvider";
import AppLogger from "@/components/AppLogger";

export const metadata: Metadata = {
  title: "Go Lightly - Create Personalized Guided Meditations",
  description:
    "Create personalized lightly guided meditations that combine purposeful affirmations with contemplative silences, allowing you to balance guided reflection with spacious awareness.",
  icons: {
    icon: [
      {
        url: "/images/favicon_io/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/images/favicon_io/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      { url: "/images/favicon_io/favicon.ico" },
    ],
    apple: [
      {
        url: "/images/favicon_io/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/images/favicon_io/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AppLogger />
        <GoogleAuthProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </GoogleAuthProvider>
      </body>
    </html>
  );
}
