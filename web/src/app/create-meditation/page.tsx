"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import CreateMeditationModeSwitcher from "@/components/forms/CreateMeditationModeSwitcher";

export default function CreateMeditationPage() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-canvas px-4 py-24 text-ink md:px-8">
        <div className="mx-auto flex w-full max-w-app flex-col gap-6">
          <header className="border-b border-subtle pb-6">
            <h1 className="text-3xl font-display font-semibold text-ink md:text-4xl">
              Create New Meditation
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-ink-muted">
              Compose a lightly guided meditation from text, silence, and sound.
            </p>
          </header>

          <CreateMeditationModeSwitcher />
        </div>
      </main>
    </ProtectedRoute>
  );
}
