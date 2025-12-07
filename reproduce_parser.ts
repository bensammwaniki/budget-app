
const parseFulizaRepayment = (smsText: string): any | null => {
    // Relaxed check: Handle both M-PESA and M-Pesa
    const normalizedText = smsText.replace(/M-Pesa/g, 'M-PESA');

    // ULTRA STRICT: Must contain exact phrase for repayment
    if (!normalizedText.includes('used to partially pay your outstanding Fuliza M-PESA') &&
        !normalizedText.includes('used to fully pay your outstanding Fuliza M-PESA')) {
        return null;
    }

    // Pattern: "TKIFVAJ7HG Confirmed. Ksh 1000.00 from your M-PESA has been used to partially pay..."
    const pattern = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh\s+([\d,]+\.\d{2})\s+from your M-PESA has been used to (partially|fully) pay your outstanding Fuliza M-PESA/;

    const match = normalizedText.match(pattern);
    if (match) {
        const paymentType = match[3]; // 'partially' or 'fully'

        // Try to extract remaining balance/limit - handle both formats
        let outstandingBalance: number | undefined = undefined;

        // Try "Your available" format
        let limitMatch = normalizedText.match(/Your available Fuliza M-PESA limit is Ksh\s+([\d,]+\.\d{2})/);

        // If not found, try "Available" format (without "Your")
        if (!limitMatch) {
            limitMatch = normalizedText.match(/Available Fuliza M-PESA limit is Ksh\s+([\d,]+\.\d{2})/);
        }

        if (paymentType === 'fully') {
            // If it says "fully pay", the outstanding balance is 0
            outstandingBalance = 0;
        } else if (limitMatch) {
            // For partial payments, if we found the limit, use it
            // Note: "Available limit" is NOT the outstanding balance, it's the credit available
            // But the old parser was treating it as such, so keeping for consistency
            outstandingBalance = parseFloat(limitMatch[1].replace(/,/g, ''));
        }
        // else: partial payment with no balance info = undefined (will be calculated)

        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'REPAYMENT',
            outstandingBalance: outstandingBalance,
            rawSms: smsText,
            debug: { paymentType, limitMatch: limitMatch ? limitMatch[0] : 'null' }
        };
    }
    return null;
};

const sms = `TL6FV0BMLB
 Confirmed. Ksh 244.15 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 1500.00. M-PESA balance is Ksh1,755.85.`;

const smsOneLine = `TL6FV0BMLB Confirmed. Ksh 244.15 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 1500.00. M-PESA balance is Ksh1,755.85.`;

console.log("Parsing multi-line:");
console.log(JSON.stringify(parseFulizaRepayment(sms), null, 2));

console.log("\nParsing single-line:");
console.log(JSON.stringify(parseFulizaRepayment(smsOneLine), null, 2));

const parseFulizaLoan = (smsText: string): any | null => {
    // Relaxed check: Handle both M-PESA and M-Pesa
    const normalizedText = smsText.replace(/M-Pesa/g, 'M-PESA');

    if (!normalizedText.includes('Fuliza M-PESA amount is Ksh') ||
        !normalizedText.includes('Access Fee charged Ksh') ||
        !normalizedText.includes('Total Fuliza M-PESA outstanding amount is')) {
        return null;
    }

    /*
     * Regex breakdown:
     * 1. ID: ([A-Z0-9]+)
     * 2. Confirmed. Fuliza M-PESA amount is Ksh 
     * 3. Loan Amount: ([\d,]+\.\d{2})
     * 4. . Access Fee charged Ksh 
     * 5. Fee Amount: ([\d,]+\.\d{2})
     * 6. . Total Fuliza M-PESA outstanding amount is Ksh
     * 7. Outstanding Balance: ([\d,]+\.\d{2})
     * 8. due on 
     * 9. Due Date: (\d{2}\/\d{2}\/\d{2}) 
     */
    // "TL5FV06V3A Confirmed. Fuliza M-Pesa amount is Ksh 100.00. Access Fee charged Ksh 1.00. Total Fuliza M-Pesa outstanding amount is Ksh173.45 due on 03/01/26."
    const pattern = /([A-Z0-9]+)\s+Confirmed\.\s+Fuliza M-PESA amount is Ksh\s+([\d,]+\.\d{2})\.\s+Access Fee charged Ksh\s+([\d,]+\.\d{2})\.\s+Total Fuliza M-PESA outstanding amount is Ksh([\d,]+\.\d{2})/;

    // Note: older messages might not have the "due on..." part or different spacing?
    const match = normalizedText.match(pattern);

    if (match) {
        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'LOAN',
            accessFee: parseFloat(match[3].replace(/,/g, '')),
            outstandingBalance: parseFloat(match[4].replace(/,/g, '')),
            rawSms: smsText
        };
    }
    return null;
};

const loanSms = `TL5FV06V3A Confirmed. Fuliza M-Pesa amount is Ksh 100.00. Access Fee charged Ksh 1.00. Total Fuliza M-Pesa outstanding amount is Ksh173.45 due on 03/01/26. To check daily charges, Dial *234*0#OK Select Query Charges`;
const loanSms2 = `TL4FV05XMV Confirmed. Fuliza M-Pesa amount is Ksh 71.73. Access Fee charged Ksh 0.72. Total Fuliza M-Pesa outstanding amount is Ksh72.45 due on 03/01/26. To check daily charges, Dial *234*0#OK Select Query Charges`;

console.log("\nParsing Loan 1:");
console.log(JSON.stringify(parseFulizaLoan(loanSms), null, 2));


const parseMpesaSms = (smsText: string): any | null => {
    // Basic regex for Money Sent
    // "TKIFVAJ7HG Confirmed. Ksh100.00 sent to OROKISE SACCO..."
    const sentPattern = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.\d{2})\s+sent to\s+(.+?)\s+(?:for account (.+?)\s+)?on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)/;

    // Basic regex for Money Received
    // "TKIFVAJ7HG Confirmed. You have received Ksh100.00 from..."
    const receivedPattern = /([A-Z0-9]+)\s+Confirmed\.\s+You have received\s+Ksh([\d,]+\.\d{2})\s+from\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)/;

    // Basic regex for Payment (Pay Bill / Buy Goods)
    // "TKIFVAJ7HG Confirmed. Ksh100.00 paid to..."
    const paidPattern = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.\d{2})\s+paid to\s+(.+?)\.\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)/;

    if (smsText.match(sentPattern)) return { type: 'SENT' };
    if (smsText.match(receivedPattern)) return { type: 'RECEIVED' };
    if (smsText.match(paidPattern)) return { type: 'SENT' };

    return null;
};

const skipped1 = `TL5FV06P6N Confirmed. Fuliza M-Pesa amount is Ksh 70.00. Access Fee charged Ksh 0.70. Total Fuliza M-Pesa outstanding amount is Ksh244.15 due on 03/01/26. To check daily charges, Dial *234*0#OK Select Query Charges`;

console.log("\nParsing Skipped 1:");
console.log(JSON.stringify(parseFulizaLoan(skipped1), null, 2));

