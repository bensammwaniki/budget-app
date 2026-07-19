import { Account, AccountType } from '../types/account';
import { generateUUID, getDb, initDatabase } from './core/db';

export const accountService = {
    async reconcileBalancesFromTransactions(
        userId: string = 'local_user',
        sinceDate?: Date | null
    ): Promise<void> {
        await initDatabase();
        const db = getDb();
        const accounts = await db.getAllAsync<{ id: string }>(
            'SELECT id FROM accounts WHERE user_id = ? AND is_active = 1',
            [userId]
        );

        const now = new Date().toISOString();
        for (const account of accounts) {
            const params: any[] = [account.id];
            let dateClause = "";
            if (sinceDate) {
                dateClause = " AND date >= ?";
                params.push(sinceDate.toISOString());
            }
            const totals = await db.getFirstAsync<{ received: number; sent: number }>(
                `SELECT
                    COALESCE(SUM(CASE WHEN type = 'RECEIVED' THEN amount ELSE 0 END), 0) AS received,
                    COALESCE(SUM(CASE WHEN type = 'SENT' THEN amount ELSE 0 END), 0) AS sent
                 FROM transactions
                 WHERE account_id = ?
                   AND is_deleted = 0${dateClause}`,
                params
            );

            const balance = Number(totals?.received || 0) - Number(totals?.sent || 0);
            await db.runAsync(
                'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
                [balance, now, account.id]
            );
        }
    },

    async createAccount(name: string, type: AccountType, userId: string = 'local_user', balance: number = 0, currency: string = 'KES'): Promise<Account> {
        await initDatabase();
        const db = getDb();
        const id = generateUUID();
        const now = new Date().toISOString();

        // Strict Schema Insert
        await db.runAsync(
            'INSERT INTO accounts (id, user_id, name, type, balance, currency, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, userId, name, type, balance, currency, 1, now, now]
        );

        return {
            id,
            userId,
            name,
            type,
            balance,
            currency,
            isActive: true,
            createdAt: new Date(now),
            updatedAt: new Date(now)
        };
    },

    async getAccounts(): Promise<Account[]> {
        await initDatabase();
        const db = getDb();
        const results = await db.getAllAsync<any>('SELECT * FROM accounts WHERE is_active = 1 ORDER BY name ASC');

        return results.map(row => ({
            ...row,
            userId: row.user_id,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            isActive: !!row.is_active
        }));
    },

    async getAccountById(id: string): Promise<Account | null> {
        await initDatabase();
        const db = getDb();
        const result = await db.getFirstAsync<any>('SELECT * FROM accounts WHERE id = ?', [id]);

        if (!result) return null;

        return {
            ...result,
            userId: result.user_id,
            createdAt: new Date(result.created_at),
            updatedAt: new Date(result.updated_at),
            isActive: !!result.is_active
        };
    },

    // NOTE: Direct balance updates should ideally go through ledgerService for audit capability. 
    // This function is kept for simple corrections or initialization.
    async updateBalance(id: string, amount: number) {
        await initDatabase();
        const db = getDb();
        await db.runAsync('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?', [amount, new Date().toISOString(), id]);
    }
};
