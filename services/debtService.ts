import { Debt, DebtStatus } from '../types/debt';
import { calculateFulizaDailyCharge } from '../utils/fulizaCalculator';
import { generateUUID, getDb } from './core/db';
import { initDatabase } from './database';

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
        accountId?: string; // If the loan money was deposited into an account
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
                payload.amount, // Initial balance = principal
                0, // Default not revolving for manual creation
                payload.interestRate || null,
                'ACTIVE',
                startDate,
                payload.dueDate?.toISOString() || null,
                now, now
            ]);

            // 2. If valid account provided, create Ledger Transaction (INCOME/DEBT_PRINCIPAL)
            if (payload.accountId) {
                // If LIABILITY (I borrowed), money comes IN -> INCOME / DEBT_PRINCIPAL
                // If RECEIVABLE (I lent), money goes OUT -> EXPENSE / DEBT_PRINCIPAL
                const txType = payload.type === 'LIABILITY' ? 'RECEIVED' : 'SENT';

                // Get Account Balance
                const account = await db.getFirstAsync<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [payload.accountId]);
                if (!account) throw new Error("Account not found");

                const balanceChange = txType === 'SENT' ? -payload.amount : payload.amount;
                const newBalance = account.balance + balanceChange;

                // Update Account
                await db.runAsync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?', [newBalance, now, payload.accountId]);

                // Insert Transaction
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
                    debtId, // Reference ID
                    now, now,
                    debtId // Linked Debt ID
                ]);
            }
        });

        return {
            id: debtId,
            userId: payload.userId,
            accountId: payload.accountId,
            type: payload.type,
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

    /**
     * Links an existing Transaction to a Debt (Repayment).
     * Atomic: Updates Debt Balance + Inserts LINK + Updates Transaction Kind.
     */
    async linkTransactionToDebt(payload: {
        debtId: string;
        transactionId: string;
    }): Promise<void> {
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            // 1. Get Debt State
            const debt = await db.getFirstAsync<any>('SELECT * FROM debts WHERE id = ?', [payload.debtId]);
            if (!debt) throw new Error("Debt not found");

            // 2. Get Transaction State
            const tx = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [payload.transactionId]);
            if (!tx) throw new Error("Transaction not found");
            if (tx.linked_debt_id) throw new Error("Transaction is already linked to a debt");

            // 3. Validation: Amount
            // Liability Repayment = Sent money (EXPENSE)
            // Receivable Repayment = Received money (INCOME)
            // We use ABS amount for balance reduction
            const paymentAmount = Math.abs(tx.amount);

            if (paymentAmount > debt.current_balance) {
                throw new Error(`Overpayment detected. Remaining balance is ${debt.current_balance}`);
            }

            // 4. Insert Link (Debt Payment)
            const paymentId = generateUUID();
            await db.runAsync(`
                INSERT INTO debt_payments (id, debt_id, transaction_id, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [paymentId, payload.debtId, payload.transactionId, paymentAmount, tx.date, now]);

            // 5. Update Debt Balance & Status
            const newBalance = debt.current_balance - paymentAmount;
            const newStatus = newBalance <= 0 ? 'PAID' : 'ACTIVE';

            await db.runAsync(`
                UPDATE debts 
                SET current_balance = ?, status = ?, updated_at = ? 
                WHERE id = ?
            `, [newBalance, newStatus, now, payload.debtId]);

            // 6. Update Transaction Kind & Link
            await db.runAsync(`
                UPDATE transactions
                SET transaction_kind = 'DEBT_REPAYMENT', linked_debt_id = ?
                WHERE id = ?
            `, [payload.debtId, payload.transactionId]);
        });
    },

    /**
     * Unlinks a Transaction from a Debt (Reversal).
     * Atomic: Restores Balance + Removes LINK + Reverts Transaction Kind.
     */
    async unlinkTransaction(transactionId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            // 1. Get Link
            const link = await db.getFirstAsync<any>('SELECT * FROM debt_payments WHERE transaction_id = ?', [transactionId]);
            if (!link) throw new Error("Transaction is not linked to any debt payment");

            const debtId = link.debt_id;
            const linkAmount = link.amount;

            // 2. Update Debt Balance (Restore)
            await db.runAsync(`
                UPDATE debts
                SET current_balance = current_balance + ?, status = 'ACTIVE', updated_at = ?
                WHERE id = ?
            `, [linkAmount, now, debtId]);

            // 3. Remove Link
            await db.runAsync('DELETE FROM debt_payments WHERE id = ?', [link.id]);

            // 4. Update Transaction (Revert Kind)
            // If amount < 0 (Sent) -> EXPENSE
            // If amount > 0 (Received) -> INCOME
            // We need to fetch tx to know sign? Or just rely on logic.
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

    /**
     * Finds unlinked transactions that could be repayments for this debt.
     * Liability -> SENT transactions.
     * Receivable -> RECEIVED transactions.
     * Returns up to 50 transactions that haven't been linked yet.
     */
    async getPotentialMatches(debtId: string): Promise<any[]> {
        await initDatabase();
        const db = getDb();
        const debt = await db.getFirstAsync<any>('SELECT * FROM debts WHERE id = ?', [debtId]);
        if (!debt) throw new Error("Debt not found");

        // If Liability (I owe), repayment is me SENDING money.
        // If Receivable (Owed to me), repayment is me RECEIVING money.
        const type = debt.type === 'LIABILITY' ? 'SENT' : 'RECEIVED';

        // Filter: 
        // 1. Correct Type
        // 2. Not already linked
        // 3. Amount <= Current Balance (Strict? Or loose? User said "Prevent overpayment". Filtering here is good UX)
        // 4. Date after debt creation? (Optional, but logical)

        return await db.getAllAsync(`
            SELECT * FROM transactions 
            WHERE type = ? 
            AND linked_debt_id IS NULL 
            AND transactionKind != 'DEBT_PRINCIPAL'
            AND is_deleted = 0
            ORDER BY date DESC
            LIMIT 50
        `, [type]);
    },

    /**
     * Gets the payment history for a debt.
     * Returns debt_payments with joined transaction details.
     */
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
                t.recipientName,
                t.rawSms,
                t.type as transaction_type
            FROM debt_payments dp
            INNER JOIN transactions t ON dp.transaction_id = t.id
            WHERE dp.debt_id = ?
            ORDER BY dp.date DESC
        `, [debtId]);
    },

    /**
     * Gets a summary of all debts for dashboard display.
     * Returns total liabilities (money you owe) and receivables (money owed to you).
     */
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

        // ACCRUED FEES: Add daily maintenance fees for all active overdrafts
        // that haven't been reconciled today.
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
            netDebt: totalLiabilities - totalReceivables, // Positive = you owe more, Negative = you're owed more
            activeDebts: (liabilities?.count || 0) + (receivables?.count || 0)
        };
    },

    /**
     * Gets or creates the special Fuliza overdraft debt.
     */
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

    /**
     * Increases a debt balance (e.g. borrowing more or fees added).
     */
    async increaseDebtAmount(debtId: string, amount: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?",
            [amount, now, debtId]
        );
    },

    /**
     * Reduces a debt balance (e.g. repayment).
     */
    async reduceDebtAmount(debtId: string, amount: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = MAX(0, current_balance - ?), updated_at = ? WHERE id = ?",
            [amount, now, debtId]
        );
    },

    /**
     * Directly sets a debt balance (authoritative sync).
     */
    async updateDebtBalance(debtId: string, balance: number) {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        await db.runAsync(
            "UPDATE debts SET current_balance = ?, updated_at = ? WHERE id = ?",
            [balance, now, debtId]
        );
    },

    /**
     * Reconciles the Fuliza debt balance with the latest transaction record.
     */
    async reconcileFulizaBalance() {
        await initDatabase();
        const db = getDb();
        const latest = await db.getFirstAsync<{ outstandingBalance: number }>(
            `SELECT outstandingBalance 
             FROM fuliza_transactions 
             WHERE outstandingBalance IS NOT NULL 
             ORDER BY date DESC LIMIT 1`
        );

        if (latest && latest.outstandingBalance !== undefined) {
            const fulizaDebt = await this.getOrCreateFulizaDebt();
            if (fulizaDebt.currentBalance !== latest.outstandingBalance) {
                console.log(`⚖️ Reconciling Fuliza Balance: ${fulizaDebt.currentBalance} -> ${latest.outstandingBalance}`);
                await this.updateDebtBalance(fulizaDebt.id, latest.outstandingBalance);
            }
        }
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
