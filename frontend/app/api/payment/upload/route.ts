import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient, getAdminClient } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    // Check for duplicate screenshot
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("screenshot_hash", hash)
      .neq("id", payment.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This screenshot has already been used for another payment." }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
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

    // Gemini verification
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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

    const geminiResult = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: file.type, data: base64Image } },
    ]);

    const response = geminiResult.response.text();

    // Extract JSON
    let jsonMatch = response.match(/\{[\s\S]*\}/);
    let analysis: any = {};
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        // ignore parse error
      }
    }

    const expectedAmount = payment.amount;
    const cardNumber = (process.env.CARD_NUMBER || process.env.NEXT_PUBLIC_CARD_NUMBER || "").replace(/\D/g, "");
    const cardLast4 = cardNumber.slice(-4);

    const amountOk = analysis.amount === expectedAmount || Math.abs((analysis.amount || 0) - expectedAmount) < 1000;
    const cardOk = !!cardLast4 && (analysis.card_last4?.includes(cardLast4) || analysis.card_last4?.includes(cardNumber));
    const statusOk = analysis.status?.toLowerCase().includes("success") || analysis.status?.toLowerCase().includes("paid") || analysis.status?.toLowerCase().includes("muvaffaqiyatli") || analysis.status?.toLowerCase().includes("successfully");
    // Fully automatic decision — no manual review. Accept on strong signals
    // (amount + recipient card + success status) unless confidence is low.
    const notLowConfidence = analysis.confidence !== "low";

    const verified = amountOk && cardOk && statusOk && notLowConfidence;

    if (verified) {
      // Grant Pro first — if this fails we bail out with an error and leave
      // the payment "pending" so the user can safely retry the upload
      // instead of being told "success" while Pro was never granted.
      const proExpiresAt = new Date();
      proExpiresAt.setDate(proExpiresAt.getDate() + 30);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_pro: true,
          pro_expires_at: proExpiresAt.toISOString(),
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
