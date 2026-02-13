import { Debt, DebtStatus } from '../types/debt';
import { generateUUID, getDb } from './core/db';
import { ledgerService } from './ledgerService';

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
        const db = getDb();
        const debtId = generateUUID();
        const now = new Date().toISOString();
        const startDate = payload.startDate ? payload.startDate.toISOString() : now;

        await db.withTransactionAsync(async () => {
            // 1. Create Debt Record
            await db.runAsync(`
                INSERT INTO debts (
                    id, user_id, account_id, name, type, principal_amount, current_balance, 
                    interest_rate, status, start_date, due_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                debtId,
                payload.userId,
                payload.accountId || null,
                payload.name,
                payload.type,
                payload.amount,
                payload.amount, // Initial balance = principal
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
                const type = payload.type === 'LIABILITY' ? 'RECEIVED' : 'SENT';
                // Negative amount for SENT? ledgerService usually handles absolute amount + type.
                await ledgerService.recordTransaction({
                    userId: payload.userId,
                    accountId: payload.accountId,
                    categoryId: null, // Debts don't link to categories in this model? Or could be "Loans" category
                    amount: payload.amount,
                    type: type,
                    kind: 'DEBT_PRINCIPAL',
                    recipientName: payload.name,
                    rawSms: `${payload.type === 'LIABILITY' ? 'Loan from' : 'Lent to'} ${payload.name}`,
                    date: payload.startDate || new Date(),
                    linkedDebtId: debtId // Link immediately
                });
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
                SET transactionKind = 'DEBT_REPAYMENT', linked_debt_id = ?
                WHERE id = ?
            `, [payload.debtId, payload.transactionId]);
        });
    },

    /**
     * Unlinks a Transaction from a Debt (Reversal).
     * Atomic: Restores Balance + Removes LINK + Reverts Transaction Kind.
     */
    async unlinkTransaction(transactionId: string): Promise<void> {
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
                SET transactionKind = ?, linked_debt_id = NULL
                WHERE id = ?
            `, [kind, transactionId]);
        });
    },

    async getDebts(userId: string = 'local_user', status?: DebtStatus): Promise<Debt[]> {
        const db = getDb();
        let query = 'SELECT * FROM debts WHERE user_id = ?';
        const params = [userId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const results = await db.getAllAsync<any>(query, params);
        return results.map(mapRowToDebt);
    },

    async getOutstandingTotal(userId: string = 'local_user'): Promise<number> {
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
     */
    async getPotentialMatches(debt: Debt): Promise<any[]> {
        const db = getDb();
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
    }
};

const mapRowToDebt = (row: any): Debt => ({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    type: row.type as 'LIABILITY' | 'RECEIVABLE',
    name: row.name,
    principalAmount: row.principal_amount,
    currentBalance: row.current_balance,
    interestRate: row.interest_rate,
    status: row.status as DebtStatus,
    startDate: new Date(row.start_date),
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
});
