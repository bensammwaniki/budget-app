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

// Mock Data for Expo Go testing
const MOCK_MESSAGES = [
    {
        _id: '1',
        address: 'MPESA',
        body: 'SDC12345 Confirmed. Ksh1,200.00 paid to JOHN DOE. on 1/1/25 at 10:00 AM. New M-PESA balance is Ksh500.00. Transaction cost, Ksh15.00.',
        date: Date.now() - 86400000 * 1, // 1 day ago
    },
    {
        _id: '2',
        address: 'MPESA',
        body: 'SDC12346 Confirmed. You have received Ksh5,000.00 from JANE DOE on 2/1/25 at 2:00 PM. New M-PESA balance is Ksh5,500.00.',
        date: Date.now() - 86400000 * 0.5, // 12 hours ago
    },
    {
        _id: '3',
        address: 'MPESA',
        body: 'SDC12347 Confirmed. Ksh500.00 paid to Naivas Supermarket. on 2/1/25 at 5:00 PM. New M-PESA balance is Ksh5,000.00. Transaction cost, Ksh5.00.',
        date: Date.now() - 1000 * 60 * 30, // 30 mins ago
    },
    {
        _id: '4',
        address: 'MPESA',
        body: 'SDC12348 Confirmed.on 3/1/25 at 9:00 AMWithdraw Ksh2,000.00 from 123456 - AGENT NAME New M-PESA balance is Ksh3,000.00.',
        date: Date.now(), // Just now
    }
];

/**
 * Request SMS permissions on Android
 */
export const requestSMSPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        console.log('SMS reading only supported on Android');
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
        console.log('Not Android, returning mock data');
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
                console.log('SMS permission denied, returning mock data for demo');
                return MOCK_MESSAGES as any;
            }
        }

        return new Promise((resolve, reject) => {
            const filter = {
                box: 'inbox', // 'inbox', 'sent', 'draft', 'outbox', 'failed', 'queued'
                address: 'MPESA', // Filter for M-PESA sender
                indexFrom: 0,
                maxCount: 100, // Get last 100 M-PESA messages
            };

            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => {
                    console.error('Failed to read SMS:', fail);
                    // Fallback to mock if reading fails (e.g. Expo Go)
                    console.log('Falling back to mock data');
                    resolve(MOCK_MESSAGES as any);
                },
                (count: number, smsList: string) => {
                    try {
                        const messages: SMSMessage[] = JSON.parse(smsList);
                        console.log(`Found ${messages.length} M-PESA messages`);
                        if (messages.length === 0) {
                            console.log('No messages found, using mock data');
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
        console.log(`Syncing ${messages.length} messages...`);

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
