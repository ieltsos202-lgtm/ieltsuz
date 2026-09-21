import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient, getAdminClient } from "@/lib/supabaseServer";
import { extendedExpiry, planDaysFromAmount } from "@/lib/pro";
import { generateWithFallback } from "@/lib/gemini";
import crypto from "crypto";

// A receipt screenshot; anything larger is not a phone screenshot and would
// only waste an AI call and the worker's memory.
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // Code-based: works without a phone session (QR scanned from desktop).
    const supabase = getAdminClient() ?? getAuthedClient(req).supabase;
    const formData = await req.formData();
    const file = formData.get("screenshot") as File;
    const code = formData.get("code") as string;

    if (!file || !code) {
      return NextResponse.json({ error: "Missing screenshot or code" }, { status: 400 });
    }
    if (typeof file.size !== "number" || file.size === 0) {
      return NextResponse.json({ error: "Skrinshot bo'sh. Qayta yuklang." }, { status: 400 });
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json(
        { error: "Skrinshot juda katta (10MB dan oshmasin)." },
        { status: 400 }
      );
    }
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Faqat rasm (skrinshot) yuklash mumkin." },
        { status: 400 }
      );
    }

    // Find payment by code
    const { data: payment } = await supabase
      .from("payments")
      .select("id, user_id, status, amount")
      .eq("payment_code", code)
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "pending") {
      return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
    }

    // Upload to Supabase storage
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Reuse check. Only an APPROVED payment means the receipt was already
    // cashed in — that is the actual fraud vector. Matching against pending or
    // rejected rows locked honest users out of their own genuine receipt after
    // a misread, because the hash is stored on rejection too.
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("screenshot_hash", hash)
      .eq("status", "approved")
      .neq("id", payment.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This screenshot has already been used for another payment." }, { status: 400 });
    }

    const ext = (file.name || "").split(".").pop() || "png";
    const path = `payments/${payment.user_id}/${Date.now()}.${ext}`;

    // Storage is optional — verification still proceeds even if it fails.
    let screenshotUrl = "";
    try {
      const { error: uploadError } = await supabase.storage
        .from("screenshots")
        .upload(path, buffer, { contentType: file.type });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("screenshots").getPublicUrl(path);
        screenshotUrl = urlData.publicUrl;
      }
    } catch {
      /* ignore storage errors */
    }

    const base64Image = buffer.toString("base64");

    const prompt = `Analyze this payment screenshot and extract:
1. Payment method (Payme, Click, Uzcard, Humo, etc.)
2. Amount in UZS (just the number)
3. Card number or recipient info
4. Date and time
5. Payment status (Success, Failed, Pending, etc.)
6. Transaction ID if visible

Required amount: ${payment.amount} UZS
Required recipient card: ${process.env.CARD_NUMBER || process.env.NEXT_PUBLIC_CARD_NUMBER || ""}

Respond ONLY in this JSON format:
{
  "method": "...",
  "amount": number or null,
  "card_last4": "...",
  "date": "...",
  "status": "success|failed|pending",
  "transaction_id": "...",
  "confidence": "high|medium|low",
  "reasoning": "brief explanation"
}`;

    // Real money is on the line here, so this call gets the full model/key
    // chain with backoff. A single rate-limited key used to reject a genuine
    // receipt outright and leave the payer unable to activate Pro.
    let analysis: any = {};
    try {
      const response = await generateWithFallback(
        [
          { text: prompt },
          { inlineData: { mimeType: file.type || "image/png", data: base64Image } },
        ],
        { config: { temperature: 0 } }
      );
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch (aiErr) {
      // Never auto-reject on our own outage: the payment stays pending and the
      // user is asked to retry, rather than being told their receipt is bad.
      console.error("Payment screenshot verification failed:", aiErr);
      return NextResponse.json(
        {
          error:
            "Tekshiruv xizmati hozircha javob bermadi. To'lovingiz saqlanib turibdi — bir ozdan keyin skrinshotni qayta yuklang.",
        },
        { status: 503 }
      );
    }

    const expectedAmount = payment.amount;
    const cardNumber = (process.env.CARD_NUMBER || process.env.NEXT_PUBLIC_CARD_NUMBER || "").replace(/\D/g, "");
    const cardLast4 = cardNumber.slice(-4);

    // The model sometimes returns the amount as a formatted string ("49 000").
    const reportedAmount = Number(String(analysis.amount ?? "").replace(/[^\d.-]/g, ""));
    const amountOk =
      Number.isFinite(reportedAmount) && Math.abs(reportedAmount - expectedAmount) < 1000;
    // Everything below comes from model output, so it is coerced before use —
    // a numeric card_last4 would otherwise throw on .includes and surface as a
    // bare "Upload failed" to someone who genuinely paid.
    const reportedCard = String(analysis.card_last4 ?? "");
    const reportedStatus = String(analysis.status ?? "").toLowerCase();
    const cardOk =
      !!cardLast4 && (reportedCard.includes(cardLast4) || reportedCard.includes(cardNumber));
    const statusOk =
      reportedStatus.includes("success") ||
      reportedStatus.includes("paid") ||
      reportedStatus.includes("muvaffaqiyatli");
    // Fully automatic decision — no manual review. Accept on strong signals
    // (amount + recipient card + success status) unless confidence is low.
    const notLowConfidence = analysis.confidence !== "low";

    const verified = amountOk && cardOk && statusOk && notLowConfidence;

    if (verified) {
      // Grant Pro first — if this fails we bail out with an error and leave
      // the payment "pending" so the user can safely retry the upload
      // instead of being told "success" while Pro was never granted.
      // Subscription length depends on which plan was paid for, and renewing
      // before the current period ends must add to the remaining time.
      const proDays = planDaysFromAmount(payment.amount);
      const { data: current } = await supabase
        .from("profiles")
        .select("pro_expires_at")
        .eq("id", payment.user_id)
        .single();
      const proExpiresAt = extendedExpiry(current?.pro_expires_at, proDays);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_pro: true,
          pro_expires_at: proExpiresAt,
        })
        .eq("id", payment.user_id);

      if (profileError) {
        console.error("Grant Pro error:", profileError);
        return NextResponse.json({ error: "Failed to activate Pro. Please try again." }, { status: 500 });
      }

      // Approve payment. Pro is already granted at this point, so even if
      // this update fails we still report success to the user but log the
      // inconsistency for manual reconciliation.
      const { error: approveError } = await supabase
        .from("payments")
        .update({
          status: "approved",
          screenshot_url: screenshotUrl,
          screenshot_hash: hash,
          verified_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (approveError) {
        console.error("Mark payment approved error:", approveError, "payment_id:", payment.id);
      }

      return NextResponse.json({
        success: true,
        verified: true,
        days: proDays,
        pro_expires_at: proExpiresAt,
        message: "Payment verified and Pro activated!",
      });
    } else {
      // Automatic rejection with a clear reason so the user can retry.
      const reasons: string[] = [];
      if (!amountOk) reasons.push(`summa ${expectedAmount.toLocaleString()} so'm bo'lishi kerak`);
      if (!cardOk) reasons.push("karta raqami mos kelmadi");
      if (!statusOk) reasons.push("to'lov muvaffaqiyatli ko'rinmadi");
      if (analysis.confidence === "low") reasons.push("skrinshot aniq emas");
      const reason = reasons.length
        ? `Tekshiruvdan o'tmadi: ${reasons.join(", ")}.`
        : "To'lovni tasdiqlab bo'lmadi. Aniqroq skrinshot yuklang.";

      // Keep the payment "pending" so the user can retry with a clearer
      // screenshot on the same code (still fully automatic, no admin step).
      await supabase
        .from("payments")
        .update({
          screenshot_url: screenshotUrl,
          screenshot_hash: hash,
          rejection_reason: reason,
        })
        .eq("id", payment.id);

      return NextResponse.json({
        success: true,
        verified: false,
        message: reason,
      });
    }
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
