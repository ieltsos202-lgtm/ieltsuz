// Payme Merchant API (checkout.paycom.uz) — JSON-RPC 2.0
// Amounts are in TIYINS (1 UZS = 100 tiyins)

const PAYME_API_URL = "https://checkout.paycom.uz/api";

function getAuthHeader() {
  const merchantId = process.env.PAYME_MERCHANT_ID || "";
  const apiKey = process.env.PAYME_API_KEY || "";
  if (!merchantId || !apiKey) return null;
  const token = Buffer.from(`${merchantId}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export function isPaymeConfigured() {
  return !!process.env.PAYME_MERCHANT_ID && !!process.env.PAYME_API_KEY;
}

interface PaymeReceipt {
  _id: string;
  state: number;
  amount: number;
  payment?: {
    url?: string;
  };
  account?: Record<string, string>;
  create_time: string;
  pay_time?: string | null;
  cancel_time?: string | null;
}

interface PaymeResponse {
  receipt?: PaymeReceipt;
  error?: { message: string; code: number };
}

async function callPayme(method: string, params: Record<string, unknown>): Promise<PaymeResponse> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("Payme not configured");

  const res = await fetch(PAYME_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth": auth,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params }),
  });

  if (!res.ok) {
    throw new Error(`Payme HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.result || data;
}

export async function createReceipt(amountUzs: number, orderId: string) {
  // amount in tiyins
  const amountTiyins = Math.round(amountUzs * 100);

  const result = await callPayme("receipts.create", {
    amount: amountTiyins,
    account: { order_id: orderId },
    description: "IELTSUZ Pro Subscription",
    detail: {
      receipt_type: 2, // one-time
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.receipt!;
}

export async function getReceipt(receiptId: string) {
  const result = await callPayme("receipts.get", {
    id: { receiptId },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.receipt!;
}

// Receipt states
// 0 = CREATED (waiting for payment)
// 1 = PAID (payment complete)
// 2 = CANCELLED
// 4 = HOLD
export function isReceiptPaid(receipt: PaymeReceipt) {
  return receipt.state === 1;
}

export function isReceiptPending(receipt: PaymeReceipt) {
  return receipt.state === 0 || receipt.state === 4;
}
