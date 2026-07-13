import * as SQLite from 'expo-sqlite';
import { generateUUID } from '../../utils/uuid';

// Reactive Subscription Logic
export type DatabaseChangeType = 'TRANSACTIONS' | 'CATEGORIES' | 'BUDGETS' | 'SETTINGS' | 'INCOME_LOGS' | 'DEBTS' | 'SAVINGS' | 'INCOME_SOURCES';
type DatabaseChangeListener = (type: DatabaseChangeType) => void;
let listeners: DatabaseChangeListener[] = [];

export const subscribeToDatabaseChanges = (listener: DatabaseChangeListener) => {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter(l => l !== listener);
    };
};

export const notifyListeners = (type: DatabaseChangeType) => {
    // Basic debounce/defer to avoid rapid re-renders if multiple updates happen
    setTimeout(() => {
        listeners.forEach(l => l(type));
    }, 0);
};

export const notifyListenersImmediate = (type: DatabaseChangeType) => {
    listeners.forEach(l => l(type));
};

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

export const initDatabase = async () => {
    if (db) return;
    if (initPromise) return initPromise;

    initPromise = performInitialization();
    return initPromise;
};

/**
 * This database is intentionally a single on-device profile. Before a different
 * Firebase user is allowed into the app, AuthContext clears this profile so one
 * person's SMS and financial data cannot be shown to another person.
 */
export const clearLocalProfileData = async (): Promise<void> => {
    await initDatabase();
    const database = getDb();
    const tables = [
        'debt_payments', 'income_logs', 'transactions', 'fuliza_transactions',
        'debts', 'savings_goals', 'manual_recurring_transactions', 'recipients',
        'category_budgets', 'monthly_budgets', 'monthly_summaries', 'category_trends',
        'net_worth_history', 'automation_rules', 'user_settings', 'processed_sms',
        'income_sources', 'accounts', 'categories'
    ];

    await database.withTransactionAsync(async () => {
        for (const table of tables) {
            await database.runAsync(`DELETE FROM ${table}`);
        }
    });

    await seedCategories(database);
    await seedDefaultAccounts(database);
    ['TRANSACTIONS', 'CATEGORIES', 'BUDGETS', 'SETTINGS', 'INCOME_LOGS', 'DEBTS', 'SAVINGS', 'INCOME_SOURCES']
        .forEach((type) => notifyListenersImmediate(type as DatabaseChangeType));
};

// Re-export for consistency across layers
export { generateUUID };

async function performInitialization() {
    try {
        const database = await SQLite.openDatabaseAsync('unified.db');
        console.log('🔧 Initializing Unified Database...');

        // 1. Categories Table (Master)
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
                icon TEXT,
                color TEXT,
                isCustom INTEGER DEFAULT 0,
                description TEXT
            );
        `);

        // 2. Recipients Table (Legacy + Strict)
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS recipients (
                id TEXT,
                type TEXT,
                category_id INTEGER,
                account_id TEXT,
                last_seen TEXT,
                PRIMARY KEY (id, type),
                FOREIGN KEY (category_id) REFERENCES categories (id)
            );
        `);

        // 3. Accounts Table (Strict Ledger)
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'local_user',
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('M-PESA', 'BANK', 'CASH', 'DEBT')),
                balance REAL DEFAULT 0,
                currency TEXT DEFAULT 'KES',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
        `);

        // 4. Debts Table (Strict Ledger)
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
                is_reducing_balance INTEGER DEFAULT 0,
                interest_rate REAL,
                status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAID', 'DEFAULTED')),
                start_date TEXT DEFAULT CURRENT_TIMESTAMP,
                due_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );
        `);

        // 5. Transactions Table (Refined Ledger)
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

        // 6. Savings Goals Table
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS savings_goals (
                id TEXT PRIMARY KEY,
                user_id TEXT DEFAULT 'local_user',
                name TEXT NOT NULL,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0,
                target_date TEXT,
                color TEXT,
                status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'PAUSED')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 7. Income Sources Table
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS income_sources (
                id TEXT PRIMARY KEY,
                user_id TEXT DEFAULT 'local_user',
                name TEXT NOT NULL,
                category_id INTEGER,
                is_recurring INTEGER DEFAULT 1,
                expected_amount REAL,
                frequency TEXT DEFAULT 'MONTHLY' CHECK (frequency IN ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'IRREGULAR')),
                scheduled_date TEXT,
                sms_sender_id TEXT,
                color TEXT,
                status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
                last_received TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );
        `);

        // 8. Income Logs Table
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS income_logs (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                transaction_id TEXT,
                sms_transaction_id TEXT,
                amount REAL NOT NULL,
                received_at TEXT NOT NULL,
                notes TEXT,
                is_scheduled INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES income_sources(id) ON DELETE CASCADE,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id)
            );
        `);

        // Kept outside normal cloud-restore tables so a failed or unwanted
        // restore can be recovered locally.
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS restore_snapshots (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );
        `);

        // 9. Monthly Summaries Table (Phase 5 - Financial Intelligence)
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS monthly_summaries (
                id TEXT PRIMARY KEY,
                month TEXT NOT NULL UNIQUE,
                user_id TEXT DEFAULT 'local_user',
                total_income REAL DEFAULT 0,
                total_expenses REAL DEFAULT 0,
                total_savings REAL DEFAULT 0,
                net_worth_snapshot REAL DEFAULT 0,
                generated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 10. Category Trends Table
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS category_trends (
                id TEXT PRIMARY KEY,
                month TEXT NOT NULL,
                category_id INTEGER,
                category_name TEXT,
                total REAL DEFAULT 0,
                transaction_count INTEGER DEFAULT 0,
                pct_of_expenses REAL DEFAULT 0,
                UNIQUE(month, category_id)
            );
        `);

        // 11. Net Worth History Table
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS net_worth_history (
                id TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL UNIQUE,
                total_assets REAL DEFAULT 0,
                total_liabilities REAL DEFAULT 0,
                net_worth REAL DEFAULT 0
            );
        `);

        console.log('🔄 Running Table Migrations...');

        // Defensive check for missing columns and renames
        const txTableInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
        const txColumns = txTableInfo.map(c => c.name);

        const transactionRenames = [
            { old: 'categoryId', new: 'category_id' },
            { old: 'transactionKind', new: 'transaction_kind' },
            { old: 'recipientId', new: 'recipient_id' },
            { old: 'recipientName', new: 'recipient_name' },
            { old: 'balanceAfter', new: 'balance_after' },
            { old: 'transactionCost', new: 'transaction_cost' },
            { old: 'rawSms', new: 'raw_sms' },
            { old: 'linkedDebtId', new: 'linked_debt_id' },
            { old: 'linkedGoalId', new: 'linked_goal_id' },
            { old: 'referenceId', new: 'reference_id' }
        ];

        for (const rename of transactionRenames) {
            if (txColumns.includes(rename.old) && !txColumns.includes(rename.new)) {
                console.log(`🛠️ Migrating transactions: ${rename.old} -> ${rename.new}`);
                try {
                    await database.execAsync(`ALTER TABLE transactions RENAME COLUMN ${rename.old} TO ${rename.new}`);
                } catch (e) {
                    console.warn(`⚠️ Failed to rename ${rename.old} in transactions:`, e);
                }
            }
        }

        const debtTableInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(debts)');
        const debtColumns = debtTableInfo.map(c => c.name);

        if (!debtColumns.includes('is_reducing_balance')) {
            console.log(`🛠️ Migrating debts: Adding is_reducing_balance`);
            try {
                await database.execAsync(`ALTER TABLE debts ADD COLUMN is_reducing_balance INTEGER DEFAULT 0`);
            } catch (e) {
                console.warn(`⚠️ Failed to add is_reducing_balance in debts:`, e);
            }
        }

        const requiredColumns = [
            { name: 'category_id', type: 'INTEGER' },
            { name: 'transaction_kind', type: "TEXT DEFAULT 'EXPENSE'" },
            { name: 'recipient_id', type: 'TEXT' },
            { name: 'recipient_name', type: 'TEXT' },
            { name: 'balance_after', type: 'REAL' },
            { name: 'transaction_cost', type: 'REAL' },
            { name: 'raw_sms', type: 'TEXT' },
            { name: 'linked_debt_id', type: 'TEXT' },
            { name: 'linked_goal_id', type: 'TEXT' },
            { name: 'reference_id', type: 'TEXT' }
        ];

        // Refresh columns after renames
        const refreshInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
        const refreshCols = refreshInfo.map(c => c.name);

        for (const col of requiredColumns) {
            if (!refreshCols.includes(col.name)) {
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
            CREATE INDEX IF NOT EXISTS idx_tx_active_date ON transactions(is_deleted, date);
            CREATE INDEX IF NOT EXISTS idx_tx_type_date ON transactions(type, date);
            CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);
            CREATE INDEX IF NOT EXISTS idx_tx_recipient_type_date ON transactions(recipient_id, type, date);
            CREATE INDEX IF NOT EXISTS idx_tx_linked_debt ON transactions(linked_debt_id);
            CREATE INDEX IF NOT EXISTS idx_tx_linked_goal ON transactions(linked_goal_id);
            CREATE INDEX IF NOT EXISTS idx_income_logs_transaction_id ON income_logs(transaction_id);
        `);

        // Recipients migration
        const recipientInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(recipients)');
        const recipientCols = recipientInfo.map(c => c.name);
        if (recipientCols.includes('categoryId') && !recipientCols.includes('category_id')) {
            await database.execAsync('ALTER TABLE recipients RENAME COLUMN categoryId TO category_id');
        }
        if (recipientCols.includes('lastSeen') && !recipientCols.includes('last_seen')) {
            await database.execAsync('ALTER TABLE recipients RENAME COLUMN lastSeen TO last_seen');
        }

        // category_budgets migration
        const budgetInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(category_budgets)');
        const budgetCols = budgetInfo.map(c => c.name);
        if (budgetCols.includes('categoryId') && !budgetCols.includes('category_id')) {
            await database.execAsync('ALTER TABLE category_budgets RENAME COLUMN categoryId TO category_id');
        }
        if (budgetCols.includes('budgetAmount') && !budgetCols.includes('budget_amount')) {
            await database.execAsync('ALTER TABLE category_budgets RENAME COLUMN budgetAmount TO budget_amount');
        }

        // Other standardizations
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS fuliza_transactions (
                id TEXT PRIMARY KEY,
                amount REAL,
                type TEXT,
                access_fee REAL,
                outstanding_balance REAL,
                due_date TEXT,
                linked_transaction_id TEXT,
                date TEXT,
                raw_sms TEXT,
                FOREIGN KEY (linked_transaction_id) REFERENCES transactions (id)
            );

            CREATE TABLE IF NOT EXISTS user_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS manual_recurring_transactions (
                id TEXT PRIMARY KEY,
                user_id TEXT DEFAULT 'local_user',
                account_id TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('SENT', 'RECEIVED')),
                amount REAL NOT NULL,
                recipient_name TEXT NOT NULL,
                raw_sms TEXT,
                start_month TEXT NOT NULL,
                last_generated_month TEXT NOT NULL,
                start_date TEXT,
                last_generated_date TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_manual_recurring_active_month
            ON manual_recurring_transactions(is_active, last_generated_month);

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
                is_enabled INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS monthly_budgets (
                month TEXT PRIMARY KEY,
                total_income REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS category_budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                category_id INTEGER NOT NULL,
                budget_amount REAL DEFAULT 0,
                FOREIGN KEY (category_id) REFERENCES categories (id),
                UNIQUE(month, category_id)
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

            CREATE INDEX IF NOT EXISTS idx_debt_payments_transaction_id ON debt_payments(transaction_id);
        `);

        // Migration for automation_rules is_enabled and monthly_budgets total_income
        const ruleInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(automation_rules)');
        const ruleCols = ruleInfo.map(c => c.name);
        if (ruleCols.includes('isEnabled') && !ruleCols.includes('is_enabled')) {
            await database.execAsync('ALTER TABLE automation_rules RENAME COLUMN isEnabled TO is_enabled');
        }

        const mBudgetInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(monthly_budgets)');
        const mBudgetCols = mBudgetInfo.map(c => c.name);
        if (mBudgetCols.includes('totalIncome') && !mBudgetCols.includes('total_income')) {
            await database.execAsync('ALTER TABLE monthly_budgets RENAME COLUMN totalIncome TO total_income');
        }

        // Income-source schedule and SMS matching were added after the first release.
        // Keep existing on-device databases compatible with the recurring-income flow.
        const incomeSourceInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(income_sources)');
        const incomeSourceCols = incomeSourceInfo.map(c => c.name);
        for (const column of [
            { name: 'scheduled_date', type: 'TEXT' },
            { name: 'sms_sender_id', type: 'TEXT' },
            { name: 'account_id', type: 'TEXT' },
        ]) {
            if (!incomeSourceCols.includes(column.name)) {
                await database.execAsync(`ALTER TABLE income_sources ADD COLUMN ${column.name} ${column.type}`);
            }
        }

        const incomeLogInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(income_logs)');
        if (!incomeLogInfo.some(c => c.name === 'is_scheduled')) {
            await database.execAsync('ALTER TABLE income_logs ADD COLUMN is_scheduled INTEGER DEFAULT 0');
        }
        if (!incomeLogInfo.some(c => c.name === 'sms_transaction_id')) {
            await database.execAsync('ALTER TABLE income_logs ADD COLUMN sms_transaction_id TEXT');
        }
        await database.execAsync('CREATE INDEX IF NOT EXISTS idx_income_sources_sms_sender ON income_sources(sms_sender_id)');

        const manualRecurringInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(manual_recurring_transactions)');
        for (const column of [
            { name: 'start_date', type: 'TEXT' },
            { name: 'last_generated_date', type: 'TEXT' },
        ]) {
            if (!manualRecurringInfo.some((item) => item.name === column.name)) {
                await database.execAsync(`ALTER TABLE manual_recurring_transactions ADD COLUMN ${column.name} ${column.type}`);
            }
        }

        const accountInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)');
        const accountCols = accountInfo.map(c => c.name);
        if (accountCols.includes('isActive') && !accountCols.includes('is_active')) {
            await database.execAsync('ALTER TABLE accounts RENAME COLUMN isActive TO is_active');
        }

        // Seed defaults
        await seedCategories(database);
        await seedDefaultAccounts(database);
        await backfillTransactionData(database);
        await redactStoredSmsBodies(database);

        // FINALLY set the global db instance once everything is ready
        db = database;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        initPromise = null; // Allow retry
        throw error;
    }
}

export const getDb = (): SQLite.SQLiteDatabase => {
    if (!db) throw new Error('Database not initialized');
    return db;
};

async function seedCategories(database: SQLite.SQLiteDatabase) {
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
        ['Fuliza Charges', 'EXPENSE', 'warning', '#f97316', 0, 'Fuliza access fees and interest'],
        ['Savings', 'EXPENSE', 'lock', '#6366f1', 0, 'Money moved to savings goals'],
        ['Debt Repayment', 'EXPENSE', 'money', '#0f172a', 0, 'Payments made towards debts']
    ];

    for (const cat of categories) {
        await database.runAsync(
            'INSERT INTO categories (name, type, icon, color, isCustom, description) VALUES (?, ?, ?, ?, ?, ?)',
            cat
        );
    }
}

/** Keep only the structured transaction data; SMS bodies contain unnecessary PII. */
async function redactStoredSmsBodies(database: SQLite.SQLiteDatabase) {
    await database.runAsync(`
        UPDATE transactions
        SET raw_sms = CASE
            WHEN raw_sms LIKE '%M-PESA balance%' THEN 'Imported SMS transaction - M-PESA balance reported'
            ELSE 'Imported SMS transaction'
        END
        WHERE raw_sms IS NOT NULL
          AND raw_sms NOT LIKE 'Manual %'
          AND raw_sms NOT LIKE 'Scheduled income:%'
          AND raw_sms NOT LIKE 'Internal Transfer:%'
    `);
    await database.runAsync(
        "UPDATE fuliza_transactions SET raw_sms = 'Imported SMS transaction' WHERE raw_sms IS NOT NULL"
    );
}

async function seedDefaultAccounts(database: SQLite.SQLiteDatabase) {
    const mpesaId = 'ACC-MPESA-DEFAULT';
    const cashId = 'ACC-CASH-DEFAULT';
    const bankId = 'ACC-BANK-DEFAULT';
    const now = new Date().toISOString();

    console.log('🌱 Seeding Default Accounts...');
    await database.runAsync(`
        INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance, currency, is_active, created_at, updated_at)
        VALUES 
            (?, 'local_user', 'M-PESA', 'M-PESA', 0, 'KES', 1, ?, ?),
            (?, 'local_user', 'Cash', 'CASH', 0, 'KES', 1, ?, ?),
            (?, 'local_user', 'Bank', 'BANK', 0, 'KES', 1, ?, ?)
    `, [mpesaId, now, now, cashId, now, now, bankId, now, now]);
}

async function backfillTransactionData(database: SQLite.SQLiteDatabase) {
    const mpesaId = 'ACC-MPESA-DEFAULT';
    console.log('📦 Backfilling Transaction Data...');
    await database.execAsync(`
        UPDATE transactions 
        SET 
            uuid = COALESCE(uuid, id),
            user_id = 'local_user',
            account_id = COALESCE(account_id, '${mpesaId}'),
            transaction_kind = CASE 
                WHEN transaction_kind IS NOT NULL THEN transaction_kind
                WHEN type = 'SENT' THEN 'EXPENSE' 
                ELSE 'INCOME' 
            END,
            created_at = COALESCE(created_at, date),
            updated_at = COALESCE(updated_at, date),
            is_deleted = 0
        WHERE account_id IS NULL OR uuid IS NULL;
    `);
}
