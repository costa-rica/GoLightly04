"use client";

import { useEffect, useState } from "react";
import type { Meditation, MeditationElement } from "@golightly/shared-types";
import CreateMeditationForm from "@/components/forms/CreateMeditationForm";
import ScriptMeditationEditor from "@/components/forms/ScriptMeditationEditor";
import { useAppSelector } from "@/store/hooks";
import { getStagingMeditation } from "@/lib/api/meditations";

type CreateMode = "script" | "spreadsheet";

const STORAGE_KEY = "golightly.createMode";

export default function CreateMeditationModeSwitcher() {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const [mode, setMode] = useState<CreateMode>("script");
  const [stagingMeditation, setStagingMeditation] = useState<Meditation | null>(null);
  const [isStagingLoading, setIsStagingLoading] = useState(false);
  const [stagingError, setStagingError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "script" || stored === "spreadsheet") {
      setMode(stored);
    }
  }, []);

  const refreshStaging = async () => {
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
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshStaging();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!stagingMeditation || !["pending", "processing"].includes(stagingMeditation.status ?? "")) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshStaging();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [stagingMeditation?.id, stagingMeditation?.status]);

  const updateMode = (nextMode: CreateMode) => {
    setMode(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="inline-flex rounded-full border border-subtle bg-raised p-1 shadow-sm">
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
        <button
          type="button"
          onClick={() => updateMode("spreadsheet")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === "spreadsheet"
              ? "bg-primary-600 text-white shadow-sm"
              : "text-ink-muted hover:bg-inset"
          }`}
          aria-pressed={mode === "spreadsheet"}
        >
          Spreadsheet
        </button>
      </div>

      <div hidden={mode !== "script"} aria-hidden={mode !== "script"}>
        <ScriptMeditationEditor
          stagingMeditation={stagingMeditation}
          isStagingLoading={isStagingLoading}
          stagingError={stagingError}
          onStagingChanged={refreshStaging}
          isActive={mode === "script"}
        />
      </div>
      <div hidden={mode !== "spreadsheet"} aria-hidden={mode !== "spreadsheet"}>
        <CreateMeditationForm
          stagingMeditation={stagingMeditation}
          isStagingLoading={isStagingLoading}
          stagingError={stagingError}
          onStagingChanged={refreshStaging}
          isActive={mode === "spreadsheet"}
        />
      </div>
    </section>
  );
}
