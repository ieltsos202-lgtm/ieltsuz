"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Check,
  ArrowRight,
  Clock,
  AlertCircle,
  RefreshCw,
  CreditCard,
  Copy,
  Upload,
  Info,
  ArrowLeft,
} from "lucide-react";
import { apiGet, apiPost, apiPostForm } from "@/lib/api";
import { useSubscription } from "@/hooks/useSubscription";
import { formatExpiry } from "@/lib/pro";

type PlanId = "1m" | "3m" | "12m";

const PLANS: Record<
  PlanId,
  { label: string; amount: number; old: number; perDay: number; oldPerDay: number; days: number; badge?: string }
> = {
  "1m": { label: "1 OY", amount: 49000, old: 98000, perDay: 1633, oldPerDay: 3266, days: 30, badge: "✨ SIZGA TAVSIYA ETAMIZ" },
  "3m": { label: "3 OY", amount: 99000, old: 199000, perDay: 1100, oldPerDay: 2211, days: 90 },
  "12m": { label: "12 OY", amount: 399000, old: 999000, perDay: 1093, oldPerDay: 2737, days: 365 },
};

const fmtUZS = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

const TESTIMONIALS = [
  {
    name: "Dilnoza K.",
    result: "6.0 → 7.5",
    text: "Speaking partner bilan har kuni gaplashdim — 2 oyda 7.5 oldim. Kursga yarim yil qatnaganimdan ko'ra samaraliroq bo'ldi.",
  },
  {
    name: "Jasur T.",
    result: "Band 7.0",
    text: "Writing feedback juda aniq, xuddi real examiner tekshirgandek. Har bir xatoni sabab bilan tushuntiradi.",
  },
  {
    name: "Madina A.",
    result: "5.5 → 7.0",
    text: "Mock testlar real imtihonga juda o'xshaydi. Imtihon kuni hech qanday syurpriz bo'lmadi.",
  },
  {
    name: "Sardor B.",
    result: "Band 6.5",
    text: "Kursga 2 mln to'lash o'rniga shu yerda tayyorlandim. AI examiner bilan speaking'dan qo'rquvim butunlay yo'qoldi.",
  },
];

function sanitizeCard(raw?: string) {
  return (raw || "").replace(/\D/g, "");
}

const PRO_FEATURES = [
  "Cheksiz Writing baholash (AI examiner)",
  "Cheksiz Speaking amaliyot (jonli AI examiner)",
  "Cheksiz Mock testlar (Cambridge IELTS)",
  "Progress kuzatuvi va grafiklar",
  "Lug'at yig'uvchi (Vocabulary)",
  "Shaxsiy AI o'quv rejasi",
];

export default function UpgradePage() {
  const router = useRouter();
  const { active: proActive, expiresAt: proExpiresAt, daysLeft: proDaysLeft, plan: proPlan } =
    useSubscription();
  const [step, setStep] = useState<"intro" | "confirm" | "pay" | "success" | "failed">("intro");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanId>("1m");
  const [proDays, setProDays] = useState(30);
  const [timeLeft, setTimeLeft] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState(false);

  const cardNumber = sanitizeCard(process.env.NEXT_PUBLIC_CARD_NUMBER);
  const cardOwner = process.env.NEXT_PUBLIC_CARD_OWNER || "IELTSUZ";
  const formattedCard = cardNumber.replace(/(\d{4})/g, "$1 ").trim();

  // Discount countdown — persisted so it stays believable across refreshes,
  // and quietly restarts after it expires.
  useEffect(() => {
    let deadline = parseInt(localStorage.getItem("upgrade_deadline") || "0", 10);
    if (!deadline || deadline < Date.now()) {
      deadline = Date.now() + 9 * 60 * 1000;
      localStorage.setItem("upgrade_deadline", String(deadline));
    }
    setTimeLeft(Math.max(0, deadline - Date.now()));
    const t = setInterval(() => {
      let d = parseInt(localStorage.getItem("upgrade_deadline") || "0", 10);
      if (d < Date.now()) {
        d = Date.now() + 9 * 60 * 1000;
        localStorage.setItem("upgrade_deadline", String(d));
      }
      setTimeLeft(Math.max(0, d - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    apiGet("/api/payment/my-payments").then((res: any) => {
      const pending = res.payments?.filter((p: any) => p.status === "pending") || [];
      setPendingPayments(pending);
      if (pending.length > 0) {
        setCode(pending[0].payment_code);
        setStep("pay");
      }
    }).catch(() => {});
  }, []);

  const startPayment = async () => {
    setLoading(true);
    setError("");
    try {
      const res: any = await apiPost("/api/payment/start", { plan });
      if (res.success && res.code) {
        setCode(res.code);
        setStep("pay");
      } else {
        throw new Error("Failed to generate payment code");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyCard = () => {
    navigator.clipboard.writeText(cardNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setUploadMessage("");
    }
  };

  const handleUpload = async () => {
    if (!file || !code) return;
    setUploading(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("screenshot", file);
      formData.append("code", code);

      const res: any = await apiPostForm("/api/payment/upload", formData);

      if (res.success && res.verified) {
        setProDays(res.days ?? PLANS[plan].days);
        setStep("success");
      } else {
        setUploadError(true);
        setUploadMessage(res.message || "Tekshiruvdan o'tmadi. Aniqroq skrinshot yuklang.");
      }
    } catch (err: any) {
      setUploadError(true);
      setUploadMessage(err.message || "Yuklashda xatolik yuz berdi.");
    } finally {
      setUploading(false);
    }
  };

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const selected = PLANS[plan];

  return (
    <div className="mx-auto max-w-3xl p-6">
      {step === "intro" && (
        <div className="space-y-6">
          {/* Already Pro: this page becomes a renewal, not an upsell. Paying
              again adds days on top of what is left. */}
          {proActive && (
            <Card className="border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Pro allaqachon faol{proPlan ? ` · ${proPlan.label} tarif` : ""}
              </p>
              <p className="mt-1 text-xs text-content-secondary">
                {proExpiresAt
                  ? `${proDaysLeft} kun qoldi (${formatExpiry(proExpiresAt)}). Hozir to'lasangiz, yangi muddat shu kunlarga qo'shiladi.`
                  : "Obunangiz muddatsiz faol."}
              </p>
            </Card>
          )}

          {/* Countdown bar */}
          <div className="flex items-center justify-between rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-content-secondary">Chegirma tugashiga</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-red-500">
                {String(mins).padStart(2, "0")}
                <span className="animate-pulse">:</span>
                {String(secs).padStart(2, "0")}
              </p>
            </div>
            <span className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white">
              -50% CHEGIRMA
            </span>
          </div>

          {/* Social proof */}
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-bold">IELTSUZ Pro</h1>
            <div className="flex items-center justify-center gap-1 text-lg">
              <span aria-hidden>⭐⭐⭐⭐⭐</span>
              <span className="ml-1 text-sm text-content-secondary">5 dan 4.9 · 1 847 ta sharh</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-center">
              <div>
                <p className="text-xl font-bold">🏆 12 000+</p>
                <p className="text-xs text-content-secondary">foydalanuvchi tanlovi</p>
              </div>
              <div>
                <p className="text-xl font-bold">⭐ 3 200+</p>
                <p className="text-xs text-content-secondary">5 yulduzli baho</p>
              </div>
              <div>
                <p className="text-xl font-bold">📈 92%</p>
                <p className="text-xs text-content-secondary">band ko'targanlar</p>
              </div>
            </div>
          </div>

          {/* Plan cards */}
          <div>
            <h2 className="mb-4 text-center text-xl font-bold">O'zingizga mos tarifni tanlang</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(PLANS) as PlanId[]).map((id) => {
                const p = PLANS[id];
                const active = plan === id;
                return (
                  <button
                    key={id}
                    onClick={() => setPlan(id)}
                    className={`relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
                      active
                        ? "border-red-500 shadow-lg shadow-red-500/10"
                        : "border-border hover:border-red-300"
                    }`}
                  >
                    {p.badge && (
                      <span className="absolute inset-x-0 top-0 bg-red-500 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
                        {p.badge}
                      </span>
                    )}
                    <div className={p.badge ? "mt-6" : ""}>
                      <p className="text-lg font-bold">{p.label}</p>
                      <p className="mt-1 text-sm">
                        <span className="text-content-secondary line-through">{fmtUZS(p.old)} so'm</span>{" "}
                        <span className="font-semibold">{fmtUZS(p.amount)} so'm</span>
                      </p>
                      <div className="my-3 border-t border-border" />
                      <p className="text-2xl font-extrabold">
                        {fmtUZS(p.perDay)} so'm <span className="text-sm font-normal text-content-secondary">/kun</span>
                      </p>
                      <p className="text-sm text-content-secondary line-through">{fmtUZS(p.oldPerDay)} so'm</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Pro bilan nima ochiladi:</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-content-secondary">
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" /> {feature}
                </li>
              ))}
            </ul>
          </Card>

          {pendingPayments.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="h-5 w-5" />
                <p className="text-sm font-medium">Sizda kutilayotgan to'lov mavjud</p>
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => {
                  setCode(pendingPayments[0].payment_code);
                  setStep("pay");
                }}
              >
                To'lovni yakunlash
              </Button>
            </Card>
          )}

          <Button
            className="w-full bg-red-500 py-6 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600"
            onClick={() => setStep("confirm")}
            disabled={loading}
          >
            REJANI OLISH — {fmtUZS(selected.amount)} so'm
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Testimonials */}
          <div className="space-y-3">
            <h3 className="text-center text-lg font-bold">Foydalanuvchilar fikri</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {TESTIMONIALS.map((t) => (
                <Card key={t.name} className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
                      {t.result}
                    </span>
                  </div>
                  <p aria-hidden className="text-xs">⭐⭐⭐⭐⭐</p>
                  <p className="text-sm leading-relaxed text-content-secondary">“{t.text}”</p>
                </Card>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-content-secondary">
            🔒 To'lov xavfsiz · Istalgan payt bekor qilish mumkin · 24/7 yordam
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Pro sotib olasizmi?</h2>
            <p className="mt-2 text-content-secondary">Quyidagi imkoniyatlar ochiladi:</p>
          </div>

          <Card className="p-5">
            <ul className="space-y-2">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-content-secondary">
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" /> {feature}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-accent/10 p-3">
              <span className="text-sm font-medium">{selected.label} — Narxi</span>
              <span className="text-xl font-bold text-accent">
                <span className="mr-2 text-sm font-normal text-content-secondary line-through">
                  {fmtUZS(selected.old)}
                </span>
                {fmtUZS(selected.amount)} so'm
              </span>
            </div>
          </Card>

          <Button className="w-full bg-accent py-6 text-base text-white hover:bg-accent/90" onClick={startPayment} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
            Ha, Pro sotib olaman
          </Button>

          <Button variant="ghost" className="w-full text-content-secondary" onClick={() => setStep("intro")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Bekor qilish
          </Button>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {step === "pay" && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">To'lovni amalga oshiring</h2>
            <p className="mt-2 text-content-secondary">
              Quyidagi karta raqamiga to'lov qiling, so'ng chekni shu yerga yuklang
            </p>
          </div>

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium text-content-secondary">Karta ma'lumotlari:</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-secondary">Karta egasi</span>
                <span className="text-sm font-semibold">{cardOwner}</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-content-secondary" />
                <code className="flex-1 font-mono text-lg font-bold">{formattedCard}</code>
                <Button variant="outline" size="sm" onClick={copyCard} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-accent/10 p-3">
                <span className="text-sm font-medium">Summa ({selected.label})</span>
                <span className="text-xl font-bold text-accent">{fmtUZS(selected.amount)} so'm</span>
              </div>
            </div>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-sm text-amber-800 dark:text-amber-400">
                <p className="font-bold">Muhim</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Summa aniq <strong>{fmtUZS(selected.amount)} so'm</strong> bo'lishi kerak</li>
                  <li>To'lovdan oldin karta raqamini tekshirib qo'ying</li>
                  <li>To'lovdan keyin skrinshot oling (muvaffaqiyatli ekran ko'rinishi kerak)</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-tertiary p-8 transition-colors hover:border-accent/50">
              <Upload className="mb-2 h-10 w-10 text-content-secondary" />
              <p className="text-sm text-content-secondary">
                {file ? file.name : "Chek skrinshotini tanlash uchun bosing"}
              </p>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>

            {uploadMessage && (
              <div
                className={`mt-3 rounded-lg p-3 text-sm ${
                  uploadError
                    ? "border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                    : "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                }`}
              >
                {uploadMessage}
              </div>
            )}

            <Button
              className="mt-3 w-full bg-accent py-6 text-base text-white hover:bg-accent/90"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? "Tekshirilmoqda…" : "Chekni yuklash va tasdiqlash"}
            </Button>
          </Card>

          <Button
            variant="ghost"
            className="w-full text-content-secondary"
            onClick={() => setStep("intro")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Orqaga
          </Button>
        </div>
      )}

      {step === "success" && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Check className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-bold">Siz endi Pro foydalanuvchisiz!</h2>
          <p className="mt-2 text-content-secondary">To'lov tasdiqlandi. Pro obunangiz {proDays} kun davomida faol.</p>
          {/* Full reload, not a client-side push: the cached profile still says
              "free", which would leave the sidebar showing Upgrade. */}
          <Button
            className="mt-6 w-full bg-accent text-white hover:bg-accent/90"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            Mashg'ulotni boshlash <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === "failed" && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold">To'lov tasdiqlanmadi</h2>
          <p className="mt-2 text-content-secondary">
            To'lovingizni tasdiqlab bo'lmadi. Iltimos, aniqroq skrinshot yuklang.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep("pay")}>
              Qayta urinish
            </Button>
            <Button className="flex-1 bg-accent text-white hover:bg-accent/90" onClick={() => router.push("/progress")}>
              Progressni ko'rish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
