"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, updateUserPreferences } from "@/lib/api/auth";
import { setUser } from "@/store/features/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function ProfilePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { accessToken, isAuthenticated, user } = useAppSelector(
    (state) => state.auth,
  );
  const [isScriptModeEnabled, setIsScriptModeEnabled] = useState(
    user?.showScriptModeForCreatingMeditations ?? false,
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    setIsScriptModeEnabled(
      user?.showScriptModeForCreatingMeditations ?? false,
    );
  }, [user?.showScriptModeForCreatingMeditations]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    let isMounted = true;
    setIsLoadingProfile(true);
    setError(null);

    getProfile()
      .then((response) => {
        if (!isMounted) return;
        dispatch(setUser(response.user));
        setIsScriptModeEnabled(
          response.user.showScriptModeForCreatingMeditations ?? false,
        );
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(
          err?.response?.data?.error?.message || "Unable to load profile.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, dispatch, isAuthenticated]);

  const handlePreferenceChange = async (checked: boolean) => {
    const previousValue = isScriptModeEnabled;
    setIsScriptModeEnabled(checked);
    setIsSaving(true);
    setError(null);

    try {
      const response = await updateUserPreferences({
        showScriptModeForCreatingMeditations: checked,
      });
      dispatch(setUser(response.user));
      setIsScriptModeEnabled(
        response.user.showScriptModeForCreatingMeditations ?? false,
      );
    } catch (err: any) {
      setIsScriptModeEnabled(previousValue);
      setError(
        err?.response?.data?.error?.message || "Unable to save preferences.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-24 text-ink md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="rounded-lg border border-subtle bg-raised p-6 shadow-sm md:p-8">
          <div className="border-b border-subtle pb-6">
            <h1 className="text-3xl font-display font-semibold text-ink md:text-4xl">
              Profile
            </h1>
            <p className="mt-3 text-sm text-ink-muted">{user?.email}</p>
          </div>

          <div className="pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-display font-semibold text-ink">
                Preferences
              </h2>
              {isLoadingProfile && (
                <p className="text-sm text-ink-muted">Loading profile...</p>
              )}
            </div>

            <label className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-subtle bg-inset px-4 py-4">
              <span className="text-sm font-medium text-ink">
                Show script mode for creating meditations
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-subtle text-primary-600 focus:ring-primary-500"
                checked={isScriptModeEnabled}
                disabled={isLoadingProfile || isSaving}
                onChange={(event) => {
                  void handlePreferenceChange(event.target.checked);
                }}
              />
            </label>

            {isSaving && (
              <p className="mt-3 text-sm text-ink-muted">Saving...</p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
