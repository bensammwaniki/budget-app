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

export const initDatabase = async () => {
    if (db) return db;

    console.log('🔧 Initializing Core Ledger Database...');
    db = await SQLite.openDatabaseAsync('budget.db');

    // Enable Foreign Keys
    await db.execAsync('PRAGMA foreign_keys = ON;');

    await runStrictMigrations(db);

    return db;
};

const runStrictMigrations = async (database: SQLite.SQLiteDatabase) => {
    // 1. Create ACCOUNTS table (Strict)
    // Rules: Allow negative balance only if account_type = 'DEBT' (Enforced via CHECK trigger or simplified app logic)
    // We will use a CHECK constraint for account_type
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

    // 1.5. Migrate ACCOUNTS Table (Backfill columns if they don't exist from older Phase 1)
    const accountColumnsResult = await database.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)');
    const accountColumns = accountColumnsResult.map(c => c.name);

    const accountColsToAdd = [
        { name: 'user_id', def: "TEXT NOT NULL DEFAULT 'local_user'" },
        { name: 'created_at', def: "TEXT DEFAULT CURRENT_TIMESTAMP" },
        { name: 'updated_at', def: "TEXT DEFAULT CURRENT_TIMESTAMP" }
    ];

    for (const col of accountColsToAdd) {
        if (!accountColumns.includes(col.name)) {
            console.log(`🔄 Migrating accounts table: Adding ${col.name}...`);
            try {
                await database.execAsync(`ALTER TABLE accounts ADD COLUMN ${col.name} ${col.def}`);
            } catch (e) {
                console.log(`Note: Column ${col.name} might error adding:`, e);
            }
        }
    }

    // Seed immediately after structure is guaranteed
    await seedDefaultAccounts(database);

    // 3. Create DEBTS Table (Ensure this runs)
    console.log('Checking DEBTS table...');
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS debts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'local_user',
            account_id TEXT, -- Optional origin account
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'LIABILITY' CHECK (type IN ('LIABILITY', 'RECEIVABLE', 'OVERDRAFT')),
            principal_amount REAL NOT NULL,
            current_balance REAL NOT NULL,
            is_revolving INTEGER DEFAULT 0, -- 1 for revolving/overdraft
            interest_rate REAL,
            status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAID', 'DEFAULTED')),
            start_date TEXT DEFAULT CURRENT_TIMESTAMP,
            due_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
        CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
    `);

    // 4. Create DEBT_PAYMENTS Table
    console.log('Checking DEBT_PAYMENTS table...');
    await database.execAsync(`
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
        
        CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id);
    `);

    // 2. Update Transactions Table to Strict Ledger Schema
    const result = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    const columns = result.map(c => c.name);

    // If we haven't fully migrated to the strict schema yet
    if (!columns.includes('balance_after') || !columns.includes('linked_debt_id')) {
        console.log('🔄 Applying Strict Ledger Schema to Transactions...');

        // Add columns if they don't exist (Idempotent-ish check)
        const columnsToAdd = [
            { name: 'uuid', def: 'TEXT' },
            { name: 'user_id', def: "TEXT DEFAULT 'local_user'" },
            { name: 'account_id', def: 'TEXT REFERENCES accounts(id)' },
            { name: 'category_id', def: 'TEXT' }, // Category reference
            { name: 'transactionKind', def: "TEXT CHECK (transactionKind IN ('EXPENSE', 'INCOME', 'TRANSFER', 'DEBT_PRINCIPAL', 'DEBT_REPAYMENT', 'SAVINGS_TRANSFER'))" },
            { name: 'reference_id', def: 'TEXT' },
            { name: 'balance_after', def: 'REAL' },
            { name: 'is_deleted', def: 'INTEGER DEFAULT 0' },
            { name: 'deleted_at', def: 'TEXT' },
            { name: 'created_at', def: 'TEXT' },
            { name: 'updated_at', def: 'TEXT' },
            { name: 'linked_debt_id', def: 'TEXT' }, // FK to debts
            { name: 'linked_goal_id', def: 'TEXT' }
        ];

        for (const col of columnsToAdd) {
            if (!columns.includes(col.name)) {
                try {
                    await database.execAsync(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.def}`);
                } catch (e) {
                    console.log(`Note: Column ${col.name} might already exist or error adding:`, e);
                }
            }
        }

        // Create Indexes
        await database.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_tx_account_id ON transactions(account_id);
            CREATE INDEX IF NOT EXISTS idx_tx_created_at ON transactions(created_at);
            CREATE INDEX IF NOT EXISTS idx_tx_uuid ON transactions(uuid);
            CREATE INDEX IF NOT EXISTS idx_tx_reference_id ON transactions(reference_id);
            CREATE INDEX IF NOT EXISTS idx_tx_linked_debt ON transactions(linked_debt_id);
        `);


        await backfillTransactionData(database);
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

    // Verify
    const verify = await database.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [mpesaId]);
    if (verify) {
        console.log(`✅ Default Account Verified: ${verify.id}`);
    } else {
        console.error(`❌ CRITICAL: Default Account ${mpesaId} FAILED to seed!`);
    }
};

const backfillTransactionData = async (database: SQLite.SQLiteDatabase) => {
    const mpesaId = 'ACC-MPESA-DEFAULT';

    console.log('📦 Backfilling Transaction Data...');

    // 1. Ensure UUIDs
    // 2. Ensure Account IDs (Default to MPESA)
    // 3. Ensure User IDs
    // 4. Map Types to TransactionKind

    await database.execAsync(`
        UPDATE transactions 
        SET 
            uuid = id,
            user_id = 'local_user',
            account_id = '${mpesaId}',
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

    console.log('✅ Backfill Complete.');
};
