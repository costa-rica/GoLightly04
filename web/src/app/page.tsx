import CreateMeditationModeSwitcher from "@/components/forms/CreateMeditationModeSwitcher";
import TableMeditation from "@/components/tables/TableMeditation";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50 dark:from-calm-950 dark:via-calm-900 dark:to-calm-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8 md:py-16">
        <header className="rounded-3xl border border-calm-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-calm-800 dark:bg-calm-900/80">
          <p className="text-xs uppercase tracking-[0.25em] text-calm-500 dark:text-calm-400">
            Go Lightly
          </p>
          <h1 className="mt-3 text-4xl font-display font-semibold text-calm-900 md:text-5xl dark:text-calm-50">
            Create lightly guided meditations
          </h1>
          <p className="mt-3 max-w-2xl text-base text-calm-600 md:text-lg dark:text-calm-300">
            Balance purposeful affirmations with spacious silence to design
            meditations that feel personal.
          </p>
        </header>

        <TableMeditation />

        <CreateMeditationModeSwitcher />
      </div>
    </main>
  );
}
