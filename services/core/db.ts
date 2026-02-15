import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getDb = () => {
    if (!db) {
        throw new Error("Database not initialized. Call initDatabase() first.");
    }
    return db;
};

let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const initDatabase = async () => {
    if (db) return db;

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            console.log('🔧 Initializing Unified Database...');
            db = await SQLite.openDatabaseAsync('budget.db');

            // Enable Foreign Keys for strict data integrity
            await db.execAsync('PRAGMA foreign_keys = ON;');

            await runUnifiedMigrations(db);

            return db;
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            initPromise = null; // Allow retry
            throw error;
        }
    })();

    return initPromise;
};

const runUnifiedMigrations = async (database: SQLite.SQLiteDatabase) => {
    console.log('🔄 Running Table Migrations...');

    // 1. Categories Table (Legacy + Strict)
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL,
            isCustom INTEGER DEFAULT 0,
            description TEXT
        );
    `);

    // 2. Recipients Table (Legacy + Strict)
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS recipients (
            id TEXT,
            type TEXT,
            categoryId INTEGER,
            lastSeen TEXT,
            PRIMARY KEY (id, type),
            FOREIGN KEY (categoryId) REFERENCES categories (id)
        );
    `);

    // 3. Accounts Table (Strict Ledger)
    console.log('Checking ACCOUNTS table...');
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'local_user',
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('M-PESA', 'BANK', 'CASH', 'DEBT')),
            balance REAL DEFAULT 0,
            currency TEXT DEFAULT 'KES',
            isActive INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
    `);

    // 4. Debts Table (Strict Ledger)
    console.log('Checking DEBTS table...');
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS debts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'local_user',
            account_id TEXT,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'LIABILITY' CHECK (type IN ('LIABILITY', 'RECEIVABLE', 'OVERDRAFT')),
            principal_amount REAL NOT NULL,
            current_balance REAL NOT NULL,
            is_revolving INTEGER DEFAULT 0,
            interest_rate REAL,
            status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAID', 'DEFAULTED')),
            start_date TEXT DEFAULT CURRENT_TIMESTAMP,
            due_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
    `);

    // 5. Transactions Table (Standardized snake_case)
    console.log('Checking TRANSACTIONS table...');
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            uuid TEXT,
            user_id TEXT DEFAULT 'local_user',
            account_id TEXT,
            category_id INTEGER,
            amount REAL,
            type TEXT,
            transaction_kind TEXT DEFAULT 'EXPENSE',
            recipient_id TEXT,
            recipient_name TEXT,
            date TEXT,
            balance REAL,
            balance_after REAL,
            transaction_cost REAL,
            raw_sms TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            linked_debt_id TEXT,
            linked_goal_id TEXT,
            reference_id TEXT,
            FOREIGN KEY (category_id) REFERENCES categories (id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
    `);

    // Defensive check for missing columns
    const tableInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    const columns = tableInfo.map(c => c.name);

    const requiredColumns = [
        { name: 'category_id', type: 'INTEGER' },
        { name: 'transaction_kind', type: 'TEXT DEFAULT \'EXPENSE\'' },
        { name: 'recipient_id', type: 'TEXT' },
        { name: 'recipient_name', type: 'TEXT' },
        { name: 'balance_after', type: 'REAL' },
        { name: 'transaction_cost', type: 'REAL' },
        { name: 'raw_sms', type: 'TEXT' },
        { name: 'linked_debt_id', type: 'TEXT' },
        { name: 'linked_goal_id', type: 'TEXT' },
        { name: 'reference_id', type: 'TEXT' }
    ];

    for (const col of requiredColumns) {
        if (!columns.includes(col.name)) {
            console.log(`🛠️ Migrating: Adding missing column ${col.name} to transactions`);
            try {
                await database.execAsync(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.type}`);
            } catch (e) {
                console.warn(`⚠️ Failed to add column ${col.name}:`, e);
            }
        }
    }

    await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_tx_uuid ON transactions(uuid);
    `);

    // 6. Support Tables
    await database.execAsync(`
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

        CREATE TABLE IF NOT EXISTS debt_payments (
            id TEXT PRIMARY KEY,
            debt_id TEXT NOT NULL,
            transaction_id TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE, 
            FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        );
    `);

    // Seed defaults
    await seedCategories(database);
    await seedDefaultAccounts(database);
    await backfillTransactionData(database);
};

const seedCategories = async (database: SQLite.SQLiteDatabase) => {
    const result = await database.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM categories');
    if (result && result.count > 0) return;

    console.log('🌱 Seeding Categories...');
    const categories = [
        ['Food & Dining', 'EXPENSE', 'cutlery', '#ef4444', 0, 'Groceries, restaurants, and snacks'],
        ['Transport', 'EXPENSE', 'bus', '#f59e0b', 0, 'Commute, fuel, and travel'],
        ['Shopping', 'EXPENSE', 'shopping-bag', '#ec4899', 0, 'Clothes, gadgets, and personal items'],
        ['Entertainment', 'EXPENSE', 'film', '#8b5cf6', 0, 'Movies, games, and events'],
        ['Bills & Utilities', 'EXPENSE', 'bolt', '#3b82f6', 0, 'Electricity, water, and internet'],
        ['Health', 'EXPENSE', 'stethoscope', '#10b981', 0, 'Medical and fitness'],
        ['Education', 'EXPENSE', 'graduation-cap', '#6366f1', 0, 'Tuition, books, and courses'],
        ['Personal Care', 'EXPENSE', 'smile-o', '#f472b6', 0, 'Grooming and wellness'],
        ['Salary', 'INCOME', 'money', '#22c55e', 0, 'Monthly salary'],
        ['Business', 'INCOME', 'briefcase', '#0ea5e9', 0, 'Business revenue'],
        ['Gifts', 'INCOME', 'gift', '#d946ef', 0, 'Gifts received'],
        ['Fuliza Charges', 'EXPENSE', 'warning', '#f97316', 0, 'Fuliza access fees and interest']
    ];

    for (const cat of categories) {
        await database.runAsync(
            'INSERT INTO categories (name, type, icon, color, isCustom, description) VALUES (?, ?, ?, ?, ?, ?)',
            cat
        );
    }
};

const seedDefaultAccounts = async (database: SQLite.SQLiteDatabase) => {
    const mpesaId = 'ACC-MPESA-DEFAULT';
    const cashId = 'ACC-CASH-DEFAULT';
    const now = new Date().toISOString();

    console.log('🌱 Seeding Default Accounts...');
    await database.runAsync(`
        INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance, currency, isActive, created_at, updated_at)
        VALUES 
            (?, 'local_user', 'M-PESA', 'M-PESA', 0, 'KES', 1, ?, ?),
            (?, 'local_user', 'Cash', 'CASH', 0, 'KES', 1, ?, ?)
    `, [mpesaId, now, now, cashId, now, now]);

    const verify = await database.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [mpesaId]);
    if (verify) console.log(`✅ Default Account Verified: ${verify.id}`);
};

const backfillTransactionData = async (database: SQLite.SQLiteDatabase) => {
    const mpesaId = 'ACC-MPESA-DEFAULT';
    console.log('📦 Backfilling Transaction Data...');
    await database.execAsync(`
        UPDATE transactions 
        SET 
            uuid = COALESCE(uuid, id),
            user_id = 'local_user',
            account_id = COALESCE(account_id, '${mpesaId}'),
            transactionKind = CASE 
                WHEN transactionKind IS NOT NULL THEN transactionKind
                WHEN type = 'SENT' THEN 'EXPENSE' 
                ELSE 'INCOME' 
            END,
            created_at = COALESCE(created_at, date),
            updated_at = COALESCE(updated_at, date),
            is_deleted = 0
        WHERE account_id IS NULL OR uuid IS NULL;
    `);
};

