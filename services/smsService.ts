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
export const syncMessages = async (days: number = 30) => {
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

        // AND this is the first ever sync.
        if (!lastSyncStr && days === 30) {
            syncDays = 30;
            console.log(`🚀 Initial launch: Performing default sync (30 days).`);
        } else if (lastSyncStr) {
            const lastSync = parseInt(lastSyncStr, 10);
            const daysSinceLastSync = Math.ceil((Date.now() - lastSync) / (1000 * 60 * 60 * 24));

            // For periodic syncs, we usually bridge the gap plus one extra day for safety.
            syncDays = Math.max(1, Math.min(Math.max(days, daysSinceLastSync + 1), 366));
            console.log(`🔄 Last sync was ${daysSinceLastSync} days ago. Syncing ${syncDays} days.`);
        } else {
            console.log(`⚡ Performing requested ${days}-day sync.`);
        }

        const messages = await readMpesaSMS(syncDays);
        const imBankEnabled = await getUserSettings('bank_im_enabled') === 'true';

        let newTransactionsCount = 0;
        let processedCount = 0;

        // Helper to yield to main thread every N items to prevent UI freezing
        const yieldIfNecessary = async () => {
            processedCount++;
            if (processedCount % 50 === 0) {
                // Yield to JS thread
                await new Promise(resolve => setTimeout(resolve, 0));
                notifyListeners('TRANSACTIONS');
            }
        };

        // PASS 1: Process M-PESA Messages ONLY
        for (const msg of messages) {
            await yieldIfNecessary();

            if (msg.address === 'MPESA') {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    const exists = await transactionExists(parsed.id);
                    if (!exists) {
                        await saveTransaction(parsed, false);
                        newTransactionsCount++;
                    }
                } else {
                    const fulizaLoan = parseFulizaLoan(msg.body, msg.date);
                    if (fulizaLoan) {
                        await saveFulizaTransaction(fulizaLoan);
                        continue;
                    }

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
                            }, false);
                        }
                        continue;
                    }
                }
            }
        }

        // PASS 2: Process Bank Messages (if enabled)
        if (imBankEnabled) {
            for (const msg of messages) {
                await yieldIfNecessary();
                if (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK')) {
                    const parsed = parseBankSms(msg.body, msg.address);
                    if (parsed) {
                        const mpesaRef = extractMpesaRefFromBankSms(msg.body);
                        if (mpesaRef) {
                            const exists = await transactionExists(mpesaRef);
                            if (exists) continue;
                        }

                        parsed.date = new Date(msg.date);
                        await saveTransaction(parsed, false);
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
 * Read ALL SMS messages from the phone
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

            if (batch.length < batchSize) break;
            if (allMessages.length > 20000) { // Increased cap slightly for deep sync
                console.warn('⚠️ Reached safety cap of 20,000 messages. Stopping scan.');
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

export const readMpesaSMS = readAllSMS;
