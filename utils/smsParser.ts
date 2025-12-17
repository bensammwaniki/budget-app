import { Transaction } from '../types/transaction';

export const parseMpesaSms = (smsText: string): Transaction | null => {
    // 1. Standard Payment (Sent)
    // "TKTFVBL1ZS Confirmed. Ksh1,510.00 paid to DAD RONGAI. on 29/11/25 at 7:25 PM. New M-PESA balance is..."
    const sentPattern = /([A-Z0-9]+)\s+Confirmed\.[\s]*Ksh\s*([\d,]+\.\d{2})\s+paid\s+to\s+(.+?)\.\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+([\d:]+\s+[AP]M)\.\s*New\s+M-PESA\s+balance\s+is\s+Ksh\s*([\d,]+\.\d{2})\.\s+Transaction\s+cost,\s+Ksh\s*([\d,]+\.\d{2})/;

    // 2. Bank Transfer (Sent)
    // "TKSFVBGF9G Confirmed. Ksh900.00 sent to DTB Account for account 333667 on 28/11/25 at 3:06 PM New M-PESA balance is..."
    const bankPattern = /([A-Z0-9]+)\s+Confirmed\.[\s]*Ksh\s*([\d,]+\.\d{2})\s+sent\s+to\s+(.+?)\s+for\s+account\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+([\d:]+\s+[AP]M)/;

    // 3. Sent to Person (New Format)
    // "TKSFVBFE7G Confirmed. Ksh70.00 sent to ARNOLD  OCHIENG 0113706003 on 28/11/25 at 8:20 AM. New M-PESA balance is..."
    const sentPersonPattern = /([A-Z0-9]+)\s+Confirmed\.[\s]*Ksh\s*([\d,]+\.\d{2})\s+sent\s+to\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+([\d:]+\s+[AP]M)/;

    // 4. Withdrawal
    // "TKLFVATCJ7 Confirmed.on 21/11/25 at 2:26 PMWithdraw Ksh82,000.00 from 2998848 - Soluster LANGATA SHOPLANGATA New M-PESA balance is..."
    const withdrawPattern = /([A-Z0-9]+)\s+Confirmed\.on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+([\d:]+\s+[AP]M)Withdraw\s+Ksh\s*([\d,]+\.\d{2})\s+from\s+(.+?)\s+New\s+M-PESA/;

    // 5. Received Money
    // "RKXABCD123 Confirmed. You have received Ksh500.00 from JOHN DOE on 29/11/25 at 10:00 AM. New M-PESA balance is..."
    const receivedPattern = /([A-Z0-9]+)\s+Confirmed\.[\s]*You\s+have\s+received\s+Ksh\s*([\d,]+\.\d{2})\s+from\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+at\s+([\d:]+\s+[AP]M)/;

    let match = smsText.match(sentPattern);
    if (match) {
        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'SENT',
            recipientId: match[3].trim().toUpperCase(), // Name is the identifier
            recipientName: match[3].trim(),
            date: parseDate(match[4], match[5]),
            balance: parseFloat(match[6].replace(/,/g, '')),
            transactionCost: parseFloat(match[7].replace(/,/g, '')),
            rawSms: smsText
        };
    }

    match = smsText.match(bankPattern);
    if (match) {
        // For bank, recipientId is the account number, recipientName is the Bank Name
        const balanceMatch = smsText.match(/balance\s+is\s+Ksh\s*([\d,]+\.\d{2})/i);
        const costMatch = smsText.match(/cost,\s+Ksh\s*([\d,]+\.\d{2})/);

        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'SENT',
            recipientId: match[4].trim().toUpperCase(), // Account Number is the identifier
            recipientName: `${match[3].trim()} - ${match[4].trim()}`,
            date: parseDate(match[5], match[6]),
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            transactionCost: costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0,
            rawSms: smsText
        };
    }

    match = sentPersonPattern.exec(smsText);
    if (match) {
        const balanceMatch = smsText.match(/balance\s+is\s+Ksh\s*([\d,]+\.\d{2})/i);
        const costMatch = smsText.match(/cost,\s+Ksh\s*([\d,]+\.\d{2})/);

        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'SENT',
            recipientId: match[3].trim().toUpperCase(),
            recipientName: match[3].trim(),
            date: parseDate(match[4], match[5]),
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            transactionCost: costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0,
            rawSms: smsText
        };
    }

    match = withdrawPattern.exec(smsText);
    if (match) {
        const balanceMatch = smsText.match(/balance\s+is\s+Ksh\s*([\d,]+\.\d{2})/i);
        const costMatch = smsText.match(/cost,\s+Ksh\s*([\d,]+\.\d{2})/);

        return {
            id: match[1],
            amount: parseFloat(match[4].replace(/,/g, '')),
            type: 'SENT',
            recipientId: match[5].trim().toUpperCase(),
            recipientName: match[5].trim(),
            date: parseDate(match[2], match[3]),
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            transactionCost: costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0,
            rawSms: smsText
        };
    }

    match = smsText.match(receivedPattern);
    if (match) {
        const balanceMatch = smsText.match(/balance\s+is\s+Ksh\s*([\d,]+\.\d{2})/i);

        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'RECEIVED',
            recipientId: match[3].trim().toUpperCase(),
            recipientName: match[3].trim(),
            date: parseDate(match[4], match[5]),
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            transactionCost: 0,
            rawSms: smsText
        };
    }

    return null;
};

const parseDate = (dateStr: string, timeStr: string): Date => {
    // dateStr: "29/11/25", timeStr: "7:25 PM"
    const [day, month, year] = dateStr.split('/').map(Number);
    const fullYear = 2000 + year;

    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }

    return new Date(fullYear, month - 1, day, hours, minutes);
};

export const parseFulizaLoan = (smsText: string, timestamp?: number): any | null => {
    // Relaxed check: Handle both M-PESA and M-Pesa
    const normalizedText = smsText.replace(/M-Pesa/g, 'M-PESA');

    if (!normalizedText.includes('Fuliza M-PESA amount is Ksh') ||
        !normalizedText.includes('Access Fee charged Ksh') ||
        !normalizedText.includes('Total Fuliza M-PESA outstanding amount is')) {
        return null;
    }

    // Pattern: "KFFVAAH1Z Confirmed. Fuliza M-PESA amount is Ksh 50.00. Access Fee charged Ksh 0.50. Total Fuliza M-PESA outstanding amount is Ksh244.15 due on..."
    // Note: Safaricom inconsistently puts space after Ksh (e.g. "Ksh 50.00" but "Ksh244.15")
    const pattern = /([A-Z0-9]+)\s+Confirmed\.\s+Fuliza M-PESA amount is Ksh\s*([\d,]+\.\d{2})\.\s+Access Fee charged Ksh\s*([\d,]+\.\d{2})\.\s+Total Fuliza M-PESA outstanding amount is Ksh\s*([\d,]+\.\d{2})\s+due on\s+(\d{1,2}\/\d{1,2}\/\d{2})/;

    const match = normalizedText.match(pattern);
    if (match) {
        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'LOAN',
            accessFee: parseFloat(match[3].replace(/,/g, '')),
            outstandingBalance: parseFloat(match[4].replace(/,/g, '')),
            dueDate: parseDate(match[5], '12:00 AM'),
            date: timestamp ? new Date(timestamp) : new Date(),
            rawSms: smsText
        };
    }
    return null;
};

export const parseFulizaRepayment = (smsText: string, timestamp?: number): any | null => {
    // Relaxed check: Handle both M-PESA and M-Pesa
    const normalizedText = smsText.replace(/M-Pesa/g, 'M-PESA');

    // ULTRA STRICT: Must contain exact phrase for repayment
    if (!normalizedText.includes('used to partially pay your outstanding Fuliza M-PESA') &&
        !normalizedText.includes('used to fully pay your outstanding Fuliza M-PESA')) {
        return null;
    }

    // Pattern: "TKIFVAJ7HG Confirmed. Ksh 1000.00 from your M-PESA has been used to partially pay..."
    const pattern = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh\s+([\d,]+\.\d{2})\s+from your M-PESA has been used to (partially|fully) pay your outstanding Fuliza M-PESA/;

    // Check for M-PESA balance in the message
    // "M-PESA balance is Ksh611.40."
    const balancePattern = /M-PESA balance is Ksh\s*([\d,]+\.\d{2})/;

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

        // EXTRACT ACCOUNT BALANCE
        let accountBalance: number | undefined = undefined;
        const balanceMatch = normalizedText.match(balancePattern);
        if (balanceMatch) {
            accountBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
        }

        return {
            id: match[1],
            amount: parseFloat(match[2].replace(/,/g, '')),
            type: 'REPAYMENT',
            outstandingBalance: outstandingBalance,
            accountBalance: accountBalance, // New field
            date: timestamp ? new Date(timestamp) : new Date(),
            rawSms: smsText
        };
    }
    return null;
};
