"use client";

import {
  type ComponentType,
  type SVGProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/features/authSlice";
import { setApiAuthToken } from "@/lib/api/client";
import { clearAuthStorage } from "@/lib/utils/auth";
import Toast from "@/components/Toast";
import ThemeToggle from "@/components/ThemeToggle";

type NavigationProps = {
  onLoginClick?: () => void;
};

type IconProps = SVGProps<SVGSVGElement>;
type MenuIcon = ComponentType<IconProps>;

type MenuLinkProps = {
  href: string;
  icon: MenuIcon;
  label: string;
  onClick: () => void;
};

type MenuButtonProps = {
  icon: MenuIcon;
  label: string;
  onClick: () => void;
};

const menuRowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-calm-700 transition hover:bg-calm-100 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:text-calm-200 dark:hover:bg-calm-900 dark:hover:text-primary-300";

function ProfileIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CreateIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <path d="M7 3h10" />
      <path d="M7 21h10" />
    </svg>
  );
}

function InfoIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ShieldIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LogInIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function LogOutIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: MenuLinkProps) {
  return (
    <Link href={href} className={menuRowClass} onClick={onClick}>
      <Icon className="h-5 w-5 shrink-0 text-calm-500 dark:text-calm-400" />
      <span>{label}</span>
    </Link>
  );
}

function MenuButton({ icon: Icon, label, onClick }: MenuButtonProps) {
  return (
    <button type="button" className={menuRowClass} onClick={onClick}>
      <Icon className="h-5 w-5 shrink-0 text-calm-500 dark:text-calm-400" />
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-calm-200 dark:bg-calm-800" />;
}

export default function Navigation({ onLoginClick }: NavigationProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((returnFocus = true) => {
    setIsMenuOpen(false);

    if (returnFocus) {
      window.requestAnimationFrame(() => {
        hamburgerRef.current?.focus();
      });
    }
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      sidebarRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isMenuOpen]);

  const handleAuthClick = () => {
    if (isAuthenticated) {
      dispatch(logout());
      setApiAuthToken(null);
      clearAuthStorage();
      setToastMessage("You have been logged out.");
      router.push("/");
      closeMenu();
      return;
    }

    onLoginClick?.();
    closeMenu();
  };

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

            <button
              ref={hamburgerRef}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-calm-200 text-calm-700 transition hover:border-primary-300 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
              aria-label="Open navigation menu"
              aria-controls="site-navigation-sidebar"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <span className="flex flex-col gap-1" aria-hidden="true">
                <span className="h-0.5 w-5 rounded-full bg-current" />
                <span className="h-0.5 w-5 rounded-full bg-current" />
                <span className="h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        aria-hidden={!isMenuOpen}
        inert={!isMenuOpen}
        className={`fixed inset-0 z-50 ${
          isMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          tabIndex={-1}
          className={`absolute inset-0 bg-calm-900/35 backdrop-blur-sm transition-opacity motion-reduce:transition-none ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => closeMenu()}
        />
        <aside
          id="site-navigation-sidebar"
          ref={sidebarRef}
          tabIndex={-1}
          aria-label="Site navigation"
          className={`absolute right-0 top-0 flex h-full w-[min(22rem,calc(100vw-2rem))] flex-col bg-white px-5 py-5 shadow-xl outline-none transition-transform duration-200 motion-reduce:transition-none dark:bg-calm-950 ${
            isMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-calm-200 pb-4 dark:border-calm-800">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-3"
              onClick={() => closeMenu()}
            >
              <Image
                src="/images/golightlyLogo02.png"
                alt="Go Lightly"
                width={32}
                height={32}
                className="shrink-0 rounded-full"
              />
              <span className="truncate font-display text-base font-semibold text-calm-900 dark:text-calm-50">
                Go Lightly
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => closeMenu()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-calm-200 text-calm-600 transition hover:border-primary-300 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:border-calm-700 dark:text-calm-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
            >
              <span className="sr-only">Close menu</span>
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
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="mt-5 flex flex-col gap-1" aria-label="Main menu">
            {isAuthenticated ? (
              <>
                <MenuLink
                  href="/create-meditation"
                  icon={CreateIcon}
                  label="Create Meditation"
                  onClick={() => closeMenu()}
                />
                <MenuLink
                  href="/profile"
                  icon={ProfileIcon}
                  label="Profile"
                  onClick={() => closeMenu()}
                />
                <ThemeToggle variant="sidebar" />
                <MenuLink
                  href="/about"
                  icon={InfoIcon}
                  label="About Us"
                  onClick={() => closeMenu()}
                />
                <Divider />
                {user?.isAdmin ? (
                  <>
                    <MenuLink
                      href="/admin"
                      icon={ShieldIcon}
                      label="Admin"
                      onClick={() => closeMenu()}
                    />
                    <Divider />
                  </>
                ) : null}
                <MenuButton
                  icon={LogOutIcon}
                  label="Logout"
                  onClick={handleAuthClick}
                />
              </>
            ) : (
              <>
                <MenuLink
                  href="/about"
                  icon={InfoIcon}
                  label="About Us"
                  onClick={() => closeMenu()}
                />
                <ThemeToggle variant="sidebar" />
                <Divider />
                <MenuButton
                  icon={LogInIcon}
                  label="Login"
                  onClick={handleAuthClick}
                />
              </>
            )}
          </nav>
        </aside>
      </div>
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </>
  );
}
