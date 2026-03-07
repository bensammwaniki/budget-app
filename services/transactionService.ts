import { Transaction } from '../types/transaction';
import { getDb, initDatabase } from './core/db';

export const transactionService = {
    // Basic CRUD - For complex flows use ledgerService

    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        await initDatabase();
        const db = getDb();
        const results = await db.getAllAsync<any>(
            'SELECT * FROM transactions WHERE account_id = ? AND is_deleted = 0 ORDER BY date DESC',
            [accountId]
        );

        return results.map(row => mapRowToTransaction(row));
    },

    async getAllTransactions(): Promise<Transaction[]> {
        await initDatabase();
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
        id: row.uuid || row.id,
        uuid: row.uuid,
        userId: row.user_id,
        accountId: row.account_id,
        accountName: row.account_name,
        accountType: row.account_type,
        categoryId: row.category_id,
        amount: row.amount,
        type: row.type as 'SENT' | 'RECEIVED',
        transactionKind: row.transaction_kind,
        recipientId: row.recipient_id,
        recipientName: row.recipient_name,
        date: new Date(row.date),
        balanceAfter: row.balance_after,
        referenceId: row.reference_id,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        isDeleted: !!row.is_deleted,
        rawSms: row.raw_sms,
        transactionCost: row.transaction_cost,
        linkedDebtId: row.linked_debt_id,
        linkedGoalId: row.linked_goal_id
    };
};

export const transactionExists = async (id: string): Promise<boolean> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM transactions WHERE id = ?',
        [id]
    );
    return (result?.count || 0) > 0;
};

// The saveFulizaTransaction function provided in the instruction was syntactically incorrect
// as 'row' was not defined within its scope, and its body was identical to mapRowToTransaction.
// To maintain syntactical correctness as per instructions, this function is not added in its malformed state.
// If this was intended to be a new function, it would require a proper implementation.
// export const saveFulizaTransaction = async (fuliza: FulizaTransaction) => {
//     return {
//         id: row.uuid || row.id,
//         uuid: row.uuid,
//         userId: row.user_id,
//         accountId: row.account_id,
//         categoryId: row.category_id,
//         amount: row.amount,
//         type: row.type as 'SENT' | 'RECEIVED',
//         transactionKind: row.transaction_kind,
//         recipientId: row.recipient_id,
//         recipientName: row.recipient_name,
//         date: new Date(row.date),
//         balanceAfter: row.balance_after,
//         referenceId: row.reference_id,
//         createdAt: new Date(row.created_at),
//         updatedAt: new Date(row.updated_at),
//         isDeleted: !!row.is_deleted,
//         rawSms: row.raw_sms,
//         transactionCost: row.transaction_cost,
//         linkedDebtId: row.linked_debt_id,
//         linkedGoalId: row.linked_goal_id
//     };
// };
