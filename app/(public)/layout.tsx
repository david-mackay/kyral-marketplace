export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">{children}</div>;
}
