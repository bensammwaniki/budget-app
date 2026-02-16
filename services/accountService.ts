import { Account, AccountType } from '../types/account';
import { generateUUID, getDb } from './core/db';

export const accountService = {
    async createAccount(name: string, type: AccountType, userId: string = 'local_user', balance: number = 0, currency: string = 'KES'): Promise<Account> {
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
        const db = getDb();
        await db.runAsync('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?', [amount, new Date().toISOString(), id]);
    }
};
