import * as SQLite from 'expo-sqlite';
import { Category, SpendingSummary, Transaction } from '../types/transaction';

let db: SQLite.SQLiteDatabase;

export const initDatabase = async () => {
    try {
        if (!db) {
            db = await SQLite.openDatabaseAsync('budget.db');
        }

        // Drop and recreate categories table to force refresh (for development)
        await db.runAsync(`DROP TABLE IF EXISTS categories;`);

        // Create tables one by one using runAsync which is safer for single statements
        await db.runAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        isCustom INTEGER DEFAULT 0
      );
    `);

        await db.runAsync(`
      CREATE TABLE IF NOT EXISTS recipients (
        id TEXT PRIMARY KEY,
        categoryId INTEGER,
        lastSeen TEXT,
        FOREIGN KEY (categoryId) REFERENCES categories (id)
      );
    `);

        await db.runAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        recipientId TEXT NOT NULL,
        recipientName TEXT NOT NULL,
        date TEXT NOT NULL,
        balance REAL,
        transactionCost REAL,
        categoryId INTEGER,
        rawSms TEXT,
        FOREIGN KEY (recipientId) REFERENCES recipients (id),
        FOREIGN KEY (categoryId) REFERENCES categories (id)
      );
    `);

        // Seed default categories if empty
        const result = await db.getAllAsync<{ count: number }>('SELECT count(*) as count FROM categories');
        if (result[0].count === 0) {
            await seedCategories();
        }
    } catch (error) {
        console.error("Database initialization error:", error);
        // Don't throw, just log. This prevents the app from crashing entirely if DB fails,
        // though functionality will be limited.
    }
};

const seedCategories = async () => {
    const categories = [
        // HOME
        { name: 'Rent/Mortgage', type: 'EXPENSE', icon: 'home', color: '#ef4444' },
        { name: 'Water', type: 'EXPENSE', icon: 'tint', color: '#3b82f6' },
        { name: 'Electricity', type: 'EXPENSE', icon: 'bolt', color: '#eab308' },
        { name: 'Internet', type: 'EXPENSE', icon: 'wifi', color: '#8b5cf6' },
        { name: 'Maintenance', type: 'EXPENSE', icon: 'wrench', color: '#64748b' },
        { name: 'Family Help', type: 'EXPENSE', icon: 'users', color: '#ec4899' },
        // TRANSPORTATION
        { name: 'Transport', type: 'EXPENSE', icon: 'bus', color: '#f97316' },
        { name: 'Fuel', type: 'EXPENSE', icon: 'car', color: '#f59e0b' },
        // DAILY LIVING
        { name: 'Groceries', type: 'EXPENSE', icon: 'shopping-basket', color: '#10b981' },
        { name: 'Dining Out', type: 'EXPENSE', icon: 'cutlery', color: '#f43f5e' },
        { name: 'Clothing', type: 'EXPENSE', icon: 'shopping-bag', color: '#ec4899' },
        { name: 'Personal Care', type: 'EXPENSE', icon: 'user', color: '#d946ef' },
        // HEALTH
        { name: 'Medical', type: 'EXPENSE', icon: 'medkit', color: '#ef4444' },
        // VACATION
        { name: 'Vacation', type: 'EXPENSE', icon: 'plane', color: '#0ea5e9' },
        // SAVINGS/INCOME
        { name: 'Salary', type: 'INCOME', icon: 'money', color: '#22c55e' },
        { name: 'Business', type: 'INCOME', icon: 'briefcase', color: '#3b82f6' },
        { name: 'Savings', type: 'EXPENSE', icon: 'bank', color: '#14b8a6' },
        // OTHER
        { name: 'Other', type: 'EXPENSE', icon: 'question', color: '#94a3b8' },
    ];

    for (const cat of categories) {
        await db.runAsync(
            'INSERT INTO categories (name, type, icon, color, isCustom) VALUES (?, ?, ?, ?, 0)',
            [cat.name, cat.type, cat.icon, cat.color]
        );
    }
};

export const clearDatabase = async () => {
    if (!db) return;

    try {
        // Drop all tables
        await db.runAsync(`DROP TABLE IF EXISTS transactions;`);
        await db.runAsync(`DROP TABLE IF EXISTS recipients;`);
        await db.runAsync(`DROP TABLE IF EXISTS categories;`);
    } catch (error) {
        console.error("Error clearing database:", error);
    }
};

export const getCategories = async (): Promise<Category[]> => {
    return await db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
};

export const getRecipientCategory = async (recipientId: string): Promise<number | null> => {
    const result = await db.getAllAsync<{ categoryId: number }>('SELECT categoryId FROM recipients WHERE id = ?', [recipientId]);
    return result.length > 0 ? result[0].categoryId : null;
};

export const saveRecipientCategory = async (recipientId: string, categoryId: number) => {
    await db.runAsync(
        'INSERT OR REPLACE INTO recipients (id, categoryId, lastSeen) VALUES (?, ?, ?)',
        [recipientId, categoryId, new Date().toISOString()]
    );
    // Update existing transactions for this recipient
    await db.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE recipientId = ? AND categoryId IS NULL',
        [categoryId, recipientId]
    );
};

export const updateTransactionCategory = async (transactionId: string, categoryId: number) => {
    await db.runAsync(
        'UPDATE transactions SET categoryId = ? WHERE id = ?',
        [categoryId, transactionId]
    );
};

export const saveTransaction = async (transaction: Transaction) => {
    await db.runAsync(
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
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const result = await db.getAllAsync<any>(`
        SELECT t.*, c.name as categoryName, c.icon as categoryIcon, c.color as categoryColor 
        FROM transactions t 
        LEFT JOIN categories c ON t.categoryId = c.id 
        WHERE t.date >= ?
        ORDER BY t.date DESC
    `, [startOfMonth]);

    return result.map(row => ({
        ...row,
        date: new Date(row.date)
    }));
};

export const getSpendingSummary = async (): Promise<SpendingSummary> => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const daily = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfDay]
    );

    const weekly = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfWeek]
    );

    const monthly = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT' AND date >= ?",
        [startOfMonth]
    );

    const balanceResult = await db.getAllAsync<{ balance: number }>(
        "SELECT balance FROM transactions ORDER BY date DESC LIMIT 1"
    );

    const countResult = await db.getAllAsync<{ count: number }>(
        "SELECT count(*) as count FROM transactions"
    );

    const totalSpentResult = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'SENT'"
    );

    const monthlyCostResult = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(transactionCost) as total FROM transactions WHERE date >= ?",
        [startOfMonth]
    );

    const totalIncomeResult = await db.getAllAsync<{ total: number }>(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'RECEIVED'"
    );

    return {
        currentBalance: balanceResult[0]?.balance || 0,
        dailyTotal: daily[0]?.total || 0,
        weeklyTotal: weekly[0]?.total || 0,
        monthlyTotal: monthly[0]?.total || 0,
        transactionCount: countResult[0]?.count || 0,
        totalSpent: totalSpentResult[0]?.total || 0,
        monthlyTransactionCost: monthlyCostResult[0]?.total || 0,
        totalIncome: totalIncomeResult[0]?.total || 0
    };
};
