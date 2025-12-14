import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { extractMpesaRefFromBankSms, parseBankSms } from '../utils/bankParser';
import { parseMpesaSms } from '../utils/smsParser';
import { getUserSettings, initDatabase, saveTransaction, transactionExists } from './database';

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
        console.log(`⚙️ I&M Bank Enabled: ${imBankEnabled}`);

        let newTransactionsCount = 0;

        for (const msg of messages) {
            // 1. Process M-PESA
            if (msg.address === 'MPESA') {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    await saveTransaction(parsed);
                    newTransactionsCount++;
                }
            }
            // 2. Process I&M Bank (if enabled)
            else if (imBankEnabled && (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK'))) {
                console.log(`Testing Bank Message: ${msg.body.substring(0, 50)}...`);
                const parsed = parseBankSms(msg.body, msg.address);
                if (parsed) {
                    console.log(`Parsed Bank Transaction:`, JSON.stringify(parsed, null, 2));
                    // DUPLICATE CHECK: 
                    // Verify if this transaction was already captured via M-PESA
                    const mpesaRef = extractMpesaRefFromBankSms(msg.body);
                    if (mpesaRef) {
                        const exists = await transactionExists(mpesaRef);
                        if (exists) {
                            console.log(`Skipping duplicate Bank transaction (M-PESA Ref ${mpesaRef} exists)`);
                            continue;
                        }
                    }

                    // Proceed to save (INSERT OR REPLACE handles updates for same Bank Ref ID)
                    // Use SMS timestamp for date
                    parsed.date = new Date(msg.date);
                    await saveTransaction(parsed);
                    console.log(`✅ Processed Bank Transaction: ${parsed.recipientName} - KES ${parsed.amount}`);
                    newTransactionsCount++;
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
            console.log('📱 Reading SMS with filter:', JSON.stringify(filter));

            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => {
                    console.error('❌ Failed to read SMS:', fail);
                    resolve([]);
                },
                (count: number, smsList: string) => {
                    try {
                        console.log(`📱 Raw SMS count: ${count}`);
                        const messages: SMSMessage[] = JSON.parse(smsList);
                        console.log(`📱 Parsed ${messages.length} messages`);
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
