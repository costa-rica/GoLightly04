"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/features/authSlice";
import { setApiAuthToken } from "@/lib/api/client";
import { clearAuthStorage } from "@/lib/utils/auth";
import Toast from "@/components/Toast";
import ThemeToggle from "@/components/ThemeToggle";

type NavigationProps = {
  onLoginClick?: () => void;
};

function ProfileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

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
      setApiAuthToken(null);
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
          className="text-sm font-semibold text-calm-700 transition hover:text-primary-700 dark:text-calm-200 dark:hover:text-primary-300"
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
          className="text-sm font-semibold text-calm-700 transition hover:text-primary-700 dark:text-calm-200 dark:hover:text-primary-300"
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
        <div className="border-b border-calm-200/70 bg-white/80 shadow-sm backdrop-blur dark:border-calm-800 dark:bg-calm-950/85">
          <div className="mx-auto flex h-16 max-w-app items-center justify-between px-4 md:px-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/golightlyLogo02.png"
                alt="Go Lightly"
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="font-display text-lg font-semibold text-calm-900 dark:text-calm-50">
                Go Lightly
              </span>
            </Link>

            <div className="hidden items-center gap-3 md:flex">
              {navLinks}
              <ThemeToggle />
              {isAuthenticated && (
                <Link
                  href="/profile"
                  aria-label="Open profile"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-calm-300 text-calm-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
                >
                  <ProfileIcon />
                </Link>
              )}
              <button
                type="button"
                onClick={handleAuthClick}
                className="rounded-full border border-calm-300 px-4 py-2 text-sm font-semibold text-calm-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
              >
                {isAuthenticated ? "Logout" : "Login"}
              </button>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle />
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-calm-200 text-calm-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-calm-700 dark:text-calm-200"
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
          className={`absolute left-0 top-0 flex h-full w-3/4 max-w-xs flex-col gap-6 bg-white px-6 py-6 shadow-xl transition-transform dark:bg-calm-950 ${
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
              <span className="font-display text-base font-semibold text-calm-900 dark:text-calm-50">
                Go Lightly
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={handleCloseMobile}
              className="rounded-full border border-calm-200 px-3 py-2 text-sm text-calm-600 dark:border-calm-700 dark:text-calm-200"
            >
              Close
            </button>
          </div>

          <nav className="flex flex-col gap-4">
            {navLinks}
            {isAuthenticated && (
              <Link
                href="/profile"
                className="text-sm font-semibold text-calm-700 transition hover:text-primary-700 dark:text-calm-200 dark:hover:text-primary-300"
                onClick={handleCloseMobile}
              >
                Profile
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={handleAuthClick}
            className="mt-auto rounded-full border border-calm-300 px-4 py-2 text-sm font-semibold text-calm-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
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
