import { Platform } from 'react-native';
import { addTransaction, initDatabase } from './database';
import { parseMessage } from './smsParser';

// Mock Data for Expo Go testing
const MOCK_MESSAGES = [
    {
        _id: '1',
        address: 'MPESA',
        body: 'SDC12345 Confirmed. Ksh1,200.00 sent to JOHN DOE 0712345678 on 1/1/25 at 10:00 AM. New M-PESA balance is Ksh500.00. Transaction cost, Ksh15.00.',
        date: Date.now() - 86400000 * 1, // 1 day ago
    },
    {
        _id: '2',
        address: 'MPESA',
        body: 'SDC12346 Confirmed. You have received Ksh5,000.00 from JANE DOE 0722345678 on 2/1/25 at 2:00 PM. New M-PESA balance is Ksh5,500.00.',
        date: Date.now() - 86400000 * 0.5, // 12 hours ago
    },
    {
        _id: '3',
        address: 'MPESA',
        body: 'SDC12347 Confirmed. Ksh500.00 paid to Naivas Supermarket. on 2/1/25 at 5:00 PM. New M-PESA balance is Ksh5,000.00.',
        date: Date.now() - 1000 * 60 * 30, // 30 mins ago
    },
    {
        _id: '4',
        address: 'MPESA',
        body: 'SDC12348 Confirmed. on 3/1/25 at 9:00 AM Withdraw Ksh2,000.00 from 123456 - AGENT NAME. New M-PESA balance is Ksh3,000.00.',
        date: Date.now(), // Just now
    }
];

export const syncMessages = async () => {
    // Initialize DB if not already
    initDatabase();

    try {
        // Check if we can read real SMS
        // In Expo Go, this will likely fail or we can just default to mock
        // For this implementation, we will default to MOCK if we are in a dev environment without the native module

        // TODO: Implement real SMS reading using 'react-native-get-sms-android' when in a custom dev client
        // const SmsAndroid = require('react-native-get-sms-android');
        // if (SmsAndroid) { ... }

        console.log('Syncing messages (Mock Mode)...');

        let newTransactionsCount = 0;

        for (const msg of MOCK_MESSAGES) {
            if (msg.address === 'MPESA') {
                const parsed = parseMessage(msg.body, msg.date);
                if (parsed) {
                    addTransaction({
                        ...parsed,
                        body: msg.body,
                        category: 'Uncategorized', // Default category
                    });
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
