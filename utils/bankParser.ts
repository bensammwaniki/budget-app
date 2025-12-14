import { Transaction } from '../types/transaction';

export const parseBankSms = (smsText: string, sender: string): Transaction | null => {
    // Normalize sender for easier matching
    const normalizedSender = sender.toLowerCase();

    // Check for supported banks
    if (normalizedSender.includes('i&m') || normalizedSender.includes('imbank') || normalizedSender.includes('iandmbank')) {
        return parseImBankSms(smsText);
    }

    return null;
};

const parseImBankSms = (smsText: string): Transaction | null => {
    // 1. Bank to M-PESA Transfer
    // Pattern: "Bank to M-PESA transfer of KES 1,500.00 to 0702173240 - PAULINE WAIRIMU NGUGI successfully processed. Transaction Ref ID: 2987VCSA2052. M-PESA Ref ID: TLCNB0QWT3"
    const transferPattern = /Bank\s+to\s+M-PESA\s+transfer\s+of\s+KES\s*([\d,]+\.\d{2})\s+to\s+(\d+)\s+-\s+(.+?)\s+successfully\s+processed\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+M-PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

    // 2. Card Purchase
    // Pattern: "Dear BENSON, You made a purchase ofKES 700.00 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012. If you did not effect the transaction..."
    // Note: "purchase ofKES" might be a typo in user sample, usually "of KES". adjusting regex to be flexible.
    const purchasePattern = /You\s+made\s+a\s+purchase\s+of\s*KES\s*([\d,]+\.\d{2})\s+on\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+at\s+(.+?)\s+using/i;

    let match = smsText.match(transferPattern);
    if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const phoneNumber = match[2];
        const recipientName = match[3].trim();
        const bankRef = match[4]; // Bank Ref
        const mpesaRef = match[5]; // M-PESA Ref - useful for deduplication

        return {
            id: bankRef, // Use Bank Ref as ID
            amount: amount,
            type: 'SENT',
            recipientId: phoneNumber,
            recipientName: recipientName,
            date: new Date(), // SMS doesn't have date, use current time (service will use SMS timestamp)
            balance: 0, // Bank SMS usually doesn't show balance
            transactionCost: 0,
            categoryId: undefined, // Will be categorized later
            rawSms: smsText,
            // Custom field to help with deduplication
            // We put the MPESA Ref in the narration or a special field if we had one.
            // For now, we rely on the logic in smsService to check this.
        };
    }

    match = smsText.match(purchasePattern);
    if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const dateStr = match[2];
        const timeStr = match[3];
        const merchant = match[4].trim();

        return {
            id: `IM_CARD_${dateStr.replace(/-/g, '')}${timeStr.replace(/:/g, '')}`, // Generate a unique ID
            amount: amount,
            type: 'SENT',
            recipientId: merchant.toUpperCase(),
            recipientName: merchant,
            date: new Date(`${dateStr}T${timeStr}`),
            balance: 0,
            transactionCost: 0,
            rawSms: smsText
        };
    }

    return null;
};

// Helper: Check if a transaction text contains an MPESA Ref that we can use for deduplication
export const extractMpesaRefFromBankSms = (smsText: string): string | null => {
    const transferPattern = /M-PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;
    const match = smsText.match(transferPattern);
    return match ? match[1] : null;
};
