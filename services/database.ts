import * as SQLite from 'expo-sqlite';
import { AutomationRule } from '../types/automation';
import { Category, FulizaTransaction, SpendingSummary, Transaction } from '../types/transaction';
import { evaluateTransaction } from '../utils/automationEngine';
import { DatabaseChangeType, generateUUID, getDb, initDatabase, notifyListeners, notifyListenersImmediate, subscribeToDatabaseChanges } from './core/db';

export { DatabaseChangeType, generateUUID, initDatabase, notifyListeners, notifyListenersImmediate, subscribeToDatabaseChanges };

/**
 * Legacy alias for getDb to maintain backward compatibility.
 */
export const ensureDb = (): SQLite.SQLiteDatabase => {
    return getDb();
};


export const getCategories = async (): Promise<Category[]> => {
    await initDatabase();
    const database = getDb();
    return await database.getAllAsync<Category>('SELECT * FROM categories ORDER BY isCustom DESC, name ASC');
};

export const getCategoryIdByName = async (name: string): Promise<number | null> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getFirstAsync<{ id: number }>('SELECT id FROM categories WHERE name = ?', [name]);
    return result?.id || null;
};

export const addCategory = async (category: Omit<Category, 'id'>) => {
    await initDatabase();
    const database = getDb();
    const result = await database.runAsync(
        'INSERT INTO categories (name, type, icon, color, isCustom, description) VALUES (?, ?, ?, ?, ?, ?)',
        [category.name, category.type, category.icon, category.color, 1, category.description || '']
    );
    notifyListenersImmediate('CATEGORIES');
    return result.lastInsertRowId;
};

export const deleteCategory = async (id: number) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync('DELETE FROM categories WHERE id = ?', [id]);
    notifyListenersImmediate('CATEGORIES');
};

export const saveUserSettings = async (key: string, value: string) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
        [key, value]
    );
    notifyListenersImmediate('SETTINGS');
};

export const getUserSettings = async (key: string): Promise<string | null> => {
    try {
        await initDatabase();
        const database = getDb();
        const result = await database.getFirstAsync<{ value: string }>(
            'SELECT value FROM user_settings WHERE key = ?',
            [key]
        );
        return result?.value || null;
    } catch (e) {
        return null;
    }
};

export const getRecipientCategory = async (recipientId: string, type: string): Promise<number | null> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getAllAsync<{ category_id: number }>('SELECT category_id FROM recipients WHERE id = ? AND type = ?', [recipientId, type]);
    return result.length > 0 ? result[0].category_id : null;
};

export const getFulizaTransactions = async (): Promise<FulizaTransaction[]> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getAllAsync<any>('SELECT * FROM fuliza_transactions ORDER BY date ASC');
    return result.map(row => ({
        id: row.id,
        amount: row.amount,
        type: row.type,
        accessFee: row.access_fee,
        outstandingBalance: row.outstanding_balance,
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        linkedTransactionId: row.linked_transaction_id,
        date: new Date(row.date),
        rawSms: row.raw_sms,
        transactionKind: 'EXPENSE' // Default for Fuliza
    }));
};

export const saveRecipientCategory = async (recipientId: string, categoryId: number, type: string) => {
    if (!recipientId || !type) return;
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'INSERT OR REPLACE INTO recipients (id, type, category_id, last_seen) VALUES (?, ?, ?, ?)',
        [recipientId, type, categoryId ?? null, new Date().toISOString()]
    );
    await database.runAsync(
        'UPDATE transactions SET category_id = ? WHERE recipient_id = ? AND type = ? AND category_id IS NULL',
        [categoryId ?? null, recipientId, type]
    );
    notifyListenersImmediate('TRANSACTIONS');
};

export const updateTransactionCategory = async (transactionId: string, categoryId: number | null) => {
    if (!transactionId) return;
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'UPDATE transactions SET category_id = ? WHERE id = ?',
        [categoryId ?? null, transactionId]
    );
    notifyListenersImmediate('TRANSACTIONS');
};

export const updateTransactionCategoryByScope = async (
    transactionId: string,
    recipientId: string | null,
    type: string,
    transactionDate: Date,
    newCategoryId: number | null,
    scope: 'THIS' | 'PAST' | 'FUTURE' | 'ALL'
) => {
    if (!transactionId) return;
    await initDatabase();
    const database = getDb();

    await database.withTransactionAsync(async () => {
        // 1. Always update THIS transaction
        await database.runAsync(
            'UPDATE transactions SET category_id = ? WHERE id = ?',
            [newCategoryId ?? null, transactionId]
        );

        // 2. Handle PAST or ALL
        if ((scope === 'PAST' || scope === 'ALL') && recipientId) {
            await database.runAsync(
                'UPDATE transactions SET category_id = ? WHERE recipient_id = ? AND type = ? AND date <= ?',
                [newCategoryId ?? null, recipientId, type, transactionDate.toISOString()]
            );
        }

        // 3. Handle FUTURE or ALL (Automation/Rules table)
        if ((scope === 'FUTURE' || scope === 'ALL') && recipientId) {
            await database.runAsync(
                'INSERT OR REPLACE INTO recipients (id, type, category_id, last_seen) VALUES (?, ?, ?, ?)',
                [recipientId, type, newCategoryId ?? null, new Date().toISOString()]
            );

            // Also update any transactions in the DB that are future-dated relative to this one
            await database.runAsync(
                'UPDATE transactions SET category_id = ? WHERE recipient_id = ? AND type = ? AND date > ?',
                [newCategoryId ?? null, recipientId, type, transactionDate.toISOString()]
            );
        }
    });

    notifyListenersImmediate('TRANSACTIONS');
};

export const updateTransactionDate = async (transactionId: string, newDate: Date) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'UPDATE transactions SET date = ? WHERE id = ?',
        [newDate.toISOString(), transactionId]
    );
    notifyListenersImmediate('TRANSACTIONS');
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

export const getTransactionIdsInRange = async (sinceDate?: Date): Promise<Set<string>> => {
    await initDatabase();
    const database = getDb();
    let results: { id: string }[];
    if (sinceDate) {
        results = await database.getAllAsync<{ id: string }>(
            'SELECT id FROM transactions WHERE date >= ?',
            [sinceDate.toISOString()]
        );
    } else {
        results = await database.getAllAsync<{ id: string }>('SELECT id FROM transactions');
    }
    return new Set(results.map(r => r.id));
};

export const getFulizaTransactionIdsInRange = async (sinceDate?: Date): Promise<Set<string>> => {
    await initDatabase();
    const database = getDb();
    let results: { id: string }[];
    if (sinceDate) {
        results = await database.getAllAsync<{ id: string }>(
            'SELECT id FROM fuliza_transactions WHERE date >= ?',
            [sinceDate.toISOString()]
        );
    } else {
        results = await database.getAllAsync<{ id: string }>('SELECT id FROM fuliza_transactions');
    }
    return new Set(results.map(r => r.id));
};

export const saveFulizaTransaction = async (fuliza: FulizaTransaction) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        `INSERT OR REPLACE INTO fuliza_transactions 
        (id, amount, type, access_fee, outstanding_balance, due_date, linked_transaction_id, date, raw_sms) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            fuliza.id,
            fuliza.amount,
            fuliza.type,
            fuliza.accessFee ?? null,
            fuliza.outstandingBalance ?? null,
            fuliza.dueDate?.toISOString() ?? null,
            fuliza.linkedTransactionId ?? null,
            fuliza.date.toISOString(),
            fuliza.rawSms
        ]
    );
    notifyListeners('TRANSACTIONS');
};

export const fulizaTransactionExists = async (id: string): Promise<boolean> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM fuliza_transactions WHERE id = ?',
        [id]
    );
    return (result?.count || 0) > 0;
};

export const saveTransaction = async (transaction: Transaction, shouldNotify: boolean = true) => {
    await initDatabase();
    const database = getDb();

    if (!transaction.categoryId) {
        const rules = await getAutomationRules();
        const enabledRules = rules.filter(r => r.isEnabled);
        const matchedRule = evaluateTransaction(transaction, enabledRules);

        if (matchedRule) {
            transaction.categoryId = matchedRule.action.categoryId;
        }
    }

    await database.runAsync(
        `INSERT OR REPLACE INTO transactions 
        (id, uuid, user_id, account_id, category_id, amount, type, transaction_kind, recipient_id, recipient_name, date, balance, balance_after, transaction_cost, raw_sms, created_at, updated_at, is_deleted) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            transaction.id,
            transaction.uuid || transaction.id,
            transaction.userId || 'local_user',
            transaction.accountId || 'ACC-MPESA-DEFAULT',
            transaction.categoryId ?? null,
            transaction.amount,
            transaction.type,
            transaction.transactionKind || (transaction.type === 'SENT' ? 'EXPENSE' : 'INCOME'),
            transaction.recipientId ?? null,
            transaction.recipientName ?? null,
            transaction.date.toISOString(),
            transaction.balance || 0,
            transaction.balanceAfter || transaction.balance || 0,
            transaction.transactionCost || 0,
            transaction.rawSms ?? null,
            new Date().toISOString(),
            new Date().toISOString(),
            0
        ]
    );

    if (transaction.recipientId) {
        await database.runAsync(
            'INSERT OR IGNORE INTO recipients (id, type, category_id, last_seen) VALUES (?, ?, ?, ?)',
            [transaction.recipientId, transaction.type, null, new Date().toISOString()]
        );
    }

    if (shouldNotify) {
        notifyListeners('TRANSACTIONS');
    }
};

export const getTransactions = async (): Promise<Transaction[]> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getAllAsync<any>(`
        SELECT t.*, c.name as categoryName, c.icon as categoryIcon, c.color as categoryColor, c.description as categoryDescription 
        FROM transactions t 
        LEFT JOIN categories c ON t.category_id = c.id 
        ORDER BY t.date DESC
    `);

    return result.map(row => {
        let txDate = new Date();
        if (row.date) {
            txDate = new Date(row.date);
            if (isNaN(txDate.getTime())) {
                txDate = new Date();
            }
        }
        return {
            id: row.id,
            uuid: row.uuid,
            userId: row.user_id,
            accountId: row.account_id,
            categoryId: row.category_id,
            amount: Math.abs(row.amount),
            type: row.type || (row.amount < 0 ? 'SENT' : 'RECEIVED'),
            transactionKind: row.transaction_kind,
            recipientId: row.recipient_id,
            recipientName: row.recipient_name,
            date: txDate,
            balanceAfter: row.balance_after,
            transactionCost: row.transaction_cost,
            rawSms: row.raw_sms,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            isDeleted: row.is_deleted === 1,
            categoryName: row.categoryName,
            categoryIcon: row.categoryIcon,
            categoryColor: row.categoryColor,
            categoryDescription: row.categoryDescription,
            linkedDebtId: row.linked_debt_id,
            linkedGoalId: row.linked_goal_id,
            referenceId: row.reference_id
        };
    });
};

export const getSpendingSummary = async (): Promise<SpendingSummary> => {
    await initDatabase();
    const database = getDb();
    const now = new Date();

    // Get financial month start day setting
    const startDayStr = await getUserSettings('financial_month_start_day');
    const startDay = startDayStr ? parseInt(startDayStr, 10) : 1;

    let startOfMonth: Date;
    if (now.getDate() >= startDay) {
        startOfMonth = new Date(now.getFullYear(), now.getMonth(), startDay);
    } else {
        startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
    }

    const startOfMonthISO = startOfMonth.toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const account = await database.getFirstAsync<{ balance: number }>(
        "SELECT balance FROM accounts WHERE name = 'M-PESA'"
    );

    const daily = await database.getFirstAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE date >= ? AND type = 'SENT' AND is_deleted = 0",
        [startOfDay]
    );

    const monthly = await database.getFirstAsync<{ totalSpent: number, income: number, costs: number, count: number }>(`
        SELECT 
            SUM(CASE WHEN type = 'SENT' THEN amount ELSE 0 END) as totalSpent,
            SUM(CASE WHEN type = 'RECEIVED' THEN amount ELSE 0 END) as income,
            SUM(transaction_cost) as costs,
            COUNT(*) as count
        FROM transactions 
        WHERE date >= ? AND is_deleted = 0
    `, [startOfMonthISO]);

    return {
        currentBalance: account?.balance || 0,
        dailyTotal: daily?.total || 0,
        weeklyTotal: 0,
        monthlyTotal: monthly?.totalSpent || 0,
        transactionCount: monthly?.count || 0,
        totalSpent: monthly?.totalSpent || 0,
        monthlyTransactionCost: monthly?.costs || 0,
        totalIncome: monthly?.income || 0
    };
};

export const isMessageProcessed = async (smsId: string): Promise<boolean> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getFirstAsync<{ sms_id: string }>(
        'SELECT sms_id FROM processed_sms WHERE sms_id = ?',
        [smsId]
    );
    return !!result;
};

export const markMessageAsProcessed = async (smsId: string): Promise<void> => {
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'INSERT OR IGNORE INTO processed_sms (sms_id, processed_at) VALUES (?, ?)',
        [smsId, new Date().toISOString()]
    );
};

export const clearProcessedSms = async (): Promise<void> => {
    await initDatabase();
    const database = getDb();
    await database.runAsync('DELETE FROM processed_sms');
};

export const getAutomationRules = async (): Promise<AutomationRule[]> => {
    await initDatabase();
    const database = getDb();
    const result = await database.getAllAsync<any>('SELECT * FROM automation_rules ORDER BY id DESC');
    return result.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        conditions: JSON.parse(row.conditions),
        action: JSON.parse(row.action),
        isEnabled: row.is_enabled === 1
    }));
};

export const addAutomationRule = async (rule: Omit<AutomationRule, 'id'>) => {
    await initDatabase();
    const database = getDb();
    const result = await database.runAsync(
        'INSERT INTO automation_rules (name, type, conditions, action, is_enabled) VALUES (?, ?, ?, ?, ?)',
        [
            rule.name,
            rule.type,
            JSON.stringify(rule.conditions),
            JSON.stringify(rule.action),
            rule.isEnabled ? 1 : 0
        ]
    );
    notifyListenersImmediate('TRANSACTIONS');
    return result.lastInsertRowId;
};

export const deleteAutomationRule = async (id: number) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync('DELETE FROM automation_rules WHERE id = ?', [id]);
};

export const toggleAutomationRule = async (id: number, isEnabled: boolean) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync(
        'UPDATE automation_rules SET is_enabled = ? WHERE id = ?',
        [isEnabled ? 1 : 0, id]
    );
};

export const applyRuleToExistingTransactions = async (rule: AutomationRule): Promise<number> => {
    await initDatabase();
    const database = getDb();
    const allTransactions = await getTransactions();
    let updatedCount = 0;

    for (const tx of allTransactions) {
        if (evaluateTransaction(tx, [rule])) {
            if (tx.categoryId !== rule.action.categoryId) {
                await database.runAsync(
                    'UPDATE transactions SET category_id = ? WHERE id = ?',
                    [rule.action.categoryId, tx.id]
                );
                updatedCount++;
            }
        }
    }

    if (updatedCount > 0) notifyListenersImmediate('TRANSACTIONS');
    return updatedCount;
};

export const revertRuleEffects = async (rule: AutomationRule): Promise<number> => {
    await initDatabase();
    const database = getDb();
    const allTransactions = await getTransactions();
    let revertedCount = 0;

    for (const tx of allTransactions) {
        if (evaluateTransaction(tx, [rule]) && tx.categoryId === rule.action.categoryId) {
            await database.runAsync(
                'UPDATE transactions SET category_id = NULL WHERE id = ?',
                [tx.id]
            );
            revertedCount++;
        }
    }

    if (revertedCount > 0) notifyListenersImmediate('TRANSACTIONS');
    return revertedCount;
};

export const getMonthlyBudget = async (month: string) => {
    await initDatabase();
    const database = getDb();

    const budgetResult = await database.getFirstAsync<{ total_income: number }>(
        'SELECT total_income FROM monthly_budgets WHERE month = ?',
        [month]
    );

    const allocations = await database.getAllAsync<{ category_id: number, budget_amount: number }>(
        'SELECT category_id, budget_amount FROM category_budgets WHERE month = ?',
        [month]
    );

    return {
        totalIncome: budgetResult?.total_income || 0,
        allocations: allocations.map(a => ({ categoryId: a.category_id, budgetAmount: a.budget_amount })) || []
    };
};

export const saveMonthlyBudget = async (month: string, totalIncome: number, allocations: { categoryId: number, budgetAmount: number }[]) => {
    await initDatabase();
    const database = getDb();

    await database.withTransactionAsync(async () => {
        await database.runAsync(
            'INSERT OR REPLACE INTO monthly_budgets (month, total_income) VALUES (?, ?)',
            [month, totalIncome]
        );

        for (const allocation of allocations) {
            await database.runAsync(
                'INSERT OR REPLACE INTO category_budgets (month, category_id, budget_amount) VALUES (?, ?, ?)',
                [month, allocation.categoryId, allocation.budgetAmount]
            );
        }
    });

    notifyListenersImmediate('BUDGETS');
};

export const getCategorySpending = async (month: string): Promise<Record<number, number>> => {
    await initDatabase();
    const database = getDb();
    const [year, monthNum] = month.split('-');
    const startDate = `${month}-01T00:00:00.000Z`;
    const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
    const endDate = `${month}-${lastDay}T23:59:59.999Z`;

    const result = await database.getAllAsync<{ category_id: number, total: number }>(
        "SELECT category_id, SUM(amount) as total FROM transactions WHERE date >= ? AND date <= ? AND type = 'SENT' AND category_id IS NOT NULL AND is_deleted = 0 GROUP BY category_id",
        [startDate, endDate]
    );

    const spending: Record<number, number> = {};
    result.forEach(row => {
        spending[row.category_id] = row.total;
    });

    return spending;
};

export const deleteTransaction = async (id: string) => {
    await initDatabase();
    const database = getDb();
    await database.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    notifyListenersImmediate('TRANSACTIONS');
};

