import * as SQLite from 'expo-sqlite';
import { AutomationRule } from '../types/automation';
import { Category, FulizaTransaction, SpendingSummary, Transaction } from '../types/transaction';
import { evaluateTransaction } from '../utils/automationEngine';
import { calculateMonthlyFulizaCosts } from '../utils/fulizaCalculator';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

export const initDatabase = async () => {
    // If already initializing, wait for it
    if (initPromise) {
        return initPromise;
    }

    // If already initialized, return
    if (db) {
        return Promise.resolve();
    }

    // Create the initialization promise
    initPromise = (async () => {
        try {
            console.log('🔧 Initializing database...');
            db = await SQLite.openDatabaseAsync('budget.db');

            // Check if we need to migrate by trying to query a table
            let needsMigration = false;
            try {
                await db.getFirstAsync('SELECT * FROM recipients LIMIT 1');
            } catch (error: any) {
                if (error.message?.includes('no such table')) {
                    needsMigration = true;
                    console.log('🔄 Database migration needed - tables will be recreated');
                }
            }

            // If migration needed, drop all tables
            if (needsMigration) {
                await db.execAsync(`
                    DROP TABLE IF EXISTS transactions;
                    DROP TABLE IF EXISTS recipients;
                    DROP TABLE IF EXISTS categories;
                    DROP TABLE IF EXISTS fuliza_transactions;
                    DROP TABLE IF EXISTS user_settings;
                    DROP TABLE IF EXISTS processed_sms;
                    DROP TABLE IF EXISTS automation_rules;
                `);
            }

            // Create tables
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    color TEXT NOT NULL,
                    isCustom INTEGER DEFAULT 0,
                    description TEXT
                );

                CREATE TABLE IF NOT EXISTS recipients (
                    id TEXT,
                    type TEXT,
                    categoryId INTEGER,
                    lastSeen TEXT,
                    PRIMARY KEY (id, type),
                    FOREIGN KEY (categoryId) REFERENCES categories (id)
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    amount REAL,
                    type TEXT,
                    recipientId TEXT,
                    recipientName TEXT,
                    date TEXT,
                    balance REAL,
                    transactionCost REAL,
                    categoryId INTEGER,
                    rawSms TEXT,
                    FOREIGN KEY (categoryId) REFERENCES categories (id),
                    FOREIGN KEY (recipientId, type) REFERENCES recipients (id, type)
                );

                CREATE TABLE IF NOT EXISTS fuliza_transactions (
                    id TEXT PRIMARY KEY,
                    amount REAL,
                    type TEXT,
                    accessFee REAL,
                    outstandingBalance REAL,
                    dueDate TEXT,
                    linkedTransactionId TEXT,
                    date TEXT,
                    rawSms TEXT,
                    FOREIGN KEY (linkedTransactionId) REFERENCES transactions (id)
                );

                CREATE TABLE IF NOT EXISTS user_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                CREATE TABLE IF NOT EXISTS processed_sms (
                    sms_id TEXT PRIMARY KEY,
                    processed_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS automation_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    conditions TEXT NOT NULL,
                    action TEXT NOT NULL,
                    isEnabled INTEGER DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS monthly_budgets (
                    month TEXT PRIMARY KEY,
                    totalIncome REAL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS category_budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    month TEXT NOT NULL,
                    categoryId INTEGER NOT NULL,
                    budgetAmount REAL DEFAULT 0,
                    FOREIGN KEY (categoryId) REFERENCES categories (id),
                    UNIQUE(month, categoryId)
                );
            `);

            // Seed default categories if empty
            const result = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM categories');
            if (result && result.count === 0) {
                await seedCategories();
            }

            console.log('✅ Database initialized successfully');
        } catch (error) {
            console.error("❌ Database initialization error:", error);
            db = null;
            initPromise = null;
            throw error; // Propagate error so callers know initialization failed
        }
    })();

    return initPromise;
};

const seedCategories = async () => {
    if (!db) return;

    const categories: Omit<Category, 'id'>[] = [
        { name: 'Food & Dining', type: 'EXPENSE', icon: 'cutlery', color: '#ef4444', description: 'Groceries, restaurants, and snacks' },
        { name: 'Transport', type: 'EXPENSE', icon: 'bus', color: '#f59e0b', description: 'Commute, fuel, and travel' },
        { name: 'Shopping', type: 'EXPENSE', icon: 'shopping-bag', color: '#ec4899', description: 'Clothes, gadgets, and personal items' },
        { name: 'Entertainment', type: 'EXPENSE', icon: 'film', color: '#8b5cf6', description: 'Movies, games, and events' },
        { name: 'Bills & Utilities', type: 'EXPENSE', icon: 'bolt', color: '#3b82f6', description: 'Electricity, water, and internet' },
        { name: 'Health', type: 'EXPENSE', icon: 'heartbeat', color: '#10b981', description: 'Medical and fitness' },
        { name: 'Education', type: 'EXPENSE', icon: 'graduation-cap', color: '#6366f1', description: 'Tuition, books, and courses' },
        { name: 'Personal Care', type: 'EXPENSE', icon: 'smile-o', color: '#f472b6', description: 'Grooming and wellness' },
        { name: 'Salary', type: 'INCOME', icon: 'money', color: '#22c55e', description: 'Monthly salary' },
        { name: 'Business', type: 'INCOME', icon: 'briefcase', color: '#0ea5e9', description: 'Business revenue' },
        { name: 'Gifts', type: 'INCOME', icon: 'gift', color: '#d946ef', description: 'Gifts received' },
        { name: 'Fuliza Charges', type: 'EXPENSE', icon: 'warning', color: '#f97316', description: 'Fuliza access fees and interest' }
    ];

    // Use a single transaction for all inserts to avoid locks
    await db.withTransactionAsync(async () => {
        for (const cat of categories) {
            await db!.runAsync(
                'INSERT INTO categories (name, type, icon, color, isCustom, description) VALUES (?, ?, ?, ?, ?, ?)',
                [cat.name, cat.type, cat.icon, cat.color, 0, cat.description || '']
            );
        }
    });
};

export const clearDatabase = async () => {
    if (!db) return;

    await db.execAsync(`
        DROP TABLE IF EXISTS transactions;
        DROP TABLE IF EXISTS recipients;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS fuliza_transactions;
        DROP TABLE IF EXISTS user_settings;
        DROP TABLE IF EXISTS processed_sms;
    `);

    // Reset initialization state
    db = null;
    initPromise = null;
};

const ensureDb = () => {
    if (!db) {
        throw new Error('Database not initialized. Please call initDatabase() first.');
    }
    return db;
};

export const getCategories = async (): Promise<Category[]> => {
    const database = ensureDb();
    return await database.getAllAsync<Category>('SELECT * FROM categories ORDER BY isCustom DESC, name ASC');
};

export const addCategory = async (category: Omit<Category, 'id'>) => {
    const database = ensureDb();
    const result = await database.runAsync(
        'INSERT INTO categories (name, type, icon, color, isCustom, description) VALUES (?, ?, ?, ?, ?, ?)',
        [category.name, category.type, category.icon, category.color, 1, category.description || '']
    );
    return result.lastInsertRowId;
};

export const deleteCategory = async (id: number) => {
    const database = ensureDb();
    await database.runAsync('DELETE FROM categories WHERE id = ?', [id]);
};

export const saveUserSettings = async (key: string, value: string) => {
    if (!db) {
        console.warn('Database not initialized yet, cannot save user settings');
        return;
    }
    await db.runAsync(
        'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
        [key, value]
    );
};

export const getUserSettings = async (key: string): Promise<string | null> => {
    if (!db) {
        console.warn('Database not initialized yet, returning null for user settings');
        return null;
    }
    const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM user_settings WHERE key = ?',
        [key]
    );
    return result?.value || null;
};

export const getRecipientCategory = async (recipientId: string, type: string): Promise<number | null> => {
    const database = ensureDb();
    const result = await database.getAllAsync<{ categoryId: number }>('SELECT categoryId FROM recipients WHERE id = ? AND type = ?', [recipientId, type]);
    return result.length > 0 ? result[0].categoryId : null;
};

export const getFulizaTransactions = async (): Promise<FulizaTransaction[]> => {
    const database = ensureDb();
    const result = await database.getAllAsync<any>('SELECT * FROM fuliza_transactions ORDER BY date ASC');
    return result.map(row => ({
        ...row,
        date: new Date(row.date),
        dueDate: row.dueDate ? new Date(row.dueDate) : undefined
    }));
};

export const updateFulizaFees = async () => {
    try {
        // 1. Get Fuliza Charges category ID
        const categories = await getCategories();
        const fulizaCategory = categories.find(c => c.name === 'Fuliza Charges');

        if (!fulizaCategory) {
            return;
        }

        // 2. Load ALL history
        const history = await getFulizaTransactions();

        if (history.length === 0) {
            return;
        }

        // 3. Calculate fees
        const monthlyCosts = calculateMonthlyFulizaCosts(history);
        console.log(`💰 Calculated fees for ${monthlyCosts.size} month(s):`);

        monthlyCosts.forEach((cost, monthKey) => {
            console.log(`   ${monthKey}: KES ${cost.toFixed(2)}`);
        });

        // 4. Save fee transactions
        for (const [monthKey, totalCost] of monthlyCosts.entries()) {
            const [year, month] = monthKey.split('-');
            const feeDate = new Date(parseInt(year), parseInt(month), 0);

            const bundledAccessFeeTransaction: Transaction = {
                id: `FULIZA-FEES-${monthKey}`,
                amount: totalCost,
                type: 'SENT',
                recipientId: 'FULIZA-FEES',
                recipientName: 'Fuliza Fees', // Hardcoded name instead of using monthName
                date: feeDate,
                balance: 0,
                transactionCost: 0,
                categoryId: fulizaCategory.id,
                rawSms: 'Generated Monthly Fee'
            };

            await saveTransaction(bundledAccessFeeTransaction);
        }
    } catch (e) {
        console.error('❌ Error updating Fuliza fees:', e);
    }
};

export const saveRecipientCategory = async (recipientId: string, categoryId: number, type: string) => {
    if (!recipientId || !type) {
        console.warn('Skipping saveRecipientCategory: Missing recipientId or type');
        return;
    }
    const database = ensureDb();
    await database.runAsync(
        'INSERT OR REPLACE INTO recipients (id, type, categoryId, lastSeen) VALUES (?, ?, ?, ?)',
        [recipientId, type, categoryId || null, new Date().toISOString()]
    );
    await database.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE recipientId = ? AND type = ? AND categoryId IS NULL',
        [categoryId || null, recipientId, type]
    );
};

export const updateTransactionCategory = async (transactionId: string, categoryId: number) => {
    if (!transactionId) {
        console.warn('Skipping updateTransactionCategory: Missing transactionId');
        return;
    }
    const database = ensureDb();
    await database.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE id = ?',
        [categoryId || null, transactionId]
    );
};

export const updateTransactionDate = async (transactionId: string, newDate: Date) => {
    const database = ensureDb();
    await database.runAsync(
        'UPDATE transactions SET date = ? WHERE id = ?',
        [newDate.toISOString(), transactionId]
    );
};

export const saveFulizaTransaction = async (fuliza: FulizaTransaction) => {
    const database = ensureDb();
    await database.runAsync(
        `INSERT OR REPLACE INTO fuliza_transactions 
        (id, amount, type, accessFee, outstandingBalance, dueDate, linkedTransactionId, date, rawSms) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            fuliza.id,
            fuliza.amount,
            fuliza.type,
            fuliza.accessFee !== undefined ? fuliza.accessFee : null,
            fuliza.outstandingBalance !== undefined ? fuliza.outstandingBalance : null,
            fuliza.dueDate?.toISOString() || null,
            fuliza.linkedTransactionId || null,
            fuliza.date.toISOString(),
            fuliza.rawSms
        ]
    );
};

export const saveTransaction = async (transaction: Transaction) => {
    const database = ensureDb();

    // AUTOMATION: If categoryId is missing, try to apply automation rules
    if (!transaction.categoryId) {
        try {
            const rules = await getAutomationRules(); // This might be slightly expensive, consider caching if performance issues arise
            const matchedRule = evaluateTransaction(transaction, rules);

            if (matchedRule) {
                console.log(`🤖 Auto-categorizing transaction ${transaction.id} using rule: ${matchedRule.name}`);
                transaction.categoryId = matchedRule.action.categoryId;
            }
        } catch (error) {
            console.error('Error applying automation rules:', error);
        }
    }

    await database.runAsync(
        `INSERT OR REPLACE INTO transactions 
    (id, amount, type, recipientId, recipientName, date, balance, transactionCost, categoryId, rawSms) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            transaction.id,
            transaction.amount,
            transaction.type,
            transaction.recipientId,
            transaction.recipientName,
            transaction.date.toISOString(),
            transaction.balance,
            transaction.transactionCost,
            transaction.categoryId || null,
            transaction.rawSms
        ]
    );
};

export const getTransactions = async (): Promise<Transaction[]> => {
    const database = ensureDb();
    const result = await database.getAllAsync<any>(`
        SELECT t.*, c.name as categoryName, c.icon as categoryIcon, c.color as categoryColor, c.description as categoryDescription 
        FROM transactions t 
        LEFT JOIN categories c ON t.categoryId = c.id 
        ORDER BY t.date DESC
    `);

    return result.map(row => ({
        ...row,
        date: new Date(row.date)
    }));
};

export const getSpendingSummary = async (): Promise<SpendingSummary> => {
    const database = ensureDb();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const daily = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfDay]
    );

    const weekly = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfWeek]
    );

    const monthly = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfMonth]
    );

    // Get latest balance from a REAL transaction (exclude generated fees)
    const balanceResult = await database.getAllAsync<{ balance: number }>(
        "SELECT balance FROM transactions WHERE id NOT LIKE 'FULIZA-FEES-%' AND balance > 0 ORDER BY date DESC LIMIT 1"
    );

    const countResult = await database.getAllAsync<{ count: number }>(
        "SELECT count(*) as count FROM transactions"
    );

    const totalSpentResult = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT'"
    );

    const monthlyCostResult = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(transactionCost) as total FROM transactions WHERE date >= ?",
        [startOfMonth]
    );

    const totalIncomeResult = await database.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'RECEIVED'"
    );

    const fulizaResult = await database.getAllAsync<{ balance: number }>(
        `SELECT outstandingBalance as balance 
         FROM fuliza_transactions 
         WHERE outstandingBalance IS NOT NULL 
         ORDER BY date DESC 
         LIMIT 1`
    );

    const currentBalance = balanceResult[0]?.balance || 0;
    const fulizaOutstanding = currentBalance > 0 ? 0 : (fulizaResult[0]?.balance || 0);

    return {
        currentBalance: currentBalance,
        dailyTotal: daily[0]?.total || 0,
        weeklyTotal: weekly[0]?.total || 0,
        monthlyTotal: monthly[0]?.total || 0,
        transactionCount: countResult[0]?.count || 0,
        totalSpent: totalSpentResult[0]?.total || 0,
        monthlyTransactionCost: monthlyCostResult[0]?.total || 0,
        totalIncome: totalIncomeResult[0]?.total || 0,
        fulizaOutstanding: fulizaOutstanding
    };
};

export const isMessageProcessed = async (smsId: string): Promise<boolean> => {
    const database = ensureDb();
    const result = await database.getFirstAsync<{ sms_id: string }>(
        'SELECT sms_id FROM processed_sms WHERE sms_id = ?',
        [smsId]
    );
    return result !== null;
};

export const markMessageAsProcessed = async (smsId: string): Promise<void> => {
    const database = ensureDb();
    await database.runAsync(
        'INSERT OR IGNORE INTO processed_sms (sms_id, processed_at) VALUES (?, ?)',
        [smsId, new Date().toISOString()]
    );
};

export const clearProcessedSms = async (): Promise<void> => {
    const database = ensureDb();
    await database.runAsync('DELETE FROM processed_sms');
    console.log('✅ Cleared processed SMS cache');
};

// Automation Rules

export const getAutomationRules = async (): Promise<AutomationRule[]> => {
    const database = ensureDb();
    const result = await database.getAllAsync<any>('SELECT * FROM automation_rules ORDER BY id DESC');
    return result.map(row => ({
        ...row,
        conditions: JSON.parse(row.conditions),
        action: JSON.parse(row.action),
        isEnabled: row.isEnabled === 1
    }));
};

export const addAutomationRule = async (rule: Omit<AutomationRule, 'id'>) => {
    const database = ensureDb();
    const result = await database.runAsync(
        'INSERT INTO automation_rules (name, type, conditions, action, isEnabled) VALUES (?, ?, ?, ?, ?)',
        [
            rule.name,
            rule.type,
            JSON.stringify(rule.conditions),
            JSON.stringify(rule.action),
            rule.isEnabled ? 1 : 0
        ]
    );
    return result.lastInsertRowId;
};

export const deleteAutomationRule = async (id: number) => {
    const database = ensureDb();
    await database.runAsync('DELETE FROM automation_rules WHERE id = ?', [id]);
};

export const toggleAutomationRule = async (id: number, isEnabled: boolean) => {
    const database = ensureDb();
    await database.runAsync(
        'UPDATE automation_rules SET isEnabled = ? WHERE id = ?',
        [isEnabled ? 1 : 0, id]
    );
};

export const applyRuleToExistingTransactions = async (rule: AutomationRule): Promise<number> => {
    const database = ensureDb();
    const allTransactions = await getTransactions();
    let updatedCount = 0;

    await database.withTransactionAsync(async () => {
        for (const tx of allTransactions) {
            // Check if rule applies to this transaction (ignoring the enabled flag within evaluate, using the rule passed)
            // We reuse evaluateTransaction logic but force check against this specific rule
            // Note: evaluateTransaction expects an array of rules, so we pass just this one
            const matchedRule = evaluateTransaction(tx, [rule]);

            if (matchedRule) {
                // Determine if we should overwrite? 
                // User said "ensure all transaction falling under rule gets updated". 
                // We will overwrite even if it has a category, to strictly enforce the new rule.

                // Only update if category is different to avoid unnecessary writes
                if (tx.categoryId !== rule.action.categoryId) {
                    await database.runAsync(
                        'UPDATE transactions SET categoryId = ? WHERE id = ?',
                        [rule.action.categoryId, tx.id]
                    );

                    // Also update recipient mapping so future manual entries might default correctly (optional but good consistency)
                    if (tx.recipientId) {
                        await database.runAsync(
                            'INSERT OR REPLACE INTO recipients (id, type, categoryId, lastSeen) VALUES (?, ?, ?, ?)',
                            [tx.recipientId, tx.type, rule.action.categoryId, new Date().toISOString()]
                        );
                    }

                    updatedCount++;
                }
            }
        }
    });

    return updatedCount;
};

// Budget Management

export const getMonthlyBudget = async (month: string) => {
    const database = ensureDb();

    // Get total income for the month
    const budgetResult = await database.getFirstAsync<{ totalIncome: number }>(
        'SELECT totalIncome FROM monthly_budgets WHERE month = ?',
        [month]
    );

    // Get category allocations
    const allocations = await database.getAllAsync<{ categoryId: number, budgetAmount: number }>(
        'SELECT categoryId, budgetAmount FROM category_budgets WHERE month = ?',
        [month]
    );

    return {
        totalIncome: budgetResult?.totalIncome || 0,
        allocations: allocations || []
    };
};

export const saveMonthlyBudget = async (month: string, totalIncome: number, allocations: { categoryId: number, budgetAmount: number }[]) => {
    const database = ensureDb();

    await database.withTransactionAsync(async () => {
        // Save total income
        await database.runAsync(
            'INSERT OR REPLACE INTO monthly_budgets (month, totalIncome) VALUES (?, ?)',
            [month, totalIncome]
        );

        // Save allocations
        for (const allocation of allocations) {
            await database.runAsync(
                'INSERT OR REPLACE INTO category_budgets (month, categoryId, budgetAmount) VALUES (?, ?, ?)',
                [month, allocation.categoryId, allocation.budgetAmount]
            );
        }
    });
};

export const getCategorySpending = async (month: string): Promise<Record<number, number>> => {
    const database = ensureDb();
    const [year, monthNum] = month.split('-');

    // Calculate start and end of month based on the "YYYY-MM" string
    // Note: JS Date month is 0-indexed, so we subtract 1 from parsed monthNum
    const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1).toISOString();
    const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59).toISOString(); // End of the month

    const result = await database.getAllAsync<{ categoryId: number, total: number }>(
        `SELECT categoryId, SUM(amount) as total 
         FROM transactions 
         WHERE date >= ? AND date <= ? AND type = 'SENT' AND categoryId IS NOT NULL
         GROUP BY categoryId`,
        [startDate, endDate]
    );

    const spending: Record<number, number> = {};
    result.forEach(row => {
        spending[row.categoryId] = row.total;
    });
    return spending;
};

export const transactionExists = async (id: string): Promise<boolean> => {
    const database = ensureDb();
    const result = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM transactions WHERE id = ?',
        [id]
    );
    return result !== null;
};

export const deleteTransaction = async (id: string) => {
    const database = ensureDb();
    await database.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
};
