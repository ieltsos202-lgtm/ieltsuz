import Link from "next/link";
import { Home, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
        IELTSUZ
      </p>

      <div className="mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
        <Search className="h-10 w-10 text-indigo-600" />
      </div>

      <h1 className="mt-6 text-4xl font-bold text-slate-900">404</h1>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">Page not found</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for doesn&apos;t exist or may have been moved.
      </p>

      <Link href="/" className="mt-8">
        <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Home className="mr-2 h-4 w-4" />
          Back to home
        </Button>
      </Link>
    </main>
  );
}
