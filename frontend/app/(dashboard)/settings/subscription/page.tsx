"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Check, Crown, Smartphone } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { formatExpiry } from "@/lib/pro";

const MONTHLY_PRICE = "49 000 so'm";

export default function SubscriptionPage() {
  const router = useRouter();
  const { active, expired, expiresAt, daysLeft, plan, loading } = useSubscription();

  if (loading) return <LoadingSpinner />;

  if (active) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">Obuna</h1>
        <Card className="space-y-4 p-6 text-center">
          <Crown className="mx-auto h-12 w-12 text-accent-yellow" />
          <CardTitle className="text-lg">
            Pro faol{plan ? ` · ${plan.label} tarif` : ""}
          </CardTitle>
          <p className="text-content-secondary">
            Barcha imkoniyatlarga cheksiz kirish faol.
          </p>
          {expiresAt ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-accent">{daysLeft} kun qoldi</p>
              <p className="text-xs text-content-secondary">
                Amal qilish muddati: {formatExpiry(expiresAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">Muddatsiz faol obuna</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/upgrade">
              {/* Renewing early adds to the days left, it never resets them. */}
              <Button className="w-full sm:w-auto">Muddatni uzaytirish</Button>
            </Link>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Bosh sahifaga qaytish
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {expired && (
        <Card className="border-accent-yellow/30 bg-accent-yellow/5 p-4 text-center text-sm text-accent-yellow">
          Pro obunangiz muddati tugagan
          {expiresAt ? ` (${formatExpiry(expiresAt)})` : ""}. Davom etish uchun uzaytiring.
        </Card>
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold">Pro'ga o'ting</h1>
        <p className="mt-2 text-content-secondary">
          Cheksiz AI baholash va barcha premium imkoniyatlarni oching.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-accent">{MONTHLY_PRICE}</p>
          <p className="text-sm text-content-secondary">oyiga · 3 va 12 oylik tariflarda arzonroq</p>
        </div>
        <ul className="space-y-2 text-sm text-content-secondary">
          {[
            "Cheksiz AI Writing baholash",
            "Cheksiz AI Speaking amaliyot",
            "To'liq Listening va Reading testlar",
            "Cheksiz Mock testlar",
            "Progress kuzatuvi va tahlil",
            "Lug'at yig'uvchi (Vocabulary)",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-400" /> {f}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-6 w-6 text-accent-yellow" />
          <h3 className="text-lg font-semibold">Payme / Click orqali to'lov</h3>
        </div>
        <p className="text-sm text-content-secondary">
          Payme yoki Click orqali to'lang, so'ng chek skrinshotini yuklang — AI darhol tekshiradi.
        </p>
        <Link href="/upgrade">
          <Button className="w-full">To'lovga o'tish</Button>
        </Link>
      </Card>
    </div>
  );
}
