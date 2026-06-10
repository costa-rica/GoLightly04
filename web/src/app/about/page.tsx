import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us - Go Lightly",
  description:
    "Learn about Go Lightly and its approach to creating lightly guided meditations with spacious silence.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50 px-4 py-16 dark:from-calm-950 dark:via-calm-900 dark:to-calm-950 md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="rounded-lg border border-calm-200/70 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-calm-800 dark:bg-calm-900/80 md:p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-calm-500 dark:text-calm-400">
            About Us
          </p>
          <h1 className="mt-3 text-4xl font-display font-semibold text-calm-900 dark:text-calm-50 md:text-5xl">
            Meditation tools for quieter guidance
          </h1>
          <p className="mt-5 text-base leading-7 text-calm-600 dark:text-calm-300 md:text-lg">
            Go Lightly helps people create personalized guided meditations that
            balance meaningful affirmations with room for silence. The app is
            designed for sessions that feel intentional without filling every
            moment with instruction.
          </p>
          <p className="mt-4 text-base leading-7 text-calm-600 dark:text-calm-300 md:text-lg">
            The project focuses on practical meditation creation: choose the
            words, pacing, sounds, and pauses that fit the moment, then save or
            revisit meditations as your practice changes.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              Create a meditation
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
