import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('fanga.db');

export interface Transaction {
    id: number;
    message_id: string; // Unique ID from SMS if available, or generated
    amount: number;
    type: 'SEND' | 'RECEIVE' | 'PAYBILL' | 'BUYGOODS' | 'WITHDRAW' | 'DEPOSIT' | 'FULIZA' | 'UNKNOWN';
    recipient: string; // Person or Business
    date: string; // ISO string
    body: string; // Full SMS body
    category: string;
}

export const initDatabase = () => {
    try {
        db.execSync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        amount REAL,
        type TEXT,
        recipient TEXT,
        date TEXT,
        body TEXT,
        category TEXT
      );
    `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

export const addTransaction = (transaction: Omit<Transaction, 'id'>) => {
    try {
        const { message_id, amount, type, recipient, date, body, category } = transaction;
        db.runSync(
            `INSERT OR IGNORE INTO transactions (message_id, amount, type, recipient, date, body, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [message_id, amount, type, recipient, date, body, category]
        );
    } catch (error) {
        console.error('Error adding transaction:', error);
    }
};

export const getTransactions = (): Transaction[] => {
    try {
        return db.getAllSync('SELECT * FROM transactions ORDER BY date DESC');
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
};

export const getBalance = (): number => {
    // This is a calculated balance based on transactions. 
    // In a real app, we might parse the "New M-PESA balance is..." from the SMS.
    // For now, let's just sum up (Income - Expense).
    // However, M-PESA SMS usually contains the balance. 
    // We should probably store the "balance_after" in the DB if we want to be accurate.
    // For this MVP, let's just return a mock or calculated value.
    // Let's try to sum it up for now.
    try {
        const transactions = getTransactions();
        let balance = 0;
        // This is very rough and assumes we start at 0. 
        // Better approach: Parse balance from latest SMS.
        // But for now:
        transactions.forEach(t => {
            if (['RECEIVE', 'DEPOSIT'].includes(t.type)) {
                balance += t.amount;
            } else {
                balance -= t.amount;
            }
        });
        return balance;
    } catch (error) {
        return 0;
    }
}

export const clearDatabase = () => {
    try {
        db.execSync('DELETE FROM transactions');
    } catch (error) {
        console.error('Error clearing database:', error);
    }
}
