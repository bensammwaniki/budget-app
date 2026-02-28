import { generateUUID } from '../utils/uuid';
import { getDb, notifyListeners } from './core/db';
import { getCategoryIdByName, getTransactions } from './database';

export interface SavingsGoal {
    id: string;
    userId: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate?: string;
    color?: string;
    status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
    createdAt: string;
    updatedAt: string;
}

export type CreateSavingsGoalDTO = Omit<SavingsGoal, 'id' | 'userId' | 'currentAmount' | 'status' | 'createdAt' | 'updatedAt'>;

export const savingsService = {
    async getGoals(userId: string = 'local_user'): Promise<SavingsGoal[]> {
        const db = getDb();
        const goals = await db.getAllAsync<any>('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC', [userId]);

        return goals.map(this.mapDbToGoal);
    },

    async getGoalById(id: string): Promise<SavingsGoal | null> {
        const db = getDb();
        const row = await db.getFirstAsync<any>('SELECT * FROM savings_goals WHERE id = ?', [id]);
        return row ? this.mapDbToGoal(row) : null;
    },

    async createGoal(data: CreateSavingsGoalDTO, userId: string = 'local_user'): Promise<SavingsGoal> {
        const db = getDb();
        const id = generateUUID();
        const now = new Date().toISOString();

        await db.runAsync(`
            INSERT INTO savings_goals (
                id, user_id, name, target_amount, current_amount, target_date, color, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 0, ?, ?, 'ACTIVE', ?, ?)
        `, [
            id, userId, data.name, data.targetAmount, data.targetDate || null, data.color || null, now, now
        ]);

        notifyListeners('SAVINGS');

        return (await this.getGoalById(id))!;
    },

    async updateGoal(id: string, updates: Partial<CreateSavingsGoalDTO & { status: SavingsGoal['status'] }>): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        const setClauses: string[] = [];
        const values: any[] = [];

        if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
        if (updates.targetAmount !== undefined) { setClauses.push('target_amount = ?'); values.push(updates.targetAmount); }
        if (updates.targetDate !== undefined) { setClauses.push('target_date = ?'); values.push(updates.targetDate); }
        if (updates.color !== undefined) { setClauses.push('color = ?'); values.push(updates.color); }
        if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }

        if (setClauses.length === 0) return;

        setClauses.push('updated_at = ?');
        values.push(now);
        values.push(id);

        await db.runAsync(`UPDATE savings_goals SET ${setClauses.join(', ')} WHERE id = ?`, values);
        notifyListeners('SAVINGS');
    },

    async deleteGoal(id: string): Promise<void> {
        const db = getDb();
        await db.runAsync('DELETE FROM savings_goals WHERE id = ?', [id]);
        notifyListeners('SAVINGS');
    },

    async transferToSavings(goalId: string, amount: number, sourceAccountId: string): Promise<void> {
        const db = getDb();
        const txId = generateUUID();
        const now = new Date().toISOString();
        const goal = await this.getGoalById(goalId);

        if (!goal) throw new Error('Goal not found');

        await db.withTransactionAsync(async () => {
            const savingsCategoryId = await getCategoryIdByName('Savings');

            // 1. Create a transaction for the deposit
            await db.runAsync(`
                INSERT INTO transactions (
                    id, uuid, user_id, account_id, category_id, amount, type, transaction_kind, 
                    recipient_name, date, is_deleted, linked_goal_id, created_at, updated_at
                ) VALUES (?, ?, 'local_user', ?, ?, ?, 'SENT', 'SAVINGS_TRANSFER', ?, ?, 0, ?, ?, ?)
            `, [
                txId, txId, sourceAccountId, savingsCategoryId, amount,
                `Transfer to ${goal.name}`, now, goalId, now, now
            ]);

            // 2. Deduct from source account
            await db.runAsync(
                'UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?',
                [amount, now, sourceAccountId]
            );

            // 3. Update goal balance and status
            const newBalance = goal.currentAmount + amount;
            let status = goal.status;
            if (newBalance >= goal.targetAmount) {
                status = 'COMPLETED';
            }

            await db.runAsync(
                'UPDATE savings_goals SET current_amount = ?, status = ?, updated_at = ? WHERE id = ?',
                [newBalance, status, now, goalId]
            );
        });

        notifyListeners('TRANSACTIONS');
    },

    async linkTransactionToGoal(goalId: string, transactionId: string): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();
        const goal = await this.getGoalById(goalId);

        if (!goal) throw new Error('Goal not found');

        // Verify transaction isn't already linked
        const txCheck = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [transactionId]);
        if (!txCheck) throw new Error("Transaction not found");
        if (txCheck.linked_goal_id) throw new Error("Transaction is already linked to a goal");
        if (txCheck.type !== 'SENT') throw new Error("Only OUTGOING transactions can be linked to savings");

        await db.withTransactionAsync(async () => {
            const savingsCategoryId = await getCategoryIdByName('Savings');

            // 1. Update the transaction to link it
            await db.runAsync(`
                UPDATE transactions 
                SET linked_goal_id = ?, category_id = ?, updated_at = ? 
                WHERE id = ?
            `, [goalId, savingsCategoryId, now, transactionId]);

            // 2. Increment the goal balance
            const newBalance = goal.currentAmount + txCheck.amount;
            let status = goal.status;
            if (newBalance >= goal.targetAmount) {
                status = 'COMPLETED';
            }

            await db.runAsync(`
                UPDATE savings_goals 
                SET current_amount = ?, status = ?, updated_at = ? 
                WHERE id = ?
            `, [newBalance, status, now, goalId]);
        });

        notifyListeners('TRANSACTIONS');
    },

    async unlinkTransactionFromGoal(transactionId: string): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        const tx = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [transactionId]);
        if (!tx || !tx.linked_goal_id) throw new Error("Transaction not linked to any goal");

        const goalId = tx.linked_goal_id;
        const goal = await this.getGoalById(goalId);

        if (!goal) throw new Error("Linked goal does not exist");

        await db.withTransactionAsync(async () => {
            // 1. Remove link from transaction
            await db.runAsync(`
                UPDATE transactions 
                SET linked_goal_id = NULL, category_id = NULL, updated_at = ? 
                WHERE id = ?
            `, [now, transactionId]);

            // 2. Decrement the goal balance
            // Ensure we don't drop below 0 by accident, though mathematically it should be fine
            const newBalance = Math.max(0, goal.currentAmount - tx.amount);

            // If it was completed, setting properties below target sets it active again
            const status = newBalance < goal.targetAmount && goal.status === 'COMPLETED' ? 'ACTIVE' : goal.status;

            await db.runAsync(`
                UPDATE savings_goals 
                SET current_amount = ?, status = ?, updated_at = ? 
                WHERE id = ?
            `, [newBalance, status, now, goalId]);
        });

        notifyListeners('TRANSACTIONS');
    },

    async getGoalHistory(goalId: string) {
        // Fetch transactions specifically linked to this goal
        const allTransactions = await getTransactions();
        return allTransactions.filter(t => t.linkedGoalId === goalId).sort((a, b) => b.date.getTime() - a.date.getTime());
    },

    mapDbToGoal(row: any): SavingsGoal {
        return {
            id: row.id,
            userId: row.user_id,
            name: row.name,
            targetAmount: row.target_amount,
            currentAmount: row.current_amount,
            targetDate: row.target_date,
            color: row.color,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
};
