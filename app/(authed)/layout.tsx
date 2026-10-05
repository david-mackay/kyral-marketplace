import { AuthGuard } from "@/components/AuthGuard";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        {children}
      </div>
    </AuthGuard>
  );
}
