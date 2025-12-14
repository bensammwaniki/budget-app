// Embedded Parser for Testing
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
    // Pattern: "Bank to M-PESA transfer of KES 1,500.00 to 0702173240 - PAULINE WAIRIMU NGUGI successfully processed. Transaction Ref ID: 2987VCSA2052. M-PESA Ref ID: TLCNB0QWT3"
    const transferPattern = /Bank\s+to\s+M-PESA\s+transfer\s+of\s+KES\s*([\d,]+\.\d{2})\s+to\s+(\d+)\s+-\s+(.+?)\s+successfully\s+processed\.\s+Transaction\s+Ref\s+ID:\s+([A-Z0-9]+)\.\s+M-PESA\s+Ref\s+ID:\s+([A-Z0-9]+)/i;

    // 3. Card Purchase
    // Pattern: "Dear BENSON, You made a purchase of KES 700.00 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012. If you did not effect the transaction..."
    // Updated to accept optional decimals and different date formats
    const purchasePattern = /You\s+made\s+a\s+purchase\s+of\s*KES\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+([\d-]{8,10})\s+(\d{2}:\d{2}:\d{2})\s+at\s+(.+?)\s+using/i;

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
        };
    }

    match = smsText.match(purchasePattern);
    if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const dateStr = match[2];
        const timeStr = match[3];
        const merchant = match[4].trim();

        // Handle DD-MM-YYYY or YYYY-MM-DD
        let normalizedDate = dateStr;
        if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = dateStr.split('-');
            normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

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

// Test Logic
const testMessages = [
    {
        sender: 'I&M',
        body: 'Dear BENSON, You made a purchase of KES 700.00 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012. If you did not effect the transaction...'
    },
    {
        sender: 'I&M',
        body: 'Dear BENSON, You made a purchase of KES 700 on 2025-11-21 22:10:21 at CASTLE GARDENS using I&M 5477********0012.' // No decimals
    },
    {
        sender: 'I&M',
        body: 'Dear BENSON, You made a purchase of KES 1,000.50 on 21-11-2025 22:10:21 at SUPERMARKET.' // Different date format
    }
];

console.log('--- Starting Parser Test ---');

testMessages.forEach((msg, index) => {
    console.log(`\nTest Case ${index + 1}:`);
    console.log(`Body: ${msg.body}`);
    const result = parseBankSms(msg.body, msg.sender);
    if (result) {
        console.log('✅ Parsed Success:', JSON.stringify(result, null, 2));
    } else {
        console.log('❌ Parse Failed');
    }
});
