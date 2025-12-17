import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { extractMpesaRefFromBankSms, parseBankSms } from '../utils/bankParser';
import { parseFulizaLoan, parseFulizaRepayment, parseMpesaSms } from '../utils/smsParser';
import { getUserSettings, initDatabase, saveFulizaTransaction, saveTransaction, transactionExists } from './database';

export interface SMSMessage {
    _id: string;
    address: string;
    body: string;
    date: number;
    type: number;
}

// Helper to format date as DD/MM/YY for mock messages
const getMockDateStr = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString().slice(-2);
    return `${d}/${m}/${y}`;
};

const NOW = new Date();
const YESTERDAY = new Date(Date.now() - 86400000);
const TWO_DAYS_AGO = new Date(Date.now() - 86400000 * 2);

// Mock Data for Expo Go testing
const MOCK_MESSAGES = [
    {
        _id: '1',
        address: 'MPESA',
        body: `SDC12345 Confirmed. Ksh1,200.00 paid to JOHN DOE. on ${getMockDateStr(YESTERDAY)} at 10:00 AM. New M-PESA balance is Ksh500.00. Transaction cost, Ksh15.00.`,
        date: YESTERDAY.getTime(),
    },
    {
        _id: '2',
        address: 'MPESA',
        body: `SDC12346 Confirmed. You have received Ksh5,000.00 from JANE DOE on ${getMockDateStr(NOW)} at 2:00 PM. New M-PESA balance is Ksh5,500.00.`,
        date: NOW.getTime(),
    },
    {
        _id: '3',
        address: 'MPESA',
        body: `SDC12347 Confirmed. Ksh500.00 paid to Naivas Supermarket. on ${getMockDateStr(TWO_DAYS_AGO)} at 5:00 PM. New M-PESA balance is Ksh5,000.00. Transaction cost, Ksh5.00.`,
        date: TWO_DAYS_AGO.getTime(),
    },
    {
        _id: '4',
        address: 'MPESA',
        body: `SDC12348 Confirmed.on ${getMockDateStr(NOW)} at 9:00 AMWithdraw Ksh2,000.00 from 123456 - AGENT NAME New M-PESA balance is Ksh3,000.00.`,
        date: NOW.getTime(),
    }
];

/**
 * Request SMS permissions on Android
 */
export const requestSMSPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        return false;
    }

    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_SMS,
            {
                title: 'SMS Permission',
                message: 'This app needs access to your SMS messages to track M-PESA transactions',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
            }
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
        console.error('Error requesting SMS permission:', err);
        return false;
    }
};

/**
 * Read M-PESA SMS messages from the phone
 */
// Old readMpesaSMS removed, replaced by readAllSMS below

// Kept for backward compatibility if needed, but index.tsx uses readMpesaSMS directly
export const syncMessages = async () => {
    // Initialize DB if not already
    await initDatabase();

    try {
        const messages = await readMpesaSMS();
        const imBankEnabled = await getUserSettings('bank_im_enabled') === 'true';


        let newTransactionsCount = 0;

        const sendersFound = new Set<string>();

        // PASS 1: Process M-PESA Messages ONLY
        // We do this first so that potential duplicates are already in the DB before Bank SMS attempts to check them.
        for (const msg of messages) {
            sendersFound.add(msg.address);
            if (msg.address === 'MPESA') {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    await saveTransaction(parsed);
                    newTransactionsCount++;
                } else {
                    // Try parsing as Fuliza Loan
                    const fulizaLoan = parseFulizaLoan(msg.body, msg.date);
                    if (fulizaLoan) {
                        await saveFulizaTransaction(fulizaLoan);
                        // We also treat loans as 'Received' money conceptually, but for now we just track debt
                        // If we want it to show as income, we'd need to convert it to a Transaction too
                        // But typically Fuliza acts as an overdraft on a transaction, so it's complex.
                        // For now, just saving to fuliza_transactions is enough for fee calculation.
                        continue;
                    }

                    // Try parsing as Fuliza Repayment
                    const fulizaRepayment = parseFulizaRepayment(msg.body, msg.date);
                    if (fulizaRepayment) {
                        await saveFulizaTransaction(fulizaRepayment);

                        // IF the repayment message contains an account balance, we should save it
                        // as a "SENT" transaction so that the main balance logic (which looks at 'transactions' table)
                        // picks it up!
                        if (fulizaRepayment.accountBalance !== undefined) {
                            await saveTransaction({
                                id: fulizaRepayment.id, // Use same ID
                                amount: fulizaRepayment.amount,
                                type: 'SENT',
                                recipientId: 'FULIZA_REPAYMENT',
                                recipientName: 'Fuliza Repayment',
                                date: fulizaRepayment.date,
                                balance: fulizaRepayment.accountBalance,
                                transactionCost: 0,
                                categoryId: undefined, // Or assign to a Debt category if preferred
                                rawSms: fulizaRepayment.rawSms
                            });
                        }

                        continue;
                    }
                }
            }
        }

        // PASS 2: Process Bank Messages (if enabled)
        // Now valid M-PESA transactions are guaranteed to be in the DB.
        if (imBankEnabled) {
            for (const msg of messages) {
                if (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK')) {

                    const parsed = parseBankSms(msg.body, msg.address);
                    if (parsed) {


                        // DUPLICATE CHECK: 
                        // Verify if this transaction was already captured via M-PESA
                        const mpesaRef = extractMpesaRefFromBankSms(msg.body);
                        if (mpesaRef) {
                            const exists = await transactionExists(mpesaRef);
                            // Also check if we JUST added it in Pass 1? transactionExists checks DB, so yes.
                            if (exists) {

                                continue;
                            }
                        }

                        // Proceed to save (INSERT OR REPLACE handles updates for same Bank Ref ID)
                        parsed.date = new Date(msg.date);
                        await saveTransaction(parsed);
                        newTransactionsCount++;
                    }
                }
            }
        }
        return { success: true, count: newTransactionsCount };

    } catch (error) {
        console.error('Error syncing messages:', error);
        return { success: false, error };
    }
};

/**
 * Read ALL SMS messages from the phone (filtered by known senders later)
 * We modify readMpesaSMS to actually read broader set if needed, 
 * but since filter is JSON, we can't do OR. 
 * So we will read ALL and filter in JS, OR make multiple calls.
 * For efficiency, let's keep the filter generic or empty address? 
 * No, empty address reads EVERYTHING. 
 * Better strategy: Read with no address filter, but rely on indexFrom/maxCount and date.
 */
export const readAllSMS = async (): Promise<SMSMessage[]> => {
    // If not Android, return mock data
    if (Platform.OS !== 'android') {
        return MOCK_MESSAGES as any;
    }

    try {
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_SMS
        );

        if (!hasPermission) {
            const granted = await requestSMSPermission();
            if (!granted) {
                return MOCK_MESSAGES as any;
            }
        }

        return new Promise((resolve) => {
            const filter = {
                box: 'inbox',
                indexFrom: 0,
                maxCount: 2000, // Reasonable batch size
                minDate: Date.now() - (90 * 24 * 60 * 60 * 1000), // Increased to 90 days to catch older testing messages
            };


            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => {
                    console.error('❌ Failed to read SMS:', fail);
                    resolve([]);
                },
                (count: number, smsList: string) => {
                    try {

                        const messages: SMSMessage[] = JSON.parse(smsList);

                        resolve(messages);
                    } catch (error) {
                        console.error('Error parsing SMS:', error);
                        resolve([]);
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error reading SMS:', error);
        return [];
    }
};

// Override readMpesaSMS to use readAllSMS for backward compat, 
// or update callsites. SyncMessages is the main one used.
export const readMpesaSMS = readAllSMS;
