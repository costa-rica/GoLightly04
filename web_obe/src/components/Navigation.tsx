"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/features/authSlice";
import { clearAuthStorage } from "@/lib/utils/auth";
import Toast from "@/components/Toast";

type NavigationProps = {
  onLoginClick?: () => void;
};

export default function Navigation({ onLoginClick }: NavigationProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isAdminPage = pathname?.startsWith("/admin");

  useEffect(() => {
    if (!isMobileOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileOpen]);

  const handleAuthClick = () => {
    if (isAuthenticated) {
      dispatch(logout());
      clearAuthStorage();
      setToastMessage("You have been logged out.");
      router.push("/");
      setIsMobileOpen(false);
      return;
    }

    onLoginClick?.();
    setIsMobileOpen(false);
  };

  const handleCloseMobile = () => setIsMobileOpen(false);

  // Determine what navigation links to show
  const getNavLinks = () => {
    // Not logged in: no nav links
    if (!isAuthenticated) {
      return null;
    }

    // Logged in, not admin, on homepage: no nav links
    if (!user?.isAdmin && !isAdminPage) {
      return null;
    }

    // Logged in as admin on admin page: show Home
    if (user?.isAdmin && isAdminPage) {
      return (
        <Link
          href="/"
          className="text-sm font-semibold text-calm-700 hover:text-primary-700 transition"
          onClick={handleCloseMobile}
        >
          Home
        </Link>
      );
    }

    // Logged in as admin on homepage: show Admin
    if (user?.isAdmin && !isAdminPage) {
      return (
        <Link
          href="/admin"
          className="text-sm font-semibold text-calm-700 hover:text-primary-700 transition"
          onClick={handleCloseMobile}
        >
          Admin
        </Link>
      );
    }

    return null;
  };

  const navLinks = getNavLinks();

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="bg-white/80 backdrop-blur border-b border-calm-200/70 shadow-sm">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/golightlyLogo02.png"
                alt="Go Lightly"
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="font-display text-lg font-semibold text-calm-900">
                Go Lightly
              </span>
            </Link>

            <div className="hidden items-center gap-3 md:flex">
              {navLinks}
              <button
                type="button"
                onClick={handleAuthClick}
                className="rounded-full border border-calm-300 px-4 py-2 text-sm font-semibold text-calm-700 transition hover:border-primary-300 hover:text-primary-700"
              >
                {isAuthenticated ? "Logout" : "Login"}
              </button>
            </div>

            <button
              type="button"
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-calm-200 text-calm-700 transition hover:border-primary-300 hover:text-primary-700"
              aria-label="Open navigation menu"
              aria-expanded={isMobileOpen}
              onClick={() => setIsMobileOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <div className="flex flex-col gap-1">
                <span className="h-0.5 w-5 rounded-full bg-current" />
                <span className="h-0.5 w-5 rounded-full bg-current" />
                <span className="h-0.5 w-5 rounded-full bg-current" />
              </div>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 md:hidden ${
          isMobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          className={`absolute inset-0 bg-calm-900/35 backdrop-blur-sm transition-opacity ${
            isMobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={handleCloseMobile}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-3/4 max-w-xs flex-col gap-6 bg-white px-6 py-6 shadow-xl transition-transform ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-3"
              onClick={handleCloseMobile}
            >
              <Image
                src="/images/golightlyLogo02.png"
                alt="GoLightly"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="font-display text-base font-semibold text-calm-900">
                Go Lightly
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={handleCloseMobile}
              className="rounded-full border border-calm-200 px-3 py-2 text-sm text-calm-600"
            >
              Close
            </button>
          </div>

          {navLinks && <nav className="flex flex-col gap-4">{navLinks}</nav>}

          <button
            type="button"
            onClick={handleAuthClick}
            className="mt-auto rounded-full border border-calm-300 px-4 py-2 text-sm font-semibold text-calm-700 transition hover:border-primary-300 hover:text-primary-700"
          >
            {isAuthenticated ? "Logout" : "Login"}
          </button>
        </div>
      </div>
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </>
  );
}
