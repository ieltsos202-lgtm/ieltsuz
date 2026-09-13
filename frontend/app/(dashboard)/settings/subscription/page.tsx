"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Check, Crown, Smartphone } from "lucide-react";

const MONTHLY_PRICE = "49 000 so'm";

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro, pro_expires_at")
        .eq("id", user.id)
        .single();

      if (profile?.is_pro && profile.pro_expires_at) {
        const expires = new Date(profile.pro_expires_at);
        if (expires > new Date()) {
          setIsPro(true);
          setExpiresAt(profile.pro_expires_at);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (isPro) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">Obuna</h1>
        <Card className="space-y-4 p-6 text-center">
          <Crown className="mx-auto h-12 w-12 text-accent-yellow" />
          <CardTitle className="text-lg">Siz Pro foydalanuvchisiz!</CardTitle>
          <p className="text-content-secondary">
            Barcha imkoniyatlarga cheksiz kirish faol.
          </p>
          {expiresAt && (
            <p className="text-xs text-content-secondary">
              Amal qilish muddati: {new Date(expiresAt).toLocaleDateString("uz-UZ")}
            </p>
          )}
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Bosh sahifaga qaytish
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
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
