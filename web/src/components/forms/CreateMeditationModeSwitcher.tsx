"use client";

import { useCallback, useEffect, useState } from "react";
import type { Meditation } from "@golightly/shared-types";
import CreateMeditationForm from "@/components/forms/CreateMeditationForm";
import ScriptMeditationEditor from "@/components/forms/ScriptMeditationEditor";
import { useAppSelector } from "@/store/hooks";
import { getStagingMeditation } from "@/lib/api/meditations";

type CreateMode = "script" | "form";

const STORAGE_KEY = "golightly.createMode";

export default function CreateMeditationModeSwitcher() {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const showScriptMode = user?.showScriptModeForCreatingMeditations ?? false;
  const [mode, setMode] = useState<CreateMode>("form");
  const [stagingMeditation, setStagingMeditation] = useState<Meditation | null>(null);
  const [isStagingLoading, setIsStagingLoading] = useState(false);
  const [stagingError, setStagingError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored === "spreadsheet") {
      setMode("form");
      window.localStorage.setItem(STORAGE_KEY, "form");
      return;
    }

    if (stored === "script" && showScriptMode) {
      setMode("script");
      return;
    }

    setMode("form");
    if (stored && stored !== "form") {
      window.localStorage.setItem(STORAGE_KEY, "form");
    }
  }, [showScriptMode]);

  const refreshStaging = useCallback(async () => {
    setIsStagingLoading(true);
    setStagingError(null);
    try {
      const response = await getStagingMeditation();
      setStagingMeditation(response.meditation);
    } catch (error: any) {
      setStagingError(error?.response?.data?.error?.message || "Unable to load starter meditation.");
    } finally {
      setIsStagingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshStaging();
  }, [isAuthenticated, refreshStaging]);

  useEffect(() => {
    const status = stagingMeditation?.status ?? "";
    if (!stagingMeditation?.id || !["pending", "processing"].includes(status)) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshStaging();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshStaging, stagingMeditation?.id, stagingMeditation?.status]);

  const updateMode = (nextMode: CreateMode) => {
    setMode(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  if (!isAuthenticated) {
    return null;
  }

  const isFormActive = mode === "form" || !showScriptMode;
  const isScriptActive = showScriptMode && mode === "script";

  return (
    <section className="space-y-4">
      {showScriptMode && (
        <div className="inline-flex rounded-full border border-subtle bg-raised p-1 shadow-sm">
          <button
            type="button"
            onClick={() => updateMode("form")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "form"
                ? "bg-primary-600 text-white shadow-sm"
                : "text-ink-muted hover:bg-inset"
            }`}
            aria-pressed={mode === "form"}
          >
            Form
          </button>
          <button
            type="button"
            onClick={() => updateMode("script")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "script"
                ? "bg-primary-600 text-white shadow-sm"
                : "text-ink-muted hover:bg-inset"
            }`}
            aria-pressed={mode === "script"}
          >
            Script
          </button>
        </div>
      )}

      {isScriptActive && (
        <div>
          <ScriptMeditationEditor
            stagingMeditation={stagingMeditation}
            isStagingLoading={isStagingLoading}
            stagingError={stagingError}
            onStagingChanged={refreshStaging}
            isActive={isScriptActive}
          />
        </div>
      )}
      {isFormActive && (
        <div>
          <CreateMeditationForm
            stagingMeditation={stagingMeditation}
            isStagingLoading={isStagingLoading}
            stagingError={stagingError}
            onStagingChanged={refreshStaging}
            isActive={isFormActive}
          />
        </div>
      )}
    </section>
  );
}
