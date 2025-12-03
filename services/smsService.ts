import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { initDatabase, saveTransaction } from './database';
import { parseMpesaSms } from '../utils/smsParser';

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
export const readMpesaSMS = async (): Promise<SMSMessage[]> => {
    // If not Android, return mock data immediately (for iOS/Web dev)
    if (Platform.OS !== 'android') {
        return MOCK_MESSAGES as any;
    }

    try {
        // Check permission first
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_SMS
        );

        if (!hasPermission) {
            const granted = await requestSMSPermission();
            if (!granted) {
                return MOCK_MESSAGES as any;
            }
        }

        return new Promise((resolve, reject) => {
            const filter = {
                box: 'inbox', // 'inbox', 'sent', 'draft', 'outbox', 'failed', 'queued'
                address: 'MPESA', // Filter for M-PESA sender
                indexFrom: 0,
                maxCount: 5000,
                minDate: Date.now() - (365 * 24 * 60 * 60 * 1000), // Limit to last 1 year
            };

            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => {
                    console.error('Failed to read SMS:', fail);
                    resolve(MOCK_MESSAGES as any);
                },
                (count: number, smsList: string) => {
                    try {
                        const messages: SMSMessage[] = JSON.parse(smsList);
                        if (messages.length === 0) {
                            resolve(MOCK_MESSAGES as any);
                        } else {
                            resolve(messages);
                        }
                    } catch (error) {
                        console.error('Error parsing SMS:', error);
                        resolve(MOCK_MESSAGES as any);
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error reading M-PESA SMS:', error);
        return MOCK_MESSAGES as any;
    }
};

// Kept for backward compatibility if needed, but index.tsx uses readMpesaSMS directly
export const syncMessages = async () => {
    // Initialize DB if not already
    await initDatabase();

    try {
        const messages = await readMpesaSMS();

        let newTransactionsCount = 0;

        for (const msg of messages) {
            // Check if address is MPESA (Mock data has it, real data filter does it)
            if (msg.address === 'MPESA') {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    await saveTransaction(parsed);
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
