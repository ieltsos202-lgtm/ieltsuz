"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check, ArrowRight, Clock, AlertCircle, RefreshCw, Smartphone } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

const MONTHLY_PRICE = "49,000 UZS";

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
  const [step, setStep] = useState<"intro" | "qr" | "pending" | "success" | "failed">("intro");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/pay`);
      setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    }

    apiGet("/api/payment/my-payments").then((res: any) => {
      const pending = res.payments?.filter((p: any) => p.status === "pending") || [];
      setPendingPayments(pending);
      if (pending.length > 0) setStep("pending");
    }).catch(() => {});

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPayment = async () => {
    setLoading(true);
    setError("");
    try {
      const res: any = await apiPost("/api/payment/start", {});
      if (res.success && res.code) {
        setCode(res.code);
        setStep("qr");
        startPolling(res.code);
      } else {
        throw new Error("Failed to generate payment code");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (paymentCode: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res: any = await apiGet(`/api/payment/status/${paymentCode}`);
        if (res.payment?.status === "approved") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("success");
        } else if (res.payment?.status === "rejected") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("failed");
        }
      } catch {
        // ignore
      }
    }, 5000);
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res: any = await apiGet("/api/payment/my-payments");
      const payments = res.payments || [];
      const approved = payments.find((p: any) => p.status === "approved");
      const pending = payments.filter((p: any) => p.status === "pending");
      setPendingPayments(pending);
      if (approved) {
        setStep("success");
      } else if (pending.length === 0) {
        setStep("failed");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const qrUrl = baseUrl && code ? `${baseUrl}/${code}` : "";

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
                <p className="text-sm font-medium">You have a pending payment</p>
              </div>
              <Button variant="outline" className="mt-3 w-full" onClick={() => setStep("pending")}>
                Check status
              </Button>
            </Card>
          )}

          <Button className="w-full bg-accent text-white hover:bg-accent/90" onClick={startPayment} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Get Pro
          </Button>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {step === "qr" && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">
              {isMobile ? "Complete your payment" : "Scan with your phone"}
            </h2>
            <p className="mt-2 text-content-secondary">
              {isMobile
                ? "Pay via Payme or Click, then upload your screenshot"
                : "Payme and Click work on mobile — scan the QR code with your phone"}
            </p>
          </div>

          {isMobile ? (
            <Button
              className="w-full bg-accent py-6 text-base text-white hover:bg-accent/90"
              onClick={() => router.push(`/pay/${code}`)}
            >
              <Smartphone className="mr-2 h-5 w-5" />
              Continue to payment (Payme / Click)
            </Button>
          ) : (
            <Card className="flex flex-col items-center border-accent/30 bg-accent/5 p-6">
              {qrUrl && (
                <>
                  <QRCodeSVG value={qrUrl} size={200} level="M" className="rounded-lg" />
                  <p className="mt-3 text-xs text-content-secondary">Scan with your phone camera</p>
                </>
              )}
              <div className="mt-3 w-full">
                <p className="text-center text-sm text-content-secondary">Or open this link:</p>
                <code className="mt-1 block break-all rounded bg-bg-tertiary px-3 py-2 text-center text-sm font-mono text-accent">
                  {qrUrl}
                </code>
              </div>
            </Card>
          )}

          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-800 dark:text-amber-400">
                <p className="font-medium">On your phone:</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>See the card number and amount</li>
                  <li>Choose Payme or Click</li>
                  <li>Complete the transfer in the app</li>
                  <li>Take a screenshot of the success screen</li>
                  <li>Upload the screenshot on that page</li>
                </ol>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-tertiary p-4">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <div>
              <p className="text-sm font-medium">Waiting for payment…</p>
              <p className="text-xs text-content-secondary">
                This page updates automatically after you upload a screenshot.
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            className="w-full text-content-secondary"
            onClick={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              setStep("intro");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {step === "pending" && (
        <div className="space-y-6">
          <div className="text-center">
            <Clock className="mx-auto mb-3 h-12 w-12 text-amber-500" />
            <h2 className="text-2xl font-bold">Payment pending</h2>
            <p className="mt-2 text-content-secondary">
              Complete the transfer and upload your screenshot — AI will verify it automatically.
            </p>
          </div>

          {pendingPayments.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-medium text-content-secondary">Pending payments:</p>
              <ul className="mt-2 space-y-2">
                {pendingPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2 text-sm">
                    <span className="font-mono text-accent">{p.payment_code}</span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Pending
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-400">
              Verification takes a few seconds after upload. Pro activates automatically once approved.
            </p>
          </Card>

          {pendingPayments[0]?.payment_code && (
            <Button
              className="w-full bg-accent py-6 text-base text-white hover:bg-accent/90"
              onClick={() => {
                const pc = pendingPayments[0].payment_code;
                if (isMobile) {
                  router.push(`/pay/${pc}`);
                } else {
                  setCode(pc);
                  setStep("qr");
                  startPolling(pc);
                }
              }}
            >
              <Smartphone className="mr-2 h-5 w-5" />
              Finish payment (upload screenshot)
            </Button>
          )}

          <Button variant="outline" className="w-full" onClick={checkStatus} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Check status
          </Button>

          <Button variant="ghost" className="w-full text-content-secondary" onClick={() => router.push("/progress")}>
            View progress
          </Button>
        </div>
      )}

      {step === "success" && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Check className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-bold">You&apos;re now a Pro user!</h2>
          <p className="mt-2 text-content-secondary">Payment confirmed. Your Pro subscription is active for 30 days.</p>
          <Button className="mt-6 w-full bg-accent text-white hover:bg-accent/90" onClick={() => router.push("/dashboard")}>
            Start practicing <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === "failed" && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold">Payment not verified</h2>
          <p className="mt-2 text-content-secondary">
            We could not verify your payment. Please upload a clear screenshot showing the success screen.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep("intro")}>
              Try again
            </Button>
            <Button className="flex-1 bg-accent text-white hover:bg-accent/90" onClick={() => router.push("/progress")}>
              View progress
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
