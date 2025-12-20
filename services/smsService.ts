import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { extractMpesaRefFromBankSms, parseBankSms } from '../utils/bankParser';
import { parseFulizaLoan, parseFulizaRepayment, parseMpesaSms } from '../utils/smsParser';
import {
    getUserSettings,
    initDatabase,
    notifyListeners,
    saveFulizaTransaction,
    saveTransaction,
    saveUserSettings,
    transactionExists
} from './database';

export interface SMSMessage {
    _id: string;
    address: string;
    body: string;
    date: number;
    type: number;
}

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
export const syncMessages = async (days: number = 30) => {
    // Initialize DB if not already
    await initDatabase();

    try {
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_SMS
        );
        if (!hasPermission) {
            console.log('⚠️ SMS Permission not granted, skipping sync');
            return { success: false, error: 'Permission not granted' };
        }

        // SMART SYNC: Check last sync time
        let syncDays = days;
        const lastSyncStr = await getUserSettings('last_sync_timestamp');

        if (!lastSyncStr) {
            // DEEP SYNC: On first launch, go back 180 days (6 months)
            syncDays = 180;
            console.log(`🚀 Initial launch: Performing deep historical sync (180 days).`);
        } else {
            const lastSync = parseInt(lastSyncStr, 10);
            const daysSinceLastSync = Math.ceil((Date.now() - lastSync) / (1000 * 60 * 60 * 24));

            // For periodic syncs, we usually bridge the gap plus one extra day for safety.
            // But we respect the 'days' cap (which is usually 30 for manual refresh, 7 for quick sync).
            syncDays = Math.max(1, Math.min(Math.max(days, daysSinceLastSync + 1), 365));
            console.log(`🔄 Last sync was ${daysSinceLastSync} days ago. Syncing ${syncDays} days.`);
        }

        const messages = await readMpesaSMS(syncDays);
        const imBankEnabled = await getUserSettings('bank_im_enabled') === 'true';


        let newTransactionsCount = 0;

        const sendersFound = new Set<string>();

        // PASS 1: Process M-PESA Messages ONLY
        for (const msg of messages) {
            sendersFound.add(msg.address);
            if (msg.address === 'MPESA') {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    // Check if already exists to avoid overwriting manual categories
                    const exists = await transactionExists(parsed.id);
                    if (!exists) {
                        await saveTransaction(parsed, false); // No individual notification
                        newTransactionsCount++;
                    }
                } else {
                    // Try parsing as Fuliza Loan
                    const fulizaLoan = parseFulizaLoan(msg.body, msg.date);
                    if (fulizaLoan) {
                        await saveFulizaTransaction(fulizaLoan);
                        continue;
                    }

                    // Try parsing as Fuliza Repayment
                    const fulizaRepayment = parseFulizaRepayment(msg.body, msg.date);
                    if (fulizaRepayment) {
                        await saveFulizaTransaction(fulizaRepayment);

                        if (fulizaRepayment.accountBalance !== undefined) {
                            await saveTransaction({
                                id: fulizaRepayment.id,
                                amount: fulizaRepayment.amount,
                                type: 'SENT',
                                recipientId: 'FULIZA_REPAYMENT',
                                recipientName: 'Fuliza Repayment',
                                date: fulizaRepayment.date,
                                balance: fulizaRepayment.accountBalance,
                                transactionCost: 0,
                                categoryId: undefined,
                                rawSms: fulizaRepayment.rawSms
                            }, false); // No individual notification
                        }

                        continue;
                    }
                }
            }
        }

        // PASS 2: Process Bank Messages (if enabled)
        if (imBankEnabled) {
            for (const msg of messages) {
                if (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK')) {
                    const parsed = parseBankSms(msg.body, msg.address);
                    if (parsed) {
                        const mpesaRef = extractMpesaRefFromBankSms(msg.body);
                        if (mpesaRef) {
                            const exists = await transactionExists(mpesaRef);
                            if (exists) continue;
                        }

                        parsed.date = new Date(msg.date);
                        await saveTransaction(parsed, false); // No individual notification
                        newTransactionsCount++;
                    }
                }
            }
        }

        // Save sync time
        await saveUserSettings('last_sync_timestamp', Date.now().toString());

        // Notify once after everything is synced
        notifyListeners('TRANSACTIONS');

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
export const readAllSMS = async (days: number = 30): Promise<SMSMessage[]> => {
    if (Platform.OS !== 'android') return [];

    try {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
        if (!hasPermission) return [];

        let allMessages: SMSMessage[] = [];
        let indexFrom = 0;
        const batchSize = 1000;
        const minDate = Date.now() - (days * 24 * 60 * 60 * 1000);

        console.log(`🔍 Combing through SMS for the last ${days} days...`);

        while (true) {
            const batch: SMSMessage[] = await new Promise((resolve) => {
                const filter = {
                    box: 'inbox',
                    indexFrom,
                    maxCount: batchSize,
                    minDate,
                };

                SmsAndroid.list(
                    JSON.stringify(filter),
                    (fail: any) => {
                        console.error('❌ Batch fetch failed:', fail);
                        resolve([]);
                    },
                    (count: number, smsList: string) => {
                        try {
                            resolve(JSON.parse(smsList));
                        } catch (e) {
                            console.error('❌ Error parsing batch:', e);
                            resolve([]);
                        }
                    }
                );
            });

            if (batch.length === 0) break;

            allMessages = [...allMessages, ...batch];
            indexFrom += batch.length;

            if (batch.length < batchSize) break; // Last page
            if (allMessages.length > 10000) { // Safety cap to prevent memory issues
                console.warn('⚠️ Reached safety cap of 10,000 messages. Stopping scan.');
                break;
            }
        }

        console.log(`✅ Successfully combed through ${allMessages.length} total messages.`);
        return allMessages;

    } catch (error) {
        console.error('Error reading SMS:', error);
        return [];
    }
};

// Override readMpesaSMS to use readAllSMS for backward compat, 
// or update callsites. SyncMessages is the main one used.
export const readMpesaSMS = readAllSMS;
