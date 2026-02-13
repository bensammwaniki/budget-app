
const { initDatabase: initCoreDatabase, getDb } = require('./services/core/db.ts'); // .ts for ts-node or similar, but here we run with node so we need to transpile or use ts-node. Wait, simple node won't run .ts. I need to run this in the app context or use ts-node. 
// Actually, simple solution: I cannot run TS files directly with node. 
// I will create a small route in the app to trigger debug, OR just trust my analysis.
// The previous error was MODULE_NOT_FOUND. 


async function debug() {
    try {
        console.log('🔌 Connecting to Core DB...');
        await initCoreDatabase();
        const db = getDb();

        console.log('🔍 Checking ACCOUNTS table...');
        const accounts = await db.getAllAsync("SELECT * FROM accounts WHERE id = 'ACC-MPESA-DEFAULT'");
        console.log('Default Account:', JSON.stringify(accounts, null, 2));

        if (accounts.length === 0) {
            console.log('⚠️ ACC-MPESA-DEFAULT is MISSING! Attempting to fix...');
            const now = new Date().toISOString();
            await db.runAsync(`
                INSERT INTO accounts (id, user_id, name, type, balance, currency, isActive, created_at, updated_at)
                VALUES (?, 'local_user', 'M-PESA', 'M-PESA', 0, 'KES', 1, ?, ?)
            `, ['ACC-MPESA-DEFAULT', now, now]);
            console.log('✅ Created ACC-MPESA-DEFAULT manually.');
        }

        console.log('🔍 Checking CATEGORIES table...');
        const categories = await db.getAllAsync("SELECT * FROM categories WHERE name = 'Fuliza Charges'");
        console.log('Fuliza Category:', JSON.stringify(categories, null, 2));

        if (categories.length === 0) {
            console.error('❌ Fuliza Charges category is MISSING!');
        } else {
            const catId = categories[0].id;
            console.log(`✅ Fuliza Category ID: ${catId}`);

            // Test Insert
            const testUuid = `DEBUG-TEST-${Date.now()}`;
            console.log('🧪 Attempting INSERT of test transaction...');
            try {
                await db.runAsync(`
                    INSERT INTO transactions (
                        id, uuid, user_id, account_id, categoryId,
                        amount, type, transactionKind,
                        recipientName, rawSms,
                        date, balance, balance_after,
                        created_at, updated_at, is_deleted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 `, [
                    testUuid, testUuid, 'local_user', 'ACC-MPESA-DEFAULT', catId,
                    10, 'SENT', 'EXPENSE',
                    'DEBUG RECIPIENT', 'DEBUG SMS',
                    new Date().toISOString(), 0, 0,
                    new Date().toISOString(), new Date().toISOString(), 0
                ]);
                console.log('✅ Test INSERT SUCCESS!');
            } catch (insertError) {
                console.error('❌ Test INSERT FAILED:', insertError);
            }
        }

    } catch (e) {
        console.error('Debug Error:', e);
    }
}

debug();
