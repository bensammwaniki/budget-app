import { getDb, initDatabase, notifyListeners } from './core/db';

export interface FinancialDataResetResult {
    transactionsRemoved: number;
    incomeLogsRemoved: number;
    debtPaymentsRemoved: number;
}

/**
 * Clears financial history through the chosen local date (including that date).
 * Categories, learned recipients, automation rules, accounts, and income-source
 * configuration stay in place for future recognition and automation.
 */
export const resetFinancialDataThroughDate = async (throughDate: Date): Promise<FinancialDataResetResult> => {
    await initDatabase();
    const db = getDb();
    const end = new Date(throughDate.getFullYear(), throughDate.getMonth(), throughDate.getDate(), 23, 59, 59, 999).toISOString();
    const now = new Date().toISOString();

    const [transactionCount, incomeLogCount, paymentCount] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM transactions WHERE is_deleted = 0 AND date <= ?', [end]),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM income_logs WHERE received_at <= ?', [end]),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM debt_payments WHERE date <= ?', [end]),
    ]);

    await db.withTransactionAsync(async () => {
        // Remove records that reference the history before deleting ledger rows.
        await db.runAsync(`DELETE FROM income_logs
            WHERE received_at <= ? OR transaction_id IN (SELECT id FROM transactions WHERE date <= ?)`, [end, end]);
        await db.runAsync(`DELETE FROM debt_payments
            WHERE date <= ? OR transaction_id IN (SELECT id FROM transactions WHERE date <= ?)`, [end, end]);
        await db.runAsync('DELETE FROM fuliza_transactions WHERE date <= ? OR linked_transaction_id IN (SELECT id FROM transactions WHERE date <= ?)', [end, end]);

        // Keep the account setup, but remove the historical ledger effect from
        // its balance so the retained post-cutoff activity remains coherent.
        const accountEffects = await db.getAllAsync<{ account_id: string; effect: number }>(`
            SELECT account_id, SUM(CASE WHEN type = 'SENT' THEN -amount ELSE amount END) AS effect
            FROM transactions
            WHERE is_deleted = 0 AND date <= ? AND account_id IS NOT NULL
            GROUP BY account_id
        `, [end]);
        for (const effect of accountEffects) {
            await db.runAsync('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?', [effect.effect || 0, now, effect.account_id]);
        }

        await db.runAsync('DELETE FROM transactions WHERE date <= ?', [end]);

        // These are derived reports, not categorization knowledge.
        await db.runAsync('DELETE FROM monthly_summaries WHERE month <= ?', [end.slice(0, 7)]);
        await db.runAsync('DELETE FROM category_trends WHERE month <= ?', [end.slice(0, 7)]);

        // Do not let an existing recurring template re-create the cleared past.
        await db.runAsync(`UPDATE manual_recurring_transactions
            SET last_generated_month = ?, last_generated_date = ?, updated_at = ?
            WHERE last_generated_date IS NULL OR last_generated_date <= ?`, [end.slice(0, 7), end, now, end]);

        // Rebuild values derived from retained linked activity. Do not delete
        // the goals/debts themselves: they may still be useful after the reset.
        await db.runAsync(`UPDATE savings_goals
            SET current_amount = COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.linked_goal_id = savings_goals.id AND t.is_deleted = 0
            ), 0),
            status = CASE WHEN COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.linked_goal_id = savings_goals.id AND t.is_deleted = 0), 0) >= target_amount THEN 'COMPLETED' WHEN status = 'COMPLETED' THEN 'ACTIVE' ELSE status END,
            updated_at = ?`, [now]);

        const debts = await db.getAllAsync<{ id: string; principal_amount: number; interest_rate: number | null; is_reducing_balance: number }>('SELECT id, principal_amount, interest_rate, is_reducing_balance FROM debts');
        for (const debt of debts) {
            const total = Number(debt.principal_amount || 0) + (debt.is_reducing_balance ? 0 : Number(debt.principal_amount || 0) * (Number(debt.interest_rate || 0) / 100));
            const paid = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE debt_id = ?', [debt.id]);
            const balance = Math.max(0, total - Number(paid?.total || 0));
            await db.runAsync("UPDATE debts SET current_balance = ?, status = CASE WHEN ? <= 0 THEN 'PAID' WHEN status = 'DEFAULTED' THEN 'DEFAULTED' ELSE 'ACTIVE' END, updated_at = ? WHERE id = ?", [balance, balance, now, debt.id]);
        }

        await db.runAsync(`UPDATE income_sources SET last_received = (
            SELECT MAX(received_at) FROM income_logs WHERE source_id = income_sources.id
        ), updated_at = ?`, [now]);

        // This table has no SMS timestamp and is not used to prevent duplicate
        // ledger imports, so clear it rather than retain stale parsed-message data.
        await db.runAsync('DELETE FROM processed_sms');
    });

    ['TRANSACTIONS', 'INCOME_LOGS', 'INCOME_SOURCES', 'DEBTS', 'SAVINGS', 'BUDGETS']
        .forEach((type) => notifyListeners(type as any));

    return {
        transactionsRemoved: transactionCount?.count || 0,
        incomeLogsRemoved: incomeLogCount?.count || 0,
        debtPaymentsRemoved: paymentCount?.count || 0,
    };
};
