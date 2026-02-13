import { Transaction } from '../types/transaction';
import { getDb } from './core/db';

export const transactionService = {
    // Basic CRUD - For complex flows use ledgerService

    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        const db = getDb();
        const results = await db.getAllAsync<any>(
            'SELECT * FROM transactions WHERE account_id = ? AND is_deleted = 0 ORDER BY date DESC',
            [accountId]
        );

        return results.map(row => mapRowToTransaction(row));
    },

    async getAllTransactions(): Promise<Transaction[]> {
        const db = getDb();
        // Limit for performance until pagination is added
        const results = await db.getAllAsync<any>(
            'SELECT * FROM transactions WHERE is_deleted = 0 ORDER BY date DESC LIMIT 100'
        );
        return results.map(row => mapRowToTransaction(row));
    }
};

const mapRowToTransaction = (row: any): Transaction => {
    return {
        id: row.uuid || row.id, // Prefer UUID
        uuid: row.uuid,
        userId: row.user_id,
        accountId: row.account_id,
        categoryId: row.categoryId || row.category_id, // Handle legacy/new mix

        amount: row.amount,
        type: row.type as 'SENT' | 'RECEIVED',
        transactionKind: row.transactionKind,

        recipientId: row.recipientId,
        recipientName: row.recipientName,

        date: new Date(row.date),

        balanceAfter: row.balance_after,
        referenceId: row.reference_id,

        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        isDeleted: !!row.is_deleted,

        rawSms: row.rawSms,
        transactionCost: row.transactionCost,
        linkedDebtId: row.linkedDebtId,
        linkedGoalId: row.linkedGoalId
    };
};
