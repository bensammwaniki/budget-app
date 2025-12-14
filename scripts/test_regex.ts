
// Mock Transaction Interface
interface Transaction {
    id: string;
    amount: number;
    type: 'SENT' | 'RECEIVED';
    recipientId: string;
    recipientName: string;
    date: Date;
    balance: number;
    transactionCost: number;
    categoryId?: number;
    rawSms: string;
}

const parseBankSms = (smsText: string, sender: string): Transaction | null => {
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
    const transferPattern = /Bank\s+to\s+M-PESA\s+transfer\s+of\s+KES\s*([\d,]+\.\d{2})\s+to\s+(\d+)\s+-\s+(.+?)\s+successfully\s+processed\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+M-?PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

    // 2. Receipt / Confirmation
    const receiptPattern = /You\s+have\s+received\s+KES\s*([\d,]+\.\d{2})\s+from\s+(.+?)\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+(?:M-?PESA|Mpesa)\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

    // 3. Card Purchase
    const purchasePattern = /You\s+made\s+a\s+purchase\s+of\s*KES\s*([\d,]+\.\d{2})\s+on\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+at\s+(.+?)\s+using/i;

    let match = smsText.match(transferPattern);
    if (match) {
        console.log("MATCH FOUND for Transfer Pattern");
        return {
            id: match[4],
            amount: parseFloat(match[1].replace(/,/g, '')),
            type: 'SENT',
            recipientId: match[2],
            recipientName: match[3].trim(),
            date: new Date(),
            balance: 0,
            transactionCost: 0,
            rawSms: smsText,
        };
    }

    match = smsText.match(receiptPattern);
    if (match) {
        console.log("MATCH FOUND for Receipt Pattern");
        return {
            id: match[3], // Bank Ref
            amount: parseFloat(match[1].replace(/,/g, '')),
            type: 'SENT', // Forcing SENT as per user requirement to treat as duplicate expense info
            recipientId: 'SELF',
            recipientName: match[2].trim(),
            date: new Date(),
            balance: 0,
            transactionCost: 0,
            rawSms: smsText
        };
    }

    return null;
};

// ... (Helper remains same)

// ---------------------------------------------------------
// TEST EXECUTION
// ---------------------------------------------------------

const sender = "IANDMBANK";
const message1 = "Bank to M-PESA transfer of KES 2,000.00 to 0743491012 - BENSON NJOROGE MWANIKI successfully processed. Transaction Ref ID: 2933OIGG1912. M-PESA Ref ID: TL6FV0BMLA";
const message2 = "You have received KES 2,000.00 from BENSON NJOROGE MWANIKI. Transaction Ref ID: 2933OIGG1912. Mpesa Ref ID: TL6FV0BMLA. Bank to Mpesa Ni Sare Kabisa with I&M Bank.";

console.log("---------------------------------------------------");
console.log("Testing Deduplication");
console.log("Message 1 (Transfer):", message1);
const parsed1 = parseBankSms(message1, sender);
console.log("Parsed ID 1:", parsed1?.id);

console.log("\nMessage 2 (Receipt):", message2);
const parsed2 = parseBankSms(message2, sender);
console.log("Parsed ID 2:", parsed2?.id);

console.log("\nMatch?", parsed1?.id === parsed2?.id ? "✅ IDs MATCH (Reference ID Deduplication Works)" : "❌ IDs DO NOT MATCH");
console.log("---------------------------------------------------");
