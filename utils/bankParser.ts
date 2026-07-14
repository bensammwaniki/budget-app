import { Transaction } from "../types/transaction";

export const parseBankSms = (
  smsText: string,
  sender: string,
): Transaction | null => {
  // Normalize sender for easier matching
  const normalizedSender = sender.toLowerCase();

  // Check for supported banks
  if (
    normalizedSender.includes("i&m") ||
    normalizedSender.includes("im bank") ||
    normalizedSender.includes("imbank") ||
    normalizedSender.includes("iandmbank")
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

  // 3. Card Purchase
  // Pattern: "Dear BENSON, You made a purchase of KES 700.00 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012. If you did not effect the transaction..."
  // Updated to accept optional decimals and different date formats
  const purchasePattern =
    /(?:Dear\s+[^,]+,\s*)?You\s+(?:have\s+)?made\s+a\s+purchase\s+of\s*KES\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+([\d/-]{8,10})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+at\s+(.+?)(?:\s+using\b|$)/i;

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
      transactionKind: "TRANSFER",
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
      transactionKind: "TRANSFER",
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
    const amount = parseFloat(match[1].replace(/,/g, ""));
    const dateStr = match[2];
    const timeStr = match[3];
    const merchant = match[4].trim();

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
      amount: amount,
      type: "SENT",
      recipientId: merchant.toUpperCase(),
      recipientName: merchant,
      date: new Date(`${normalizedDate}T${timeStr}`),
      balance: 0,
      transactionCost: 0,
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
