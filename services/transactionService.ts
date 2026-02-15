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
        categoryId: row.category_id || row.categoryId, // Standardized column is category_id

        amount: row.amount,
        type: row.type as 'SENT' | 'RECEIVED',
        transactionKind: row.transaction_kind || row.transactionKind,

        recipientId: row.recipient_id || row.recipientId,
        recipientName: row.recipient_name || row.recipientName,

        date: new Date(row.date),

        balanceAfter: row.balance_after || row.balanceAfter,
        referenceId: row.reference_id || row.referenceId,

        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        isDeleted: !!row.is_deleted,

        rawSms: row.raw_sms || row.rawSms,
        transactionCost: row.transaction_cost || row.transactionCost,
        linkedDebtId: row.linked_debt_id || row.linkedDebtId,
        linkedGoalId: row.linked_goal_id || row.linkedGoalId
    };
};
