import { Transaction } from "../types/transaction";

export interface ImBankShortTermLoan {
  id: string;
  /** Contracted loan principal before the bank's upfront deductions. */
  amount: number;
  /** Processing fee, credit-life cover, and excise duty deducted at disbursement. */
  fees: number;
  /** Amount that actually reaches the customer's bank account. */
  disbursedAmount: number;
  dueDate: Date;
  date: Date;
  rawSms: string;
}

export const parseImBankShortTermLoanSms = (
  smsText: string,
  timestamp?: number,
): ImBankShortTermLoan | null => {
  const normalized = smsText.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /Your\s+loan\s+of\s+KES\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+successfully\s+processed\.\s*Fee\s+KES\s*([\d,]+(?:\.\d{1,2})?)\.\s*Credit\s+life\s+KES\s*([\d,]+(?:\.\d{1,2})?)\.\s*Excise\s+duty\s+KES\s*([\d,]+(?:\.\d{1,2})?)\.\s*Due\s+date\s+(\d{4}-\d{2}-\d{2})/i,
  );
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  const fees = [match[2], match[3], match[4]].reduce(
    (total, value) => total + Number(value.replace(/,/g, "")),
    0,
  );
  const dueDate = new Date(`${match[5]}T12:00:00`);
  const date = timestamp ? new Date(timestamp) : new Date();
  const id = `IM_LOAN_${date.getTime()}_${match[5].replace(/-/g, "")}_${amount.toFixed(2).replace(".", "")}`;

  if (!Number.isFinite(amount) || !Number.isFinite(fees) || Number.isNaN(dueDate.getTime())) return null;
  return {
    id,
    amount,
    fees,
    disbursedAmount: Math.max(0, amount - fees),
    dueDate,
    date,
    rawSms: smsText,
  };
};

export const parseBankSms = (
  smsText: string,
  sender: string,
): Transaction | null => {
  // Normalize sender for easier matching
  const normalizedSender = sender.toLowerCase();
  const normalizedMessage = smsText.toLowerCase();

  // Check for supported banks
  if (
    normalizedSender.includes("i&m") ||
    normalizedSender.includes("im bank") ||
    normalizedSender.includes("imbank") ||
    normalizedSender.includes("i and m") ||
    normalizedSender.includes("iandmbank") ||
    normalizedMessage.includes("i&m") ||
    normalizedMessage.includes("im bank") ||
    normalizedMessage.includes("imbank") ||
    normalizedMessage.includes("i and m")
  ) {
    return parseImBankSms(smsText);
  }

  return null;
};

const parseImBankSms = (smsText: string): Transaction | null => {
  // 1. Bank to M-PESA Transfer
  // Pattern: "Bank to M-PESA transfer of KES 1,500.00 to 0702173240 - PAULINE WAIRIMU NGUGI successfully processed. Transaction Ref ID: 2987VCSA2052. M-PESA Ref ID: TLCNB0QWT3"
  const transferPattern =
    /Bank\s+to\s+M-PESA\s+transfer\s+of\s+KES\s*([\d,]+\.\d{2})\s+to\s+(\d+)\s+-\s+(.+?)\s+successfully\s+processed\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+M-PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

  const paybillPattern =
    /M-PESA\s+transfer\s+of\s+KES\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+A\/C\s+(.+?)\s+via\s+Paybill\s+(\d+)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+successfully\s+processed\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+M-PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

  // 3. Card Purchase
  // Pattern: "Dear BENSON, You made a purchase of KES 700.00 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012. If you did not effect the transaction..."
  // Updated to accept optional decimals and different date formats
  const purchasePattern =
    /(?:Dear\s+[^,]+,\s*)?You\s+(?:have\s+)?made\s+a\s+purchase\s+of\s*(KES|USD)\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+([\d/-]{8,10})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+at\s+(.+?)(?:\s+using\b|$)/i;

  let match = smsText.match(transferPattern);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ""));
    const phoneNumber = match[2];
    const recipientName = match[3].trim();
    const bankRef = match[4]; // Bank Ref
    const mpesaRef = match[5];
    const txId = `IM_TRANSFER_${bankRef}`;
    return {
      id: txId, // Standardize ID with IM_ prefix
      uuid: txId,
      userId: "local_user",
      accountId: "ACC-BANK-DEFAULT",
      // A bank-to-M-PESA payment may be to another person. Treat it as an
      // expense until the matching M-PESA SMS proves it is the user's own bank.
      transactionKind: "EXPENSE",
      referenceId: mpesaRef,
      amount: amount,
      type: "SENT",
      recipientId: phoneNumber,
      recipientName: recipientName,
      date: new Date(), // SMS doesn't have date, use current time (service will use SMS timestamp)
      balance: 0, // Bank SMS usually doesn't show balance
      transactionCost: 0,
      categoryId: undefined, // Will be categorized later
      rawSms: smsText,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
  }

  match = smsText.match(paybillPattern);
  if (match) {
    const [day, month, year] = match[4].split("/").map(Number);
    const [hours, minutes] = match[5].split(":").map(Number);
    const date = new Date(year, month - 1, day, hours, minutes);
    const bankRef = match[6];
    return {
      id: `IM_PAYBILL_${bankRef}`,
      uuid: `IM_PAYBILL_${bankRef}`,
      userId: "local_user",
      accountId: "ACC-BANK-DEFAULT",
      transactionKind: "EXPENSE",
      referenceId: match[7],
      amount: Number(match[1].replace(/,/g, "")),
      type: "SENT",
      recipientId: `PAYBILL_${match[3]}`,
      recipientName: `${match[2].trim()} - Paybill ${match[3]}`,
      date,
      balance: 0,
      transactionCost: 0,
      rawSms: smsText,
      createdAt: date,
      updatedAt: date,
      isDeleted: false,
    };
  }

  const receiptPattern =
    /You\s+have\s+received\s+KES\s*([\d,]+\.\d{2})\s+from\s+(.+?)\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+(?:M-?PESA|Mpesa)\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

  match = smsText.match(receiptPattern);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ""));
    const senderName = match[2].trim();
    const bankRef = match[3];
    const mpesaRef = match[4];
    const txId = `IM_TRANSFER_${bankRef}`;
    return {
      id: txId, // SAME ID as the transfer message
      uuid: txId,
      userId: "local_user",
      accountId: "ACC-BANK-DEFAULT",
      transactionKind: "INCOME",
      referenceId: mpesaRef,
      amount: amount,
      type: "RECEIVED",
      recipientId: "SELF",
      recipientName: senderName,
      date: new Date(),
      balance: 0,
      transactionCost: 0,
      categoryId: undefined,
      rawSms: smsText,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
  }

  match = smsText.match(purchasePattern);
  if (match) {
    const currency = match[1].toUpperCase();
    const originalAmount = parseFloat(match[2].replace(/,/g, ""));
    const dateStr = match[3];
    const timeStr = match[4];
    const merchant = match[5].trim();

    // Handle DD-MM-YYYY or YYYY-MM-DD
    let normalizedDate = dateStr;
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const parts = dateStr.split("-");
      normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const txId = `IM_CARD_${dateStr.replace(/[^\d]/g, "")}${timeStr.replace(/[^\d]/g, "")}`;
    return {
      id: txId, // Generate a unique ID
      uuid: txId,
      userId: "local_user",
      accountId: "ACC-BANK-DEFAULT",
      transactionKind: "EXPENSE",
      amount: currency === "KES" ? originalAmount : 0,
      type: "SENT",
      recipientId: merchant.toUpperCase(),
      recipientName: merchant,
      date: new Date(`${normalizedDate}T${timeStr}`),
      balance: 0,
      transactionCost: 0,
      foreignAmount: currency === "KES" ? undefined : originalAmount,
      foreignCurrency: currency === "KES" ? undefined : currency,
      isAmountConfirmed: currency === "KES",
      rawSms: smsText,
      createdAt: new Date(`${normalizedDate}T${timeStr}`),
      updatedAt: new Date(`${normalizedDate}T${timeStr}`),
      isDeleted: false,
    };
  }

  return null;
};

// Helper: Check if a transaction text contains an MPESA Ref that we can use for deduplication
export const extractMpesaRefFromBankSms = (smsText: string): string | null => {
  // Matches "M-PESA Ref ID", "MPESA Ref ID", "Mpesa Ref ID" (case insensitive)
  const transferPattern = /(?:M-?PESA|Mpesa)\s+Ref\s+ID:\s+([A-Z0-9]+)/i;
  const match = smsText.match(transferPattern);
  return match ? match[1] : null;
};
