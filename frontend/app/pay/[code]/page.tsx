"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check, AlertCircle, Upload, CreditCard, Smartphone, Wallet, ArrowLeft, Info, Copy } from "lucide-react";
import { apiGet, apiPostForm } from "@/lib/api";

function sanitizeCard(raw?: string) {
  return (raw || "").replace(/\D/g, "");
}

export default function MobilePayPage() {
  const params = useParams();
  const code = params.code as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<any>(null);
  const [step, setStep] = useState<"select" | "payme" | "click" | "upload">("select");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<"success" | "error" | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const cardNumber = sanitizeCard(process.env.NEXT_PUBLIC_CARD_NUMBER);
  const cardOwner = process.env.NEXT_PUBLIC_CARD_OWNER || "IELTSUZ";
  const formattedCard = cardNumber.replace(/(\d{4})/g, "$1 ").trim();

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
          setError("Invalid or expired payment code.");
        }
      })
      .catch(() => setError("Could not load payment details."))
      .finally(() => setLoading(false));
  }, [code]);

  const openPayme = () => {
    const amount = 49000;
    const deepLink = `payme://transfer?cardNumber=${cardNumber}&amount=${amount}`;
    const webLink = `https://payme.uz/transfer/${cardNumber}`;

    window.location.href = deepLink;
    setTimeout(() => {
      window.open(webLink, "_blank");
    }, 1500);
    setStep("payme");
  };

  const openClick = () => {
    const amount = 49000;
    const deepLink = `click://payment?cardNumber=${cardNumber}&amount=${amount}`;
    const webLink = `https://my.click.uz/clickp2p/${cardNumber}?amount=${amount}`;

    window.location.href = deepLink;
    setTimeout(() => {
      window.open(webLink, "_blank");
    }, 1500);
    setStep("click");
  };

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
            ? "Payment verified! Pro is now active."
            : res.message || "Verification failed. Please upload a clearer screenshot."
        );
        if (res.verified) {
          setPayment((p: any) => ({ ...p, status: "approved" }));
        }
      } else {
        setUploadResult("error");
        setUploadMessage(res.error || "Upload failed. Please try again.");
      }
    } catch (err: any) {
      setUploadResult("error");
      setUploadMessage(err.message || "Upload failed.");
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
        <p className="mt-2 text-sm text-content-secondary">Go back to the main page and try again.</p>
      </div>
    );
  }

  if (payment?.status === "approved") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-primary p-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold">Payment verified!</h1>
        <p className="mt-2 text-content-secondary">Pro is active on all your devices.</p>
        <p className="mt-4 text-sm text-content-secondary">You can close this page and return to your computer.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold">IELTSUZ Pro</h1>
        <p className="text-sm text-content-secondary">Payment page</p>
      </div>

      <Card className="mb-4 border-accent/30 bg-accent/5 p-4 text-center">
        <p className="text-xs text-content-secondary">Payment code</p>
        <code className="text-2xl font-bold tracking-wider text-accent">{code}</code>
      </Card>

      {step === "select" && (
        <div className="space-y-4">
          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-sm text-amber-800 dark:text-amber-400">
                <p className="font-bold">Important</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Amount must be exactly <strong>49,000 UZS</strong></li>
                  <li>Double-check the card number before paying</li>
                  <li>Take a screenshot after payment</li>
                  <li>Screenshot must show a success / completed status</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium text-content-secondary">Card details:</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-secondary">Card holder</span>
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
                <span className="text-sm font-medium">Amount</span>
                <span className="text-xl font-bold text-accent">49,000 UZS</span>
              </div>
            </div>
          </Card>

          <p className="text-center text-sm font-medium text-content-secondary">Choose payment method:</p>

          <div className="grid grid-cols-2 gap-3">
            <Button className="h-16 flex-col gap-1 bg-[#2B5CE6] text-white hover:bg-[#1e4fc7]" onClick={openPayme}>
              <Wallet className="h-6 w-6" />
              <span className="text-sm font-bold">Payme</span>
            </Button>
            <Button className="h-16 flex-col gap-1 bg-[#00A651] text-white hover:bg-[#008a43]" onClick={openClick}>
              <Smartphone className="h-6 w-6" />
              <span className="text-sm font-bold">Click</span>
            </Button>
          </div>
        </div>
      )}

      {(step === "payme" || step === "click") && (
        <div className="space-y-4">
          <Card className="border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="text-sm text-emerald-800 dark:text-emerald-400">
                <p className="font-bold">{step === "payme" ? "Payme" : "Click"} app opened!</p>
                <p className="mt-1">If the app did not open, a payment page should have opened in your browser.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium">Steps:</p>
            <ol className="space-y-3 text-sm text-content-secondary">
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">1</span>
                <span>Verify card number: <code className="font-bold text-accent">{formattedCard}</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">2</span>
                <span>Amount: <strong>49,000 UZS</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">3</span>
                <span>Complete the payment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">4</span>
                <span><strong>Take a screenshot</strong> of the success screen</span>
              </li>
            </ol>
          </Card>

          <Button className="w-full bg-accent text-white hover:bg-accent/90" onClick={() => setStep("upload")}>
            <Upload className="mr-2 h-4 w-4" />
            Upload screenshot →
          </Button>

          <Button variant="ghost" className="w-full text-content-secondary" onClick={() => setStep("select")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <Card className="border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="text-sm text-blue-800 dark:text-blue-400">
                <p className="font-bold">Upload screenshot</p>
                <p className="mt-1">Take a screenshot after a successful payment and upload it here. AI will verify it automatically.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-tertiary p-8 transition-colors hover:border-accent/50">
              <Upload className="mb-2 h-10 w-10 text-content-secondary" />
              <p className="text-sm text-content-secondary">
                {file ? file.name : "Tap to select screenshot"}
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
              {uploading ? "Verifying…" : "Upload and verify"}
            </Button>
          </Card>

          <Button variant="ghost" className="w-full text-content-secondary" onClick={() => setStep("select")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-content-secondary">
        Need help? Telegram @ieltsosuzb
      </p>
    </div>
  );
}
