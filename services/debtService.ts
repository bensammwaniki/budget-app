import { Debt, DebtStatus } from '../types/debt';
import { calculateFulizaDailyCharge } from '../utils/fulizaCalculator';
import { generateUUID } from '../utils/uuid';
import { getDb, initDatabase, notifyListeners } from './core/db';
import { getCategoryIdByName } from './database';

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
        isReducingBalance?: boolean;
    }): Promise<Debt> {
        await initDatabase();
        const db = getDb();
        const debtId = generateUUID();
        const now = new Date().toISOString();
        const startDate = payload.startDate ? payload.startDate.toISOString() : now;

        const flatInterest = (!payload.isReducingBalance && payload.interestRate)
            ? payload.amount * (payload.interestRate / 100)
            : 0;
        const initialBalance = payload.amount + flatInterest;

        await db.withTransactionAsync(async () => {
            // 1. Create Debt Record
            await db.runAsync(`
                INSERT INTO debts (
                    id, user_id, account_id, name, type, principal_amount, current_balance, is_revolving, is_reducing_balance,
                    interest_rate, status, start_date, due_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                debtId,
                payload.userId,
                payload.accountId || null,
                payload.name,
                payload.type,
                payload.amount,
                initialBalance,
                0,
                payload.isReducingBalance ? 1 : 0,
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

        notifyListeners('DEBTS');

        return {
            id: debtId,
            userId: payload.userId,
            accountId: payload.accountId,
            type: payload.type as 'LIABILITY' | 'RECEIVABLE',
            name: payload.name,
            principalAmount: payload.amount,
            currentBalance: initialBalance,
            interestRate: payload.interestRate,
            startDate: new Date(startDate),
            status: 'ACTIVE',
            isRevolving: false,
            isReducingBalance: payload.isReducingBalance || false,
            createdAt: new Date(now),
            updatedAt: new Date(now),
            dueDate: payload.dueDate
        };
    },

    async linkTransactionToDebt(payload: {
        debtId: string;
        transactionId: string;
    }): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const debt = await db.getFirstAsync<any>('SELECT * FROM debts WHERE id = ?', [payload.debtId]);
            if (!debt) throw new Error("Debt not found");

            const tx = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [payload.transactionId]);
            if (!tx) throw new Error("Transaction not found");
            if (tx.linked_debt_id) throw new Error("Transaction is already linked to a debt");

            // Calculate dynamic accrued fees to capitalize
            let dynamicFees = 0;
            const lastUpdate = new Date(debt.updated_at).getTime();
            const nowTime = new Date(now).getTime();
            const diffDays = Math.floor((nowTime - lastUpdate) / 86400000);

            if (diffDays > 0) {
                if (debt.type === 'OVERDRAFT') {
                    dynamicFees = calculateFulizaDailyCharge(debt.current_balance) * diffDays;
                } else if (debt.is_reducing_balance && debt.interest_rate > 0) {
                    dynamicFees = debt.current_balance * (debt.interest_rate / 100 / 365) * diffDays;
                }
            }

            const adjustedBalance = debt.current_balance + dynamicFees;
            const paymentAmount = Math.abs(tx.amount);

            if (paymentAmount > adjustedBalance) {
                throw new Error(`Overpayment detected. Remaining total balance is ${adjustedBalance.toFixed(2)}`);
            }

            const paymentId = generateUUID();
            await db.runAsync(`
                INSERT INTO debt_payments (id, debt_id, transaction_id, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [paymentId, payload.debtId, payload.transactionId, paymentAmount, tx.date, now]);

            const newBalance = adjustedBalance - paymentAmount;
            const newStatus = newBalance <= 0 ? 'PAID' : 'ACTIVE';

            await db.runAsync(`
                UPDATE debts 
                SET current_balance = ?, status = ?, updated_at = ? 
                WHERE id = ?
            `, [newBalance, newStatus, now, payload.debtId]);

            const debtRepaymentCategoryId = await getCategoryIdByName('Debt Repayment');

            await db.runAsync(`
                UPDATE transactions
                SET transaction_kind = 'DEBT_REPAYMENT', linked_debt_id = ?, category_id = ?
                WHERE id = ?
            `, [payload.debtId, debtRepaymentCategoryId, payload.transactionId]);
        });

        notifyListeners('TRANSACTIONS');
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
        await initDatabase();
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
                SET transaction_kind = ?, linked_debt_id = NULL, category_id = NULL
                WHERE id = ?
            `, [kind, transactionId]);
        });

        notifyListeners('TRANSACTIONS');
    },

    async getDebts(userId: string = 'local_user', filter?: DebtStatus, type?: 'LIABILITY' | 'RECEIVABLE' | 'OVERDRAFT'): Promise<Debt[]> {
        await initDatabase();
        const db = getDb();
        let query = 'SELECT * FROM debts WHERE user_id = ?';
        const params: any[] = [userId];

        if (filter) {
            query += ' AND status = ?';
            params.push(filter);

            // Exclude zero balances from ACTIVE view
            if (filter === 'ACTIVE') {
                query += ' AND current_balance > 0';
            }
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
        // Fetch mapped debts so accrued fees and flat interests are computed natively
        const debts = await this.getDebts(userId, 'ACTIVE');
        return debts.reduce((sum, d) => sum + d.currentBalance + (d.accruedFees || 0), 0);
    },

    async deleteDebt(debtId: string) {
        await initDatabase();
        const db = getDb();

        await db.withTransactionAsync(async () => {
            // Unlink all repayments so they become normal expenses/incomes again
            await db.runAsync(`
                UPDATE transactions 
                SET transaction_kind = CASE WHEN amount < 0 THEN 'EXPENSE' ELSE 'INCOME' END,
                    linked_debt_id = NULL,
                    category_id = NULL
                WHERE linked_debt_id = ? AND transaction_kind = 'DEBT_REPAYMENT'
            `, [debtId]);

            // Delete principal transactions (which represented the initial loan transfer)
            await db.runAsync(`
                DELETE FROM transactions
                WHERE linked_debt_id = ? AND transaction_kind = 'DEBT_PRINCIPAL'
            `, [debtId]);

            // Delete payment records
            await db.runAsync("DELETE FROM debt_payments WHERE debt_id = ?", [debtId]);

            // Finally, delete the debt record
            await db.runAsync("DELETE FROM debts WHERE id = ?", [debtId]);
        });

        notifyListeners('DEBTS');
        notifyListeners('TRANSACTIONS');
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
            AND current_balance > 0
        `, [userId]);

        const receivables = await db.getFirstAsync<{ total: number; count: number }>(`
            SELECT 
                COALESCE(SUM(current_balance), 0) as total,
                COUNT(*) as count
            FROM debts 
            WHERE user_id = ? 
            AND type = 'RECEIVABLE' 
            AND status = 'ACTIVE'
            AND current_balance > 0
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
                    type, status, is_revolving, is_reducing_balance, created_at, updated_at
                ) VALUES (?, ?, 'Fuliza', 0, 0, 'OVERDRAFT', 'ACTIVE', 1, 0, ?, ?)
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
        notifyListeners('DEBTS');
    },

    async reduceDebtAmount(debtId: string, amount: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = MAX(0, current_balance - ?), updated_at = ? WHERE id = ?",
            [amount, now, debtId]
        );
        notifyListeners('DEBTS');
    },

    async updateDebtBalance(debtId: string, balance: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = ?, updated_at = ? WHERE id = ?",
            [balance, now, debtId]
        );
        notifyListeners('DEBTS');
    },

    /**
     * Periodically called during sync/launch to apply accrued interest/maintenance
     * fees for any active overdraft debts.
     */
    async updateFulizaFees() {
        try {
            const fulizaDebt = await this.getOrCreateFulizaDebt();
            if (fulizaDebt && fulizaDebt.status === 'ACTIVE' && fulizaDebt.currentBalance > 0) {
                // Reconcile will internally check latest SMS balance if available
                await this.reconcileFulizaBalance();
            }
        } catch (e) {
            console.error('Error updating Fuliza fees:', e);
        }
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

    if (row.status === 'ACTIVE' && row.current_balance > 0) {
        const lastUpdate = new Date(row.updated_at);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            if (row.type === 'OVERDRAFT') {
                accruedFees = calculateFulizaDailyCharge(row.current_balance) * diffDays;
            } else if (row.is_reducing_balance && row.interest_rate > 0) {
                accruedFees = row.current_balance * (row.interest_rate / 100 / 365) * diffDays;
            }
        }
    }

    let projectedInterest = 0;
    if (row.status === 'ACTIVE' && row.is_reducing_balance && row.interest_rate > 0 && row.due_date) {
        const dueDate = new Date(row.due_date);
        const now = new Date();
        if (dueDate > now) {
            const diffTime = dueDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            projectedInterest = row.current_balance * (row.interest_rate / 100 / 365) * diffDays;
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
        isReducingBalance: !!row.is_reducing_balance,
        interestRate: row.interest_rate,
        status: row.status as DebtStatus,
        startDate: new Date(row.start_date),
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        accruedFees,
        projectedInterest
    };
};
