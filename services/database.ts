import * as SQLite from 'expo-sqlite';
import { Category, FulizaTransaction, SpendingSummary, Transaction } from '../types/transaction';

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

export const saveRecipientCategory = async (recipientId: string, categoryId: number, type: string) => {
    const database = ensureDb();
    await database.runAsync(
        'INSERT OR REPLACE INTO recipients (id, type, categoryId, lastSeen) VALUES (?, ?, ?, ?)',
        [recipientId, type, categoryId, new Date().toISOString()]
    );
    await database.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE recipientId = ? AND type = ? AND categoryId IS NULL',
        [categoryId, recipientId, type]
    );
};

export const updateTransactionCategory = async (transactionId: string, categoryId: number) => {
    const database = ensureDb();
    await database.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE id = ?',
        [categoryId, transactionId]
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
            fuliza.accessFee || null,
            fuliza.outstandingBalance || null,
            fuliza.dueDate?.toISOString() || null,
            fuliza.linkedTransactionId || null,
            fuliza.date.toISOString(),
            fuliza.rawSms
        ]
    );
};

export const saveTransaction = async (transaction: Transaction) => {
    const database = ensureDb();
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

    const balanceResult = await database.getAllAsync<{ balance: number }>(
        "SELECT balance FROM transactions ORDER BY date DESC LIMIT 1"
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
