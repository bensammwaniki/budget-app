import { Debt, DebtStatus } from '../types/debt';
import { calculateFulizaDailyCharge } from '../utils/fulizaCalculator';
import { generateUUID } from '../utils/uuid';
import { getDb, initDatabase } from './core/db';

export const debtService = {
    /**
     * Creates a new Debt Record.
     * Optionally creates a Ledger Transaction if linked to an account (e.g., Money entering an account).
     */
    async createDebt(payload: {
        userId: string;
        type: 'LIABILITY' | 'RECEIVABLE';
        name: string;
        amount: number;
        accountId?: string;
        interestRate?: number;
        startDate?: Date;
        dueDate?: Date;
    }): Promise<Debt> {
        await initDatabase();
        const db = getDb();
        const debtId = generateUUID();
        const now = new Date().toISOString();
        const startDate = payload.startDate ? payload.startDate.toISOString() : now;

        await db.withTransactionAsync(async () => {
            // 1. Create Debt Record
            await db.runAsync(`
                INSERT INTO debts (
                    id, user_id, account_id, name, type, principal_amount, current_balance, is_revolving,
                    interest_rate, status, start_date, due_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                debtId,
                payload.userId,
                payload.accountId || null,
                payload.name,
                payload.type,
                payload.amount,
                payload.amount,
                0,
                payload.interestRate || null,
                'ACTIVE',
                startDate,
                payload.dueDate?.toISOString() || null,
                now, now
            ]);

            // 2. If valid account provided, create Ledger Transaction (INCOME/DEBT_PRINCIPAL)
            if (payload.accountId) {
                const txType = payload.type === 'LIABILITY' ? 'RECEIVED' : 'SENT';

                const account = await db.getFirstAsync<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [payload.accountId]);
                if (!account) throw new Error("Account not found");

                const balanceChange = txType === 'SENT' ? -payload.amount : payload.amount;
                const newBalance = account.balance + balanceChange;

                await db.runAsync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?', [newBalance, now, payload.accountId]);

                const txId = generateUUID();
                await db.runAsync(`
                    INSERT INTO transactions (
                        id, uuid, user_id, account_id, category_id,
                        amount, type, transaction_kind,
                        recipient_name, raw_sms,
                        date, balance, balance_after, reference_id,
                        created_at, updated_at, is_deleted, linked_debt_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                `, [
                    txId, txId, payload.userId, payload.accountId, null,
                    payload.amount, txType, 'DEBT_PRINCIPAL',
                    payload.name,
                    `${payload.type === 'LIABILITY' ? 'Loan from' : 'Lent to'} ${payload.name}`,
                    startDate,
                    newBalance, newBalance,
                    debtId,
                    now, now,
                    debtId
                ]);
            }
        });

        return {
            id: debtId,
            userId: payload.userId,
            accountId: payload.accountId,
            type: payload.type as 'LIABILITY' | 'RECEIVABLE',
            name: payload.name,
            principalAmount: payload.amount,
            currentBalance: payload.amount,
            interestRate: payload.interestRate,
            startDate: new Date(startDate),
            status: 'ACTIVE',
            isRevolving: false,
            createdAt: new Date(now),
            updatedAt: new Date(now),
            dueDate: payload.dueDate
        };
    },

    async linkTransactionToDebt(payload: {
        debtId: string;
        transactionId: string;
    }): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const debt = await db.getFirstAsync<any>('SELECT * FROM debts WHERE id = ?', [payload.debtId]);
            if (!debt) throw new Error("Debt not found");

            const tx = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [payload.transactionId]);
            if (!tx) throw new Error("Transaction not found");
            if (tx.linked_debt_id) throw new Error("Transaction is already linked to a debt");

            const paymentAmount = Math.abs(tx.amount);
            if (paymentAmount > debt.current_balance) {
                throw new Error(`Overpayment detected. Remaining balance is ${debt.current_balance}`);
            }

            const paymentId = generateUUID();
            await db.runAsync(`
                INSERT INTO debt_payments (id, debt_id, transaction_id, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [paymentId, payload.debtId, payload.transactionId, paymentAmount, tx.date, now]);

            const newBalance = debt.current_balance - paymentAmount;
            const newStatus = newBalance <= 0 ? 'PAID' : 'ACTIVE';

            await db.runAsync(`
                UPDATE debts 
                SET current_balance = ?, status = ?, updated_at = ? 
                WHERE id = ?
            `, [newBalance, newStatus, now, payload.debtId]);

            await db.runAsync(`
                UPDATE transactions
                SET transaction_kind = 'DEBT_REPAYMENT', linked_debt_id = ?
                WHERE id = ?
            `, [payload.debtId, payload.transactionId]);
        });
    },

    /**
     * Records a payment linkage without adjusting the debt's current_balance.
     * Useful when the balance has already been reconciled from a source of truth (like an SMS).
     */
    async recordDebtPayment(payload: {
        debtId: string;
        transactionId: string;
        amount: number;
        date: string;
    }): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const paymentId = generateUUID();
            await db.runAsync(`
                INSERT INTO debt_payments (id, debt_id, transaction_id, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [paymentId, payload.debtId, payload.transactionId, Math.abs(payload.amount), payload.date, now]);

            await db.runAsync(`
                UPDATE transactions
                SET transaction_kind = 'DEBT_REPAYMENT', linked_debt_id = ?
                WHERE id = ?
            `, [payload.debtId, payload.transactionId]);
        });
    },

    async unlinkTransaction(transactionId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const link = await db.getFirstAsync<any>('SELECT * FROM debt_payments WHERE transaction_id = ?', [transactionId]);
            if (!link) throw new Error("Transaction is not linked to any debt payment");

            const debtId = link.debt_id;
            const linkAmount = link.amount;

            await db.runAsync(`
                UPDATE debts
                SET current_balance = current_balance + ?, status = 'ACTIVE', updated_at = ?
                WHERE id = ?
            `, [linkAmount, now, debtId]);

            await db.runAsync('DELETE FROM debt_payments WHERE id = ?', [link.id]);

            const tx = await db.getFirstAsync<any>('SELECT amount FROM transactions WHERE id = ?', [transactionId]);
            const kind = (tx?.amount || 0) < 0 ? 'EXPENSE' : 'INCOME';

            await db.runAsync(`
                UPDATE transactions
                SET transaction_kind = ?, linked_debt_id = NULL
                WHERE id = ?
            `, [kind, transactionId]);
        });
    },

    async getDebts(userId: string = 'local_user', filter?: DebtStatus, type?: 'LIABILITY' | 'RECEIVABLE' | 'OVERDRAFT'): Promise<Debt[]> {
        await initDatabase();
        const db = getDb();
        let query = 'SELECT * FROM debts WHERE user_id = ?';
        const params: any[] = [userId];

        if (filter) {
            query += ' AND status = ?';
            params.push(filter);
        }

        if (type) {
            if (type === 'LIABILITY') {
                query += " AND type IN ('LIABILITY', 'OVERDRAFT')";
            } else {
                query += ' AND type = ?';
                params.push(type);
            }
        }

        query += ' ORDER BY created_at DESC';

        const results = await db.getAllAsync<any>(query, params);
        return results.map(mapRowToDebt);
    },

    async getOutstandingTotal(userId: string = 'local_user'): Promise<number> {
        await initDatabase();
        const db = getDb();
        const result = await db.getFirstAsync<{ total: number }>(
            "SELECT SUM(current_balance) as total FROM debts WHERE user_id = ? AND status = 'ACTIVE'",
            [userId]
        );
        return result?.total || 0;
    },

    async getPotentialMatches(debtId: string): Promise<any[]> {
        await initDatabase();
        const db = getDb();
        const debt = await db.getFirstAsync<any>('SELECT * FROM debts WHERE id = ?', [debtId]);
        if (!debt) throw new Error("Debt not found");

        const type = debt.type === 'LIABILITY' ? 'SENT' : 'RECEIVED';

        return await db.getAllAsync(`
            SELECT * FROM transactions 
            WHERE type = ? 
            AND linked_debt_id IS NULL 
            AND transaction_kind != 'DEBT_PRINCIPAL'
            AND is_deleted = 0
            ORDER BY date DESC
            LIMIT 50
        `, [type]);
    },

    async getDebtHistory(debtId: string): Promise<any[]> {
        await initDatabase();
        const db = getDb();
        return await db.getAllAsync(`
            SELECT 
                dp.id as payment_id,
                dp.amount as payment_amount,
                dp.date as payment_date,
                dp.created_at,
                t.id as transaction_id,
                t.recipient_name,
                t.raw_sms,
                t.type as transaction_type
            FROM debt_payments dp
            INNER JOIN transactions t ON dp.transaction_id = t.id
            WHERE dp.debt_id = ?
            ORDER BY dp.date DESC
        `, [debtId]);
    },

    async getDebtSummary(userId: string): Promise<{
        totalLiabilities: number;
        totalReceivables: number;
        netDebt: number;
        activeDebts: number;
    }> {
        await initDatabase();
        const db = getDb();

        const liabilities = await db.getFirstAsync<{ total: number; count: number }>(`
            SELECT 
                COALESCE(SUM(current_balance), 0) as total,
                COUNT(*) as count
            FROM debts 
            WHERE user_id = ? 
            AND type IN ('LIABILITY', 'OVERDRAFT')
            AND status = 'ACTIVE'
        `, [userId]);

        const receivables = await db.getFirstAsync<{ total: number; count: number }>(`
            SELECT 
                COALESCE(SUM(current_balance), 0) as total,
                COUNT(*) as count
            FROM debts 
            WHERE user_id = ? 
            AND type = 'RECEIVABLE' 
            AND status = 'ACTIVE'
        `, [userId]);

        let totalLiabilities = liabilities?.total || 0;
        const totalReceivables = receivables?.total || 0;

        const overdrafts = await db.getAllAsync<any>(`
            SELECT current_balance, updated_at 
            FROM debts 
            WHERE user_id = ? AND type = 'OVERDRAFT' AND status = 'ACTIVE' AND current_balance > 0
        `, [userId]);

        for (const od of overdrafts) {
            const lastUpdate = new Date(od.updated_at);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                const dailyRate = calculateFulizaDailyCharge(od.current_balance);
                totalLiabilities += (dailyRate * diffDays);
            }
        }

        return {
            totalLiabilities,
            totalReceivables,
            netDebt: totalLiabilities - totalReceivables,
            activeDebts: (liabilities?.count || 0) + (receivables?.count || 0)
        };
    },

    async getOrCreateFulizaDebt(): Promise<Debt> {
        await initDatabase();
        const db = getDb();
        const userId = 'local_user';

        let debt = await db.getFirstAsync<any>(
            "SELECT * FROM debts WHERE name = 'Fuliza' AND user_id = ?",
            [userId]
        );

        if (!debt) {
            const id = generateUUID();
            const now = new Date().toISOString();
            await db.runAsync(`
                INSERT INTO debts (
                    id, user_id, name, principal_amount, current_balance, 
                    type, status, is_revolving, created_at, updated_at
                ) VALUES (?, ?, 'Fuliza', 0, 0, 'OVERDRAFT', 'ACTIVE', 1, ?, ?)
            `, [id, userId, now, now]);

            debt = await db.getFirstAsync<any>(
                "SELECT * FROM debts WHERE id = ?",
                [id]
            );
        }

        return mapRowToDebt(debt);
    },

    async increaseDebtAmount(debtId: string, amount: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?",
            [amount, now, debtId]
        );
    },

    async reduceDebtAmount(debtId: string, amount: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = MAX(0, current_balance - ?), updated_at = ? WHERE id = ?",
            [amount, now, debtId]
        );
    },

    async updateDebtBalance(debtId: string, balance: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = ?, updated_at = ? WHERE id = ?",
            [balance, now, debtId]
        );
    },

    async reconcileFulizaBalance() {
        await initDatabase();
        const db = getDb();
        const latest = await db.getFirstAsync<{ outstanding_balance: number }>(
            `SELECT outstanding_balance 
             FROM fuliza_transactions 
             WHERE outstanding_balance IS NOT NULL 
             ORDER BY date DESC LIMIT 1`
        );

        if (latest && latest.outstanding_balance !== undefined) {
            const fulizaDebt = await this.getOrCreateFulizaDebt();
            if (fulizaDebt.currentBalance !== latest.outstanding_balance) {
                console.log(`⚖️ Reconciling Fuliza Balance: ${fulizaDebt.currentBalance} -> ${latest.outstanding_balance}`);
                await this.updateDebtBalance(fulizaDebt.id, latest.outstanding_balance);
            }
        }
    },

    async settleDebt(debtId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = 0, status = 'PAID', updated_at = ? WHERE id = ?",
            [now, debtId]
        );
    }
};

const mapRowToDebt = (row: any): Debt => {
    let accruedFees = 0;
    if (row.type === 'OVERDRAFT' && row.status === 'ACTIVE' && row.current_balance > 0) {
        const lastUpdate = new Date(row.updated_at);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            accruedFees = calculateFulizaDailyCharge(row.current_balance) * diffDays;
        }
    }

    return {
        id: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        type: row.type as 'LIABILITY' | 'RECEIVABLE' | 'OVERDRAFT',
        name: row.name,
        principalAmount: row.principal_amount,
        currentBalance: row.current_balance,
        isRevolving: !!row.is_revolving,
        interestRate: row.interest_rate,
        status: row.status as DebtStatus,
        startDate: new Date(row.start_date),
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        accruedFees
    };
};
