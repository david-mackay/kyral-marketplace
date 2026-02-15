import { AuthGuard } from "@/components/AuthGuard";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
    </AuthGuard>
  );
}
