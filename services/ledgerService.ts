import { Transaction } from '../types/transaction';
import { generateUUID } from '../utils/uuid';
import { accountService } from './accountService';
import { getDb } from './core/db';

interface TransferPayload {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: Date;
    description?: string;
    userId: string;
}

interface TransactionPayload {
    accountId: string;
    amount: number;
    type: 'SENT' | 'RECEIVED';
    kind: 'EXPENSE' | 'INCOME' | 'DEBT_PRINCIPAL' | 'DEBT_REPAYMENT' | 'SAVINGS_TRANSFER';
    date: Date;
    recipientName: string;
    rawSms: string;
    categoryId?: number;
    userId: string;
    referenceId?: string; // Optional manual link
    linkedDebtId?: string;
}

export const ledgerService = {

    /**
     * Records a standard single-entry transaction (Expense/Income)
     * Atomic: Inserts Transaction -> Updates Account Balance
     */
    async recordTransaction(payload: TransactionPayload): Promise<Transaction> {
        const db = getDb();
        const uuid = generateUUID();
        const now = new Date().toISOString();

        let balanceAfter = 0;

        await db.withTransactionAsync(async () => {
            // 1. Get Current Account Balance
            const account = await accountService.getAccountById(payload.accountId);
            if (!account) throw new Error("Account not found");

            // 2. Calculate New Balance
            const balanceChange = payload.type === 'SENT' ? -payload.amount : payload.amount;
            balanceAfter = account.balance + balanceChange;

            // 3. Update Account
            await db.runAsync(
                'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
                [balanceAfter, now, payload.accountId]
            );

            // 4. Insert Transaction
            await db.runAsync(`
                INSERT INTO transactions (
                    id, uuid, user_id, account_id, category_id,
                    amount, type, transaction_kind,
                    recipient_name, raw_sms,
                    date, balance, balance_after, reference_id,
                    created_at, updated_at, is_deleted, linked_debt_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `, [
                uuid, uuid, payload.userId, payload.accountId, payload.categoryId || null,
                payload.amount, payload.type, payload.kind,
                payload.recipientName, payload.rawSms,
                payload.date.toISOString(),
                balanceAfter, // Current snapshot balance
                balanceAfter, // balance_after (same for now, strictly speaking balance after THIS tx)
                payload.referenceId || null,
                now, now, payload.linkedDebtId || null
            ]);
        });

        // Fetch back full object (simplified)
        return {
            id: uuid,
            uuid: uuid,
            userId: payload.userId,
            accountId: payload.accountId,
            amount: payload.amount,
            type: payload.type,
            transactionKind: payload.kind,
            recipientName: payload.recipientName,
            date: payload.date,
            createdAt: new Date(now),
            updatedAt: new Date(now),
            isDeleted: false,
            balanceAfter: balanceAfter,
            rawSms: payload.rawSms,
            transactionCost: 0 // TODO: Handle transaction costs in ledger
        } as Transaction;
    },

    /**
     * Executes an Atomic Double-Entry Transfer between two accounts.
     * Creates TWO transactions linked by a referenceId.
     */
    async recordTransfer(payload: TransferPayload): Promise<{ debitTx: string, creditTx: string }> {
        const db = getDb();
        const referenceId = generateUUID(); // Link them
        const now = new Date().toISOString();
        const debitId = generateUUID();
        const creditId = generateUUID();

        await db.withTransactionAsync(async () => {
            // --- DEBIT SIDE (Sender) ---
            const fromAccount = await accountService.getAccountById(payload.fromAccountId);
            if (!fromAccount) throw new Error("Source Account not found");

            // Check sufficiency (unless debt)
            if (fromAccount.type !== 'DEBT' && fromAccount.balance < payload.amount) {
                // throw new Error("Insufficient funds"); // Optional: strict or loose?
                console.warn(`Warning: Transfer with insufficient funds from ${fromAccount.name}`);
            }

            const fromBalanceAfter = fromAccount.balance - payload.amount;

            // Update Sender Balance
            await db.runAsync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?', [fromBalanceAfter, now, payload.fromAccountId]);

            // Create Sender Transaction (EXPENSE/TRANSFER)
            await db.runAsync(`
                INSERT INTO transactions (
                    id, uuid, user_id, account_id, amount, type, transaction_kind,
                    recipient_name, raw_sms, date, balance_after, reference_id, created_at, updated_at, is_deleted
                ) VALUES (?, ?, ?, ?, ?, 'SENT', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, 0)
            `, [
                debitId, debitId, payload.userId, payload.fromAccountId, payload.amount,
                `Transfer to ${payload.toAccountId}`, // Should really be Account Name
                `Internal Transfer: ${payload.description || ''}`,
                payload.date.toISOString(), fromBalanceAfter, referenceId, now, now
            ]);

            // --- CREDIT SIDE (Receiver) ---
            const toAccount = await accountService.getAccountById(payload.toAccountId);
            if (!toAccount) throw new Error("Destination Account not found");

            const toBalanceAfter = toAccount.balance + payload.amount;

            // Update Receiver Balance
            await db.runAsync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?', [toBalanceAfter, now, payload.toAccountId]);

            // Create Receiver Transaction (INCOME/TRANSFER)
            await db.runAsync(`
                INSERT INTO transactions (
                    id, uuid, user_id, account_id, amount, type, transaction_kind,
                    recipient_name, raw_sms, date, balance_after, reference_id, created_at, updated_at, is_deleted
                ) VALUES (?, ?, ?, ?, ?, 'RECEIVED', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, 0)
            `, [
                creditId, creditId, payload.userId, payload.toAccountId, payload.amount,
                `Transfer from ${payload.fromAccountId}`,
                `Internal Transfer: ${payload.description || ''}`,
                payload.date.toISOString(), toBalanceAfter, referenceId, now, now
            ]);
        });

        console.log(`✅ Transfer Complete. Ref: ${referenceId}`);
        return { debitTx: debitId, creditTx: creditId };
    },

    /**
     * Soft Deletes a transaction and Reverses its balance impact.
     */
    async reverseTransaction(transactionId: string): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const tx = await db.getFirstAsync<{ account_id: string, amount: number, type: string, is_deleted: number }>(
                'SELECT account_id, amount, type, is_deleted FROM transactions WHERE id = ?',
                [transactionId]
            );

            if (!tx) throw new Error("Transaction not found");
            if (tx.is_deleted) throw new Error("Transaction already deleted");

            // Prevent deletion if linked to a debt
            const linkedTx = await db.getFirstAsync<{ linked_debt_id: string }>('SELECT linked_debt_id FROM transactions WHERE id = ?', [transactionId]);
            if (linkedTx?.linked_debt_id) {
                throw new Error("Cannot delete a transaction linked to a debt. Unlink it from the Debt screen first.");
            }

            // 1. Reverse Balance
            const reverseAmount = tx.type === 'SENT' ? tx.amount : -tx.amount; // Add back expense, subtract income

            await db.runAsync(
                'UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
                [reverseAmount, now, tx.account_id]
            );

            // 2. Mark as Deleted
            await db.runAsync(
                'UPDATE transactions SET is_deleted = 1, deleted_at = ? WHERE id = ?',
                [now, transactionId]
            );
        });
    }
};
