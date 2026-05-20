"use client";

import { useEffect, useState } from "react";
import CreateMeditationForm from "@/components/forms/CreateMeditationForm";
import ScriptMeditationEditor from "@/components/forms/ScriptMeditationEditor";
import { useAppSelector } from "@/store/hooks";

type CreateMode = "script" | "spreadsheet";

const STORAGE_KEY = "golightly.createMode";

export default function CreateMeditationModeSwitcher() {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const [mode, setMode] = useState<CreateMode>("script");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "script" || stored === "spreadsheet") {
      setMode(stored);
    }
  }, []);

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
        <ScriptMeditationEditor />
      </div>
      <div hidden={mode !== "spreadsheet"} aria-hidden={mode !== "spreadsheet"}>
        <CreateMeditationForm />
      </div>
    </section>
  );
}
