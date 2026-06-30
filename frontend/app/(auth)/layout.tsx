import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-100 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-8 block text-center text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent"
        >
          IELTSUZ
        </Link>
        {children}
      </div>
    </div>
  );
}
