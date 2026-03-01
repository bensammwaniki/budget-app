import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { extractMpesaRefFromBankSms, parseBankSms } from '../utils/bankParser';
import { parseFulizaLoan, parseFulizaRepayment, parseMpesaSms } from '../utils/smsParser';
import { notifyListeners } from './core/db';
import {
    getFulizaTransactionIdsInRange,
    getTransactionIdsInRange,
    getUserSettings,
    initDatabase,
    saveFulizaTransaction,
    saveTransaction,
    saveUserSettings
} from './database';
import { debtService } from './debtService';

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

        // BATCH CACHING: Fetch existing IDs once to prevent thousands of DB queries
        const sinceDate = new Date(Date.now() - (syncDays + 2) * 24 * 60 * 60 * 1000);
        const existingTxIds = await getTransactionIdsInRange(sinceDate);
        const existingFulizaIds = await getFulizaTransactionIdsInRange(sinceDate);

        let newTransactionsCount = 0;
        let processedCount = 0;

        // Optimized yielder: Yields every 40 items to let UI breathe
        const yieldIfNecessary = async () => {
            processedCount++;
            if (processedCount % 40 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        };

        // SINGLE PASS: Process all messages in one loop for maximum speed
        for (const msg of messages) {
            await yieldIfNecessary();

            const isMpesa = msg.address === 'MPESA';
            const isBank = imBankEnabled && (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK'));

            if (isMpesa) {
                const parsed = parseMpesaSms(msg.body);
                if (parsed) {
                    if (!existingTxIds.has(parsed.id)) {
                        await saveTransaction(parsed, false);
                        existingTxIds.add(parsed.id);
                        newTransactionsCount++;
                    }
                } else {
                    const fulizaLoan = parseFulizaLoan(msg.body, msg.date);
                    if (fulizaLoan) {
                        if (!existingFulizaIds.has(fulizaLoan.id)) {
                            await saveFulizaTransaction(fulizaLoan);
                            existingFulizaIds.add(fulizaLoan.id);
                            const fulizaDebt = await debtService.getOrCreateFulizaDebt();

                            if (fulizaLoan.outstandingBalance !== undefined) {
                                await debtService.updateDebtBalance(fulizaDebt.id, fulizaLoan.outstandingBalance);
                            } else {
                                await debtService.increaseDebtAmount(fulizaDebt.id, fulizaLoan.amount);
                                if (fulizaLoan.accessFee && fulizaLoan.accessFee > 0) {
                                    await debtService.increaseDebtAmount(fulizaDebt.id, fulizaLoan.accessFee);
                                }
                            }
                        }
                        continue;
                    }

                    const fulizaRepayment = parseFulizaRepayment(msg.body, msg.date);
                    if (fulizaRepayment) {
                        if (!existingFulizaIds.has(fulizaRepayment.id)) {
                            await saveFulizaTransaction(fulizaRepayment);
                            existingFulizaIds.add(fulizaRepayment.id);
                            const fulizaDebt = await debtService.getOrCreateFulizaDebt();

                            if (fulizaRepayment.outstandingBalance !== undefined) {
                                await debtService.updateDebtBalance(fulizaDebt.id, fulizaRepayment.outstandingBalance);
                            } else {
                                await debtService.reduceDebtAmount(fulizaDebt.id, fulizaRepayment.amount);
                            }

                            if (fulizaRepayment.accountBalance !== undefined) {
                                const mpesaTxId = fulizaRepayment.id;
                                if (!existingTxIds.has(mpesaTxId)) {
                                    await saveTransaction({
                                        id: mpesaTxId,
                                        uuid: mpesaTxId,
                                        userId: 'local_user',
                                        accountId: 'ACC-MPESA-DEFAULT',
                                        amount: fulizaRepayment.amount,
                                        type: 'SENT',
                                        transactionKind: 'DEBT_REPAYMENT',
                                        recipientId: 'FULIZA_REPAYMENT',
                                        recipientName: 'Fuliza Repayment',
                                        date: fulizaRepayment.date,
                                        balance: fulizaRepayment.accountBalance,
                                        transactionCost: 0,
                                        categoryId: 12,
                                        rawSms: fulizaRepayment.rawSms,
                                        createdAt: new Date(),
                                        updatedAt: new Date(),
                                        isDeleted: false,
                                        linkedDebtId: fulizaDebt.id
                                    }, false);
                                    existingTxIds.add(mpesaTxId);
                                    newTransactionsCount++;
                                }

                                await debtService.recordDebtPayment({
                                    debtId: fulizaDebt.id,
                                    transactionId: mpesaTxId,
                                    amount: fulizaRepayment.amount,
                                    date: new Date(fulizaRepayment.date).toISOString()
                                });
                            }
                        }
                        continue;
                    }
                }
            } else if (isBank) {
                const parsed = parseBankSms(msg.body, msg.address);
                if (parsed) {
                    const mpesaRef = extractMpesaRefFromBankSms(msg.body);
                    if (mpesaRef && existingTxIds.has(mpesaRef)) continue;

                    if (!existingTxIds.has(parsed.id)) {
                        parsed.date = new Date(msg.date);
                        await saveTransaction(parsed, false);
                        existingTxIds.add(parsed.id);
                        newTransactionsCount++;
                    }
                }
            }
        }

        // Save sync time
        await saveUserSettings('last_sync_timestamp', Date.now().toString());

        // Final reconciliation check for Fuliza
        await debtService.reconcileFulizaBalance();

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
