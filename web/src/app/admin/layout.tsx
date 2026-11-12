import ProtectedRoute from "@/components/ProtectedRoute";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAdmin>
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto flex w-full max-w-app flex-col gap-10 px-4 py-10 md:px-8 md:py-16">
          {children}
        </div>
      </main>
    </ProtectedRoute>
  );
}
