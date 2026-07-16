import { PermissionsAndroid, Platform } from "react-native";
// @ts-ignore
import SmsAndroid from "react-native-get-sms-android";
import { extractMpesaRefFromBankSms, parseBankSms, parseImBankShortTermLoanSms } from "../utils/bankParser";
import {
    parseFulizaLoan,
    parseFulizaRepayment,
    parseMpesaSms,
} from "../utils/smsParser";
import { getDb, notifyListeners } from "./core/db";
import {
    getAutomationRules,
    getCategoryIdByName,
    getFulizaTransactionIdsInRange,
    getTransactionIdsAndReferenceIdsInRange,
    getUserSettings,
    initDatabase,
    reconcileMpesaAccountBalance,
    saveFulizaTransaction,
    saveTransaction,
    saveUserSettings,
} from "./database";
import { debtService } from "./debtService";
import { incomeService } from "./incomeService";

export interface SMSMessage {
  _id: string;
  address: string;
  body: string;
  date: number;
  type: number;
}

const isOwnBankCounterparty = (transaction: { type: string; recipientName?: string | null }): boolean => {
  if (transaction.type !== "RECEIVED") return false;
  return /\b(i\s*&\s*m|i\s+and\s+m|im\s*bank|imbank)\b/i.test(transaction.recipientName || "");
};

const cleanupMirroredBankTransfers = async (
  knownMpesaRefs: Set<string>,
  sinceDate?: Date,
): Promise<number> => {
  const database = getDb();
  const rows = sinceDate
    ? await database.getAllAsync<{
        id: string;
        raw_sms: string | null;
        reference_id: string | null;
      }>(
        `SELECT id, raw_sms, reference_id
             FROM transactions
             WHERE is_deleted = 0
             AND id LIKE 'IM_TRANSFER_%'
             AND date >= ?`,
        [sinceDate.toISOString()],
      )
    : await database.getAllAsync<{
        id: string;
        raw_sms: string | null;
        reference_id: string | null;
      }>(
        `SELECT id, raw_sms, reference_id
             FROM transactions
             WHERE is_deleted = 0
             AND id LIKE 'IM_TRANSFER_%'`,
      );

  if (rows.length === 0) return 0;

  let cleaned = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const ref =
      row.reference_id ||
      (row.raw_sms ? extractMpesaRefFromBankSms(row.raw_sms) : null);
    if (ref && knownMpesaRefs.has(ref)) {
      await database.runAsync(
        "UPDATE transactions SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?",
        [now, now, row.id],
      );
      cleaned++;
    }
  }

  return cleaned;
};

const reconcileInternalTransferByReference = async (
  referenceId: string,
): Promise<void> => {
  const database = getDb();
  const now = new Date().toISOString();
  const existing = await database.getFirstAsync<any>(
    `SELECT id, transaction_kind, is_internal_transfer
         FROM transactions
         WHERE is_deleted = 0
           AND (id = ? OR reference_id = ?)
         LIMIT 1`,
    [referenceId, referenceId],
  );

  if (!existing) return;
  if (existing.transaction_kind !== "TRANSFER" || existing.is_internal_transfer !== 1) {
    await database.runAsync(
      `UPDATE transactions
             SET transaction_kind = 'TRANSFER', is_internal_transfer = 1, updated_at = ?
             WHERE id = ?`,
      [now, existing.id],
    );
    notifyListeners("TRANSACTIONS");
  }
};

/**
 * Request SMS permissions on Android
 */
export const requestSMSPermission = async (): Promise<boolean> => {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: "SMS Permission",
        message:
          "This app needs access to your SMS messages to track M-PESA transactions",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error("Error requesting SMS permission:", err);
    return false;
  }
};

/**
 * Read M-PESA SMS messages from the phone
 */
export const syncMessages = async (
  days: number = 30,
  fullHistory: boolean = false,
) => {
  await initDatabase();

  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    );
    if (!hasPermission) {
      console.log("⚠️ SMS Permission not granted, skipping sync");
      return { success: false, error: "Permission not granted" };
    }

    // SMART SYNC: Check last sync time
    let syncDays = days;
    const lastSyncStr = await getUserSettings("last_sync_timestamp");
    const smsParseStartDateStr = await getUserSettings("sms_parse_start_date");

    if (fullHistory) {
      // All-time sync — respect user set start date if available
      if (smsParseStartDateStr) {
        const parseDate = new Date(smsParseStartDateStr);
        syncDays =
          Math.ceil(
            (Date.now() - parseDate.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1;
        console.log(
          `🕰️ Full history sync requested — capped by user setting to ${syncDays} days.`,
        );
      } else {
        syncDays = 0; // Truly all time
        console.log(
          `🕰️ Full history sync requested — fetching ALL SMS messages.`,
        );
      }
    } else if (!lastSyncStr && days === 30) {
      syncDays = 30;
      console.log(`🚀 Initial launch: Performing default sync (30 days).`);
    } else if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      const daysSinceLastSync = Math.ceil(
        (Date.now() - lastSync) / (1000 * 60 * 60 * 24),
      );

      // For periodic syncs, we usually bridge the gap plus one extra day for safety.
      syncDays = Math.max(
        1,
        Math.min(Math.max(days, daysSinceLastSync + 1), 366),
      );
      console.log(
        `🔄 Last sync was ${daysSinceLastSync} days ago. Syncing ${syncDays} days.`,
      );
    } else {
      console.log(`⚡ Performing requested ${days}-day sync.`);
    }

    // Apply global SMS parse start date limit if set
    if (smsParseStartDateStr && syncDays === 0) {
      const parseDate = new Date(smsParseStartDateStr);
      syncDays =
        Math.ceil((Date.now() - parseDate.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
    } else if (smsParseStartDateStr && syncDays > 0) {
      const parseDate = new Date(smsParseStartDateStr);
      const limitDays =
        Math.ceil((Date.now() - parseDate.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
      if (syncDays > limitDays) {
        syncDays = limitDays;
        console.log(
          `📏 Sync range capped by SMS Parse Start Date to ${syncDays} days.`,
        );
      }
    }

    const messages = await readMpesaSMS(syncDays);
    const imBankEnabled = (await getUserSettings("bank_im_enabled")) === "true";

    // BATCH CACHING: Fetch existing IDs — for full history pass no date
    const sinceDate =
      syncDays > 0
        ? new Date(Date.now() - (syncDays + 2) * 24 * 60 * 60 * 1000)
        : undefined;
    const existingTxIds =
      await getTransactionIdsAndReferenceIdsInRange(sinceDate);
    const existingFulizaIds = await getFulizaTransactionIdsInRange(sinceDate);
    const enabledRules = (await getAutomationRules()).filter(
      (r) => r.isEnabled,
    );
    const debtRepaymentCategoryId = await getCategoryIdByName("Debt Repayment");
    const mpesaRefsInBatch = new Set<string>();
    const internalMpesaRefsInBatch = new Set<string>();

    // Pre-scan MPESA messages so bank mirror messages can be skipped regardless of processing order.
    for (const msg of messages) {
      if (msg.address !== "MPESA") continue;
      const parsed = parseMpesaSms(msg.body);
      if (parsed?.id) {
        mpesaRefsInBatch.add(parsed.id);
        if (isOwnBankCounterparty(parsed)) {
          internalMpesaRefsInBatch.add(parsed.id);
        }
      }
    }
    const knownMpesaRefs = new Set<string>([
      ...existingTxIds,
      ...mpesaRefsInBatch,
    ]);
    const cleanedMirrors = await cleanupMirroredBankTransfers(
      knownMpesaRefs,
      sinceDate,
    );
    if (cleanedMirrors > 0) {
      console.log(
        `🧹 Removed ${cleanedMirrors} mirrored bank-to-MPESA transfer entries.`,
      );
    }

    let newTransactionsCount = 0;
    let processedCount = 0;

    // Optimized yielder: Yields every 40 items to let UI breathe
    const yieldIfNecessary = async () => {
      processedCount++;
      if (processedCount % 40 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    };

    // SINGLE PASS: Process all messages in one loop for maximum speed
    for (const msg of messages) {
      await yieldIfNecessary();

      const isMpesa = msg.address === "MPESA";
      const normalizedSender = msg.address.toUpperCase();
      const normalizedBody = msg.body.toUpperCase();
      const isBank =
        imBankEnabled &&
        (normalizedSender.includes("I&M") ||
          normalizedSender.includes("IM BANK") ||
          normalizedSender.includes("IMBANK") ||
          normalizedSender.includes("I AND M") ||
          normalizedSender.includes("IANDMBANK") ||
          normalizedBody.includes("I&M") ||
          normalizedBody.includes("IM BANK") ||
          normalizedBody.includes("IMBANK") ||
          normalizedBody.includes("I AND M") ||
          normalizedBody.includes("IANDMBANK"));

      if (isMpesa) {
        // Fuliza confirmations can also resemble ordinary M-PESA payment
        // messages. Detect them first so the generic parser never consumes
        // them as a normal expense/income transaction.
        const detectedFulizaLoan = parseFulizaLoan(msg.body, msg.date);
        const detectedFulizaRepayment = detectedFulizaLoan
          ? null
          : parseFulizaRepayment(msg.body, msg.date);
        const parsed = detectedFulizaLoan || detectedFulizaRepayment
          ? null
          : parseMpesaSms(msg.body);
        if (parsed) {
          if (internalMpesaRefsInBatch.has(parsed.id)) {
            parsed.isInternalTransfer = true;
            parsed.transactionKind = "TRANSFER";
          }
          if (!existingTxIds.has(parsed.id)) {
            const reconciled = parsed.isInternalTransfer
              ? false
              : await incomeService.reconcileIncomingSms(parsed);
            if (!reconciled) {
              await saveTransaction(parsed, false, enabledRules);
              if (!parsed.isInternalTransfer) {
                await incomeService.autoLinkTransaction(parsed);
              }
            }
            existingTxIds.add(parsed.id);
            newTransactionsCount++;
          }
        } else {
          const fulizaLoan = detectedFulizaLoan;
          if (fulizaLoan) {
            if (!existingFulizaIds.has(fulizaLoan.id)) {
              await saveFulizaTransaction(fulizaLoan, false);
              existingFulizaIds.add(fulizaLoan.id);
              const fulizaDebt = await debtService.getOrCreateFulizaDebt();

              if (fulizaLoan.outstandingBalance !== undefined) {
                await debtService.updateDebtBalance(
                  fulizaDebt.id,
                  fulizaLoan.outstandingBalance,
                  false,
                );
              } else {
                await debtService.increaseDebtAmount(
                  fulizaDebt.id,
                  fulizaLoan.amount,
                  false,
                );
                if (fulizaLoan.accessFee && fulizaLoan.accessFee > 0) {
                  await debtService.increaseDebtAmount(
                    fulizaDebt.id,
                    fulizaLoan.accessFee,
                    false,
                  );
                }
              }
            }
            continue;
          }

          const fulizaRepayment = detectedFulizaRepayment;
          if (fulizaRepayment) {
            if (!existingFulizaIds.has(fulizaRepayment.id)) {
              await saveFulizaTransaction(fulizaRepayment, false);
              existingFulizaIds.add(fulizaRepayment.id);
              const fulizaDebt = await debtService.getOrCreateFulizaDebt();

              if (fulizaRepayment.outstandingBalance !== undefined) {
                await debtService.updateDebtBalance(
                  fulizaDebt.id,
                  fulizaRepayment.outstandingBalance,
                  false,
                );
              } else {
                await debtService.reduceDebtAmount(
                  fulizaDebt.id,
                  fulizaRepayment.amount,
                  false,
                );
              }

              const mpesaTxId = fulizaRepayment.id;
              if (!existingTxIds.has(mpesaTxId)) {
                  await saveTransaction(
                    {
                      id: mpesaTxId,
                      uuid: mpesaTxId,
                      userId: "local_user",
                      accountId: "ACC-MPESA-DEFAULT",
                      amount: fulizaRepayment.amount,
                      type: "SENT",
                      transactionKind: "DEBT_REPAYMENT",
                      recipientId: "FULIZA_REPAYMENT",
                      recipientName: "Fuliza Repayment",
                      date: fulizaRepayment.date,
                      balance: fulizaRepayment.accountBalance ?? 0,
                      transactionCost: 0,
                      categoryId: debtRepaymentCategoryId ?? undefined,
                      rawSms: fulizaRepayment.rawSms,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      isDeleted: false,
                      linkedDebtId: fulizaDebt.id,
                    },
                    false,
                    enabledRules,
                  );
                  existingTxIds.add(mpesaTxId);
                  newTransactionsCount++;
              }

              await debtService.recordDebtPayment({
                debtId: fulizaDebt.id,
                transactionId: mpesaTxId,
                amount: fulizaRepayment.amount,
                date: new Date(fulizaRepayment.date).toISOString(),
              });
            }
            continue;
          }
        }
      } else if (isBank) {
        const bankLoan = parseImBankShortTermLoanSms(msg.body, msg.date);
        if (bankLoan) {
          if (!existingTxIds.has(bankLoan.id)) {
            await debtService.createDebt({
              userId: "local_user",
              type: "LIABILITY",
              name: "I&M Short-term Loan",
              amount: bankLoan.amount,
              disbursedAmount: bankLoan.disbursedAmount,
              accountId: "ACC-BANK-DEFAULT",
              startDate: bankLoan.date,
              dueDate: bankLoan.dueDate,
              referenceId: bankLoan.id,
            });
            existingTxIds.add(bankLoan.id);
            newTransactionsCount++;
          }
          await debtService.reconcileShortTermLoanDisbursement(
            bankLoan.id,
            bankLoan.disbursedAmount,
            bankLoan.fees,
          );
          continue;
        }

        const parsed = parseBankSms(msg.body, msg.address);
        if (parsed) {
          const mpesaRef = extractMpesaRefFromBankSms(msg.body);
          if (mpesaRef) {
            if (internalMpesaRefsInBatch.has(mpesaRef)) {
              await reconcileInternalTransferByReference(mpesaRef);
            }
            if (knownMpesaRefs.has(mpesaRef)) {
              continue;
            }
          }

          if (!existingTxIds.has(parsed.id)) {
            parsed.date = new Date(msg.date);
            const reconciled = await incomeService.reconcileIncomingSms(parsed);
            if (!reconciled) {
              await saveTransaction(parsed, false, enabledRules);
              await incomeService.autoLinkTransaction(parsed);
            }
            existingTxIds.add(parsed.id);
            newTransactionsCount++;
          }
        }
      }
    }

    // Save sync time
    await saveUserSettings("last_sync_timestamp", Date.now().toString());

    // SMS statement balances are authoritative for the M-PESA account.
    // This keeps SMS imports and manual ledger entries from drifting apart.
    await reconcileMpesaAccountBalance();

    // Final reconciliation check for Fuliza
    await debtService.reconcileFulizaBalance();

    // Notify once after everything is synced
    notifyListeners("TRANSACTIONS");

    return { success: true, count: newTransactionsCount };
  } catch (error) {
    console.error("Error syncing messages:", error);
    return { success: false, error };
  }
};

/**
 * Read ALL SMS messages from the phone
 */
export const readAllSMS = async (days: number = 30): Promise<SMSMessage[]> => {
  if (Platform.OS !== "android") return [];

  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    );
    if (!hasPermission) return [];

    let allMessages: SMSMessage[] = [];
    let indexFrom = 0;
    const batchSize = 1000;
    // When days === 0, fetch all-time (no minDate restriction)
    const minDate =
      days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;

    console.log(
      minDate
        ? `🔍 Combing through SMS for the last ${days} days...`
        : `🔍 Combing through ALL-TIME SMS messages...`,
    );

    while (true) {
      const batch: SMSMessage[] = await new Promise((resolve) => {
        const filter: any = {
          box: "inbox",
          indexFrom,
          maxCount: batchSize,
        };
        if (minDate !== undefined) {
          filter.minDate = minDate;
        }

        SmsAndroid.list(
          JSON.stringify(filter),
          (fail: any) => {
            console.error("❌ Batch fetch failed:", fail);
            resolve([]);
          },
          (_count: number, smsList: string) => {
            try {
              resolve(JSON.parse(smsList));
            } catch (e) {
              console.error("❌ Error parsing batch:", e);
              resolve([]);
            }
          },
        );
      });

      if (batch.length === 0) break;

      allMessages.push(...batch);
      indexFrom += batch.length;

      if (batch.length < batchSize) break;
      if (allMessages.length > 20000) {
        // Increased cap slightly for deep sync
        console.warn(
          "⚠️ Reached safety cap of 20,000 messages. Stopping scan.",
        );
        break;
      }
    }

    console.log(
      `✅ Successfully combed through ${allMessages.length} total messages.`,
    );
    return allMessages;
  } catch (error) {
    console.error("Error reading SMS:", error);
    return [];
  }
};

export const readMpesaSMS = readAllSMS;
