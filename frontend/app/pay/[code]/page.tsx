"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check, AlertCircle, Upload, CreditCard, ArrowLeft, Info, Copy } from "lucide-react";
import { apiGet, apiPostForm } from "@/lib/api";

function sanitizeCard(raw?: string) {
  return (raw || "").replace(/\D/g, "");
}

const fmtUZS = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

export default function MobilePayPage() {
  const params = useParams();
  const code = params.code as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<any>(null);
  const [step, setStep] = useState<"select" | "upload">("select");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<"success" | "error" | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const cardNumber = sanitizeCard(process.env.NEXT_PUBLIC_CARD_NUMBER);
  const cardOwner = process.env.NEXT_PUBLIC_CARD_OWNER || "IELTSUZ";
  const formattedCard = cardNumber.replace(/(\d{4})/g, "$1 ").trim();
  const amountLabel = `${fmtUZS(Number(payment?.amount) || 49000)} so'm`;

  useEffect(() => {
    if (!code) return;
    apiGet(`/api/payment/status/${code}`)
      .then((res: any) => {
        if (res.payment) {
          setPayment(res.payment);
          if (res.payment.status === "approved") {
            setStep("upload");
          }
        } else {
          setError("To'lov kodi noto'g'ri yoki muddati tugagan.");
        }
      })
      .catch(() => setError("To'lov ma'lumotlarini yuklab bo'lmadi."))
      .finally(() => setLoading(false));
  }, [code]);

  const copyCard = () => {
    navigator.clipboard.writeText(cardNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("screenshot", file);
      formData.append("code", code);

      const res: any = await apiPostForm("/api/payment/upload", formData);

      if (res.success) {
        setUploadResult(res.verified ? "success" : "error");
        setUploadMessage(
          res.verified
            ? "To'lov tasdiqlandi! Pro faollashtirildi."
            : res.message || "Tekshiruvdan o'tmadi. Aniqroq skrinshot yuklang."
        );
        if (res.verified) {
          setPayment((p: any) => ({ ...p, status: "approved" }));
        }
      } else {
        setUploadResult("error");
        setUploadMessage(res.error || "Yuklashda xatolik. Qayta urinib ko'ring.");
      }
    } catch (err: any) {
      setUploadResult("error");
      setUploadMessage(err.message || "Yuklashda xatolik yuz berdi.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-primary p-6 text-center">
        <AlertCircle className="mb-3 h-12 w-12 text-red-500" />
        <h1 className="text-xl font-bold text-red-600">{error}</h1>
        <p className="mt-2 text-sm text-content-secondary">Asosiy sahifaga qaytib, qayta urinib ko'ring.</p>
      </div>
    );
  }

  if (payment?.status === "approved") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-primary p-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold">To'lov tasdiqlandi!</h1>
        <p className="mt-2 text-content-secondary">Pro barcha qurilmalaringizda faol.</p>
        <p className="mt-4 text-sm text-content-secondary">Bu sahifani yopib, kompyuteringizga qaytishingiz mumkin.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold">IELTSUZ Pro</h1>
        <p className="text-sm text-content-secondary">To'lov sahifasi</p>
      </div>

      <Card className="mb-4 border-accent/30 bg-accent/5 p-4 text-center">
        <p className="text-xs text-content-secondary">To'lov kodi</p>
        <code className="text-2xl font-bold tracking-wider text-accent">{code}</code>
      </Card>

      {step === "select" && (
        <div className="space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-sm text-amber-800 dark:text-amber-400">
                <p className="font-bold">Muhim</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Summa aniq <strong>{amountLabel}</strong> bo'lishi kerak</li>
                  <li>To'lovdan oldin karta raqamini tekshirib qo'ying</li>
                  <li>To'lovdan keyin skrinshot oling</li>
                  <li>Skrinshotda muvaffaqiyatli / bajarildi holati ko'rinishi kerak</li>
                </ul>
              </div>
            </div>
          </Card>

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
                <span className="text-xl font-bold text-accent">{amountLabel}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium">To'lov qilish uchun:</p>
            <ol className="space-y-3 text-sm text-content-secondary">
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">1</span>
                <span>Yuqoridagi <strong>nusxalash</strong> tugmasi bilan karta raqamini nusxalang</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">2</span>
                <span><strong>Payme</strong> yoki <strong>Click</strong> ilovasini oching</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">3</span>
                <span>"Kartadan kartaga o'tkazma" bo'limini tanlab, nusxalangan raqamni joylashtiring</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">4</span>
                <span>Miqdorni <strong>{amountLabel}</strong> deb kiritib, to'lovni tasdiqlang</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">5</span>
                <span>Muvaffaqiyatli to'lov ekranidan <strong>skrinshot</strong> oling</span>
              </li>
            </ol>
          </Card>

          <Button className="w-full bg-accent py-6 text-base text-white hover:bg-accent/90" onClick={() => setStep("upload")}>
            <Upload className="mr-2 h-5 w-5" />
            To'lov qildim, skrinshot yuklash →
          </Button>
        </div>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <Card className="border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="text-sm text-blue-800 dark:text-blue-400">
                <p className="font-bold">Skrinshot yuklash</p>
                <p className="mt-1">To'lov muvaffaqiyatli bo'lgandan so'ng skrinshot olib shu yerga yuklang. AI uni avtomatik tekshiradi.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-tertiary p-8 transition-colors hover:border-accent/50">
              <Upload className="mb-2 h-10 w-10 text-content-secondary" />
              <p className="text-sm text-content-secondary">
                {file ? file.name : "Skrinshotni tanlash uchun bosing"}
              </p>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>

            {uploadResult && (
              <div
                className={`mt-3 rounded-lg p-3 text-sm ${
                  uploadResult === "success"
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {uploadMessage}
              </div>
            )}

            <Button className="mt-3 w-full bg-accent text-white hover:bg-accent/90" onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? "Tekshirilmoqda…" : "Yuklash va tasdiqlash"}
            </Button>
          </Card>

          <Button variant="ghost" className="w-full text-content-secondary" onClick={() => setStep("select")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Orqaga
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-content-secondary">
        Yordam kerakmi? Telegram: @ieltsosuzb
      </p>
    </div>
  );
}
