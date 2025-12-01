import { Transaction } from './database';

interface ParsedData {
    amount: number;
    recipient: string;
    date: string;
    type: Transaction['type'];
    message_id: string;
}

export const parseMessage = (body: string, timestamp: number): ParsedData | null => {
    // Basic M-PESA Regex Patterns
    // Note: These are simplified and might need tuning for all edge cases.

    // Example: SDC12345 Confirmed. Ksh1,200.00 sent to JOHN DOE 0712345678 on 1/1/25 at 10:00 AM. New M-PESA balance is Ksh500.00. Transaction cost, Ksh15.00.
    const sendRegex = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+sent\s+to\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

    // Example: SDC12345 Confirmed. You have received Ksh1,200.00 from JOHN DOE 0712345678 on 1/1/25 at 10:00 AM. New M-PESA balance is Ksh1,700.00.
    const receiveRegex = /([A-Z0-9]+)\s+Confirmed\.\s+You\s+have\s+received\s+Ksh([\d,]+\.?\d*)\s+from\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

    // Example: SDC12345 Confirmed. Ksh1,200.00 sent to 123456 - KPLC PREPAID for account 123456789 on 1/1/25 at 10:00 AM.
    const payBillRegex = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+sent\s+to\s+(.+?)\s+for\s+account\s+(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

    // Example: SDC12345 Confirmed. Ksh1,200.00 paid to Naivas Supermarket. on 1/1/25 at 10:00 AM.
    const buyGoodsRegex = /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+paid\s+to\s+(.+?)\.\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

    // Example: SDC12345 Confirmed. on 1/1/25 at 10:00 AM Withdraw Ksh1,200.00 from 123456 - AGENT NAME. New M-PESA balance is Ksh...
    const withdrawRegex = /([A-Z0-9]+)\s+Confirmed\.\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)\s+Withdraw\s+Ksh([\d,]+\.?\d*)\s+from\s+(.+?)\./i;

    let match;
    let type: Transaction['type'] = 'UNKNOWN';
    let amount = 0;
    let recipient = 'Unknown';
    let dateStr = '';
    let message_id = '';

    if ((match = body.match(sendRegex))) {
        type = 'SEND';
        message_id = match[1];
        amount = parseFloat(match[2].replace(/,/g, ''));
        recipient = match[3];
        dateStr = `${match[4]} ${match[5]}`;
    } else if ((match = body.match(receiveRegex))) {
        type = 'RECEIVE';
        message_id = match[1];
        amount = parseFloat(match[2].replace(/,/g, ''));
        recipient = match[3];
        dateStr = `${match[4]} ${match[5]}`;
    } else if ((match = body.match(payBillRegex))) {
        type = 'PAYBILL';
        message_id = match[1];
        amount = parseFloat(match[2].replace(/,/g, ''));
        recipient = match[3]; // Business Name
        dateStr = `${match[5]} ${match[6]}`;
    } else if ((match = body.match(buyGoodsRegex))) {
        type = 'BUYGOODS';
        message_id = match[1];
        amount = parseFloat(match[2].replace(/,/g, ''));
        recipient = match[3];
        dateStr = `${match[4]} ${match[5]}`;
    } else if ((match = body.match(withdrawRegex))) {
        type = 'WITHDRAW';
        message_id = match[1];
        amount = parseFloat(match[4].replace(/,/g, ''));
        recipient = match[5];
        dateStr = `${match[2]} ${match[3]}`;
    }

    if (type !== 'UNKNOWN') {
        // Convert dateStr to ISO format if possible, else use timestamp
        // For simplicity, we'll use the current timestamp or the one passed in if parsing fails
        // But let's try to keep the string for display
        return {
            message_id,
            amount,
            recipient,
            date: dateStr || new Date(timestamp).toISOString(),
            type,
        };
    }

    return null;
};
