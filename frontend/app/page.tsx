import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { About } from "@/components/landing/About";
import { Pricing } from "@/components/landing/Pricing";
import { AuthRedirect } from "@/components/landing/AuthRedirect";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <AuthRedirect />
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            IELTSUZ
          </span>
          <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">
              How it works
            </a>
            <a href="#about" className="hover:text-slate-900 transition-colors">
              About
            </a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
                Log in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Start Free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <Hero />
      <Features />
      <HowItWorks />
      <div id="about">
        <About />
      </div>
      <div id="pricing">
        <Pricing />
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-12 text-center">
        <p className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
          IELTSUZ
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Your personal AI mentor for IELTS success. Practice smarter, score higher.
        </p>
        <p className="mt-4 text-xs text-slate-400">
          &copy; {new Date().getFullYear()} IELTSUZ. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
