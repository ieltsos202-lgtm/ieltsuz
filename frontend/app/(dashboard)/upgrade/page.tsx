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

const MONTHLY_PRICE = "49,000 UZS";

function sanitizeCard(raw?: string) {
  return (raw || "").replace(/\D/g, "");
}

const PRO_FEATURES = [
  "Unlimited Writing evaluations",
  "Unlimited Speaking practice",
  "Unlimited Mock tests",
  "Progress tracking & charts",
  "Vocabulary builder",
  "AI study coach",
];

export default function UpgradePage() {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "confirm" | "pay" | "success" | "failed">("intro");
  const [loading, setLoading] = useState(false);
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
      const res: any = await apiPost("/api/payment/start", {});
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

  return (
    <div className="mx-auto max-w-lg p-6">
      {step === "intro" && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Upgrade to Pro</h1>
            <p className="mt-2 text-content-secondary">Unlimited access to all features</p>
            <Card className="mt-4 border-accent/30 bg-accent/10 p-4">
              <p className="text-4xl font-bold text-accent">{MONTHLY_PRICE}</p>
              <p className="text-sm text-content-secondary">per month</p>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Pro includes:</h3>
            <ul className="space-y-2">
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
            className="w-full bg-accent text-white hover:bg-accent/90"
            onClick={() => setStep("confirm")}
            disabled={loading}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Pro sotib olish
          </Button>

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
              <span className="text-sm font-medium">Narxi</span>
              <span className="text-xl font-bold text-accent">{MONTHLY_PRICE} / oy</span>
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
                <span className="text-sm font-medium">Summa</span>
                <span className="text-xl font-bold text-accent">{MONTHLY_PRICE}</span>
              </div>
            </div>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-sm text-amber-800 dark:text-amber-400">
                <p className="font-bold">Muhim</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Summa aniq <strong>49,000 UZS</strong> bo'lishi kerak</li>
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
          <p className="mt-2 text-content-secondary">To'lov tasdiqlandi. Pro obunangiz 30 kun davomida faol.</p>
          <Button className="mt-6 w-full bg-accent text-white hover:bg-accent/90" onClick={() => router.push("/dashboard")}>
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
