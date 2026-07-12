import { generateUUID } from '../utils/uuid';
import { getDb, initDatabase, notifyListeners } from './core/db';
import { getTransactions } from './database';
import { ledgerService } from './ledgerService';

export type IncomeFrequency = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'IRREGULAR';

export interface IncomeSource {
    id: string;
    userId: string;
    name: string;
    categoryId?: number;
    accountId?: string;
    isRecurring: boolean;
    expectedAmount?: number;
    frequency: IncomeFrequency;
    scheduledDate?: string;
    smsSenderId?: string;
    color?: string;
    status: 'ACTIVE' | 'INACTIVE';
    lastReceived?: string;
    createdAt: string;
    updatedAt: string;
}

export interface IncomeLog {
    id: string;
    sourceId: string;
    transactionId?: string;
    amount: number;
    receivedAt: string;
    notes?: string;
    isScheduled: boolean;
    createdAt: string;
}

export interface DetectedIncomePattern {
    name: string;
    averageAmount: number;
    occurrences: number;
    lastSeen: string;
    suggestedFrequency: IncomeFrequency;
    transactionIds: string[];
}

export type CreateIncomeSourceDTO = Omit<IncomeSource, 'id' | 'userId' | 'status' | 'lastReceived' | 'createdAt' | 'updatedAt'> & {
    initialAmount?: number;
    initialDate?: string;
};

export const incomeService = {
    // ─── Sources ────────────────────────────────────────────────────────────

    async getSources(userId: string = 'local_user'): Promise<IncomeSource[]> {
        await initDatabase();
        const db = getDb();
        const rows = await db.getAllAsync<any>(
            'SELECT * FROM income_sources WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows.map(this.mapDbToSource);
    },

    async getSourceById(id: string): Promise<IncomeSource | null> {
        await initDatabase();
        const db = getDb();
        const row = await db.getFirstAsync<any>('SELECT * FROM income_sources WHERE id = ?', [id]);
        return row ? this.mapDbToSource(row) : null;
    },

    async createSource(data: CreateIncomeSourceDTO, userId: string = 'local_user'): Promise<IncomeSource> {
        await initDatabase();
        const db = getDb();
        const id = generateUUID();
        const now = new Date().toISOString();
        const normalizedFrequency: IncomeFrequency = data.isRecurring ? data.frequency : 'IRREGULAR';
        const normalizedExpectedAmount = data.isRecurring ? (data.expectedAmount ?? null) : null;

        await db.runAsync(`
            INSERT INTO income_sources(id, user_id, name, category_id, account_id, is_recurring, expected_amount, frequency, scheduled_date, color, status, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `, [
            id, userId, data.name, data.categoryId ?? null, data.accountId ?? null,
            data.isRecurring ? 1 : 0,
            normalizedExpectedAmount,
            normalizedFrequency,
            data.scheduledDate ?? now,
            data.color ?? null,
            now, now
        ]);

        const source = (await this.getSourceById(id))!;

        if (source.isRecurring && source.expectedAmount && source.scheduledDate) {
            await this.populateScheduledIncome(source);
        }

        // Handle initial backdated log if provided
        if (data.initialAmount && data.initialAmount > 0) {
            const logDate = data.initialDate || now;
            await this.logIncome(id, data.initialAmount, logDate, undefined, 'Initial backdated amount');
        }

        notifyListeners('INCOME_SOURCES');

        return source;
    },

    async updateSource(id: string, updates: Partial<CreateIncomeSourceDTO & { status: IncomeSource['status'] }>): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();
        const setClauses: string[] = [];
        const values: any[] = [];
        const effectiveRecurring = updates.isRecurring !== undefined ? updates.isRecurring : undefined;
        const normalizedFrequency = effectiveRecurring === false ? 'IRREGULAR' : updates.frequency;
        const normalizedExpectedAmount = effectiveRecurring === false ? null : updates.expectedAmount;

        if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
        if (normalizedExpectedAmount !== undefined) { setClauses.push('expected_amount = ?'); values.push(normalizedExpectedAmount); }
        if (normalizedFrequency !== undefined) { setClauses.push('frequency = ?'); values.push(normalizedFrequency); }
        if (updates.color !== undefined) { setClauses.push('color = ?'); values.push(updates.color); }
        if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
        if (updates.isRecurring !== undefined) { setClauses.push('is_recurring = ?'); values.push(updates.isRecurring ? 1 : 0); }
        if (updates.categoryId !== undefined) { setClauses.push('category_id = ?'); values.push(updates.categoryId); }
        if (updates.accountId !== undefined) { setClauses.push('account_id = ?'); values.push(updates.accountId); }
        if (updates.scheduledDate !== undefined) { setClauses.push('scheduled_date = ?'); values.push(updates.scheduledDate); }

        if (setClauses.length === 0) return;

        setClauses.push('updated_at = ?');
        values.push(now, id);

        await db.runAsync(`UPDATE income_sources SET ${setClauses.join(', ')} WHERE id = ?`, values);
        notifyListeners('INCOME_SOURCES');
    },

    async deleteSource(id: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        await db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM income_logs WHERE source_id = ?', [id]);
            await db.runAsync('DELETE FROM income_sources WHERE id = ?', [id]);
        });
        notifyListeners('INCOME_LOGS');
        notifyListeners('INCOME_SOURCES');
    },

    // ─── Logs ───────────────────────────────────────────────────────────────

    async getLogs(sourceId?: string): Promise<IncomeLog[]> {
        await initDatabase();
        const db = getDb();
        const query = sourceId
            ? `SELECT l.*
               FROM income_logs l
               INNER JOIN income_sources s ON s.id = l.source_id
               WHERE l.source_id = ?
               AND COALESCE(l.notes, '') NOT LIKE 'Initial backdated amount%'
               ORDER BY l.received_at DESC`
            : `SELECT l.*
               FROM income_logs l
               INNER JOIN income_sources s ON s.id = l.source_id
               WHERE COALESCE(l.notes, '') NOT LIKE 'Initial backdated amount%'
               ORDER BY l.received_at DESC`;
        const rows = await db.getAllAsync<any>(query, sourceId ? [sourceId] : []);
        return rows.map(this.mapDbToLog);
    },

    async logIncome(sourceId: string, amount: number, receivedAt: string, transactionId?: string, notes?: string, isScheduled = false): Promise<IncomeLog> {
        await initDatabase();
        const db = getDb();
        const id = generateUUID();
        const now = new Date().toISOString();

        await db.runAsync(`
            INSERT INTO income_logs(id, source_id, transaction_id, amount, received_at, notes, is_scheduled, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, sourceId, transactionId ?? null, amount, receivedAt, notes ?? null, isScheduled ? 1 : 0, now]);

        // A scheduled entry is only a forecast; it must not make the source look paid.
        if (!isScheduled) {
            await db.runAsync(`
                UPDATE income_sources SET last_received = ?, updated_at = ? WHERE id = ?
            `, [receivedAt, now, sourceId]);
        }

        notifyListeners('INCOME_LOGS');

        const row = await db.getFirstAsync<any>('SELECT * FROM income_logs WHERE id = ?', [id]);
        return this.mapDbToLog(row!);
    },

    async linkTransactionToSource(sourceId: string, transactionId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        // Verify transaction is income
        const tx = await db.getFirstAsync<any>('SELECT * FROM transactions WHERE id = ?', [transactionId]);
        if (!tx) throw new Error('Transaction not found');
        if (tx.type !== 'RECEIVED') throw new Error('Only income transactions can be linked to an income source');

        // Check if already logged
        const existing = await db.getFirstAsync<any>(
            'SELECT id FROM income_logs WHERE transaction_id = ?', [transactionId]
        );
        if (existing) throw new Error('Transaction is already linked to an income source');

        const receivedAt = tx.date ?? new Date().toISOString();
        await this.confirmScheduledOrLog(sourceId, tx.amount, receivedAt, transactionId);
        if (tx.recipient_id) {
            await db.runAsync(
                'UPDATE income_sources SET sms_sender_id = ?, updated_at = ? WHERE id = ?',
                [tx.recipient_id, new Date().toISOString(), sourceId]
            );
            notifyListeners('INCOME_SOURCES');
        }
        notifyListeners('INCOME_LOGS');
    },

    /** Links an incoming SMS when its sender was previously taught to an income source. */
    async autoLinkTransaction(transaction: { id: string; type: string; amount: number; date: Date; recipientId?: string }): Promise<boolean> {
        if (transaction.type !== 'RECEIVED' || !transaction.recipientId) return false;
        await initDatabase();
        const db = getDb();
        const source = await db.getFirstAsync<{ id: string }>(
            "SELECT id FROM income_sources WHERE status = 'ACTIVE' AND is_recurring = 1 AND sms_sender_id = ? LIMIT 1",
            [transaction.recipientId]
        );
        if (!source) return false;
        const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM income_logs WHERE transaction_id = ?', [transaction.id]);
        if (existing) return false;
        await this.confirmScheduledOrLog(source.id, transaction.amount, transaction.date.toISOString(), transaction.id);
        notifyListeners('INCOME_LOGS');
        notifyListeners('INCOME_SOURCES');
        return true;
    },

    /**
     * Reconciles an incoming SMS against a scheduled ledger entry. Returning true
     * means the SMS must not be saved as a second transaction.
     */
    async reconcileIncomingSms(transaction: { id: string; type: string; amount: number; date: Date; recipientId?: string; recipientName?: string; rawSms?: string; balance?: number }): Promise<boolean> {
        if (transaction.type !== 'RECEIVED' || !transaction.recipientId) return false;
        await initDatabase();
        const db = getDb();

        const alreadyReconciled = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM income_logs WHERE sms_transaction_id = ? LIMIT 1',
            [transaction.id]
        );
        if (alreadyReconciled) return true;

        const source = await db.getFirstAsync<{ id: string }>(
            "SELECT id FROM income_sources WHERE status = 'ACTIVE' AND is_recurring = 1 AND sms_sender_id = ? LIMIT 1",
            [transaction.recipientId]
        );
        if (!source) return false;

        const scheduled = await db.getFirstAsync<{ id: string; transaction_id: string; amount: number }>(
            `SELECT id, transaction_id, amount FROM income_logs
             WHERE source_id = ? AND is_scheduled = 1 AND transaction_id IS NOT NULL AND sms_transaction_id IS NULL
             ORDER BY ABS(julianday(received_at) - julianday(?)) ASC
             LIMIT 1`,
            [source.id, transaction.date.toISOString()]
        );
        if (!scheduled?.transaction_id) return false;

        const ledgerEntry = await db.getFirstAsync<{ account_id: string | null; amount: number }>(
            'SELECT account_id, amount FROM transactions WHERE id = ? AND is_deleted = 0',
            [scheduled.transaction_id]
        );
        if (!ledgerEntry?.account_id) return false;

        const scheduledTransactionId = scheduled.transaction_id;
        const accountId = ledgerEntry.account_id;
        const smsSenderId = transaction.recipientId!;
        const reportedBalance = typeof transaction.balance === 'number' && Number.isFinite(transaction.balance)
            ? transaction.balance
            : null;
        const difference = transaction.amount - ledgerEntry.amount;
        const now = new Date().toISOString();
        await db.withTransactionAsync(async () => {
            if (difference !== 0) {
                await db.runAsync(
                    'UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
                    [difference, now, accountId]
                );
            }
            await db.runAsync(
                `UPDATE transactions
                 SET amount = ?, recipient_id = ?, recipient_name = ?, date = ?, raw_sms = ?,
                     balance = COALESCE(?, balance), balance_after = COALESCE(?, balance_after), updated_at = ?
                 WHERE id = ?`,
                [
                    transaction.amount,
                    smsSenderId,
                    transaction.recipientName ?? 'Income received',
                    transaction.date.toISOString(),
                    transaction.rawSms ?? null,
                    reportedBalance,
                    reportedBalance,
                    now,
                    scheduledTransactionId
                ]
            );
            await db.runAsync(
                `UPDATE income_logs SET amount = ?, notes = 'Confirmed by SMS', sms_transaction_id = ? WHERE id = ?`,
                [transaction.amount, transaction.id, scheduled.id]
            );
            await db.runAsync(
                'UPDATE income_sources SET last_received = ?, updated_at = ? WHERE id = ?',
                [transaction.date.toISOString(), now, source.id]
            );
        });
        notifyListeners('TRANSACTIONS');
        notifyListeners('INCOME_LOGS');
        notifyListeners('INCOME_SOURCES');
        return true;
    },

    /** Creates schedule entries through today. They are plans, not ledger transactions. */
    async populateScheduledIncome(source: IncomeSource): Promise<number> {
        if (!source.isRecurring || !source.expectedAmount || !source.scheduledDate || source.frequency === 'IRREGULAR') return 0;
        await initDatabase();
        const db = getDb();
        const start = new Date(source.scheduledDate);
        if (Number.isNaN(start.getTime())) return 0;
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        let occurrence = new Date(start);
        let inserted = 0;
        while (occurrence <= today) {
            const iso = occurrence.toISOString();
            const existing = await db.getFirstAsync<{ id: string }>(
                'SELECT id FROM income_logs WHERE source_id = ? AND received_at = ? AND is_scheduled = 1',
                [source.id, iso]
            );
            if (!existing) {
                const ledgerEntry = source.accountId
                    ? await ledgerService.recordTransaction({
                        accountId: source.accountId,
                        amount: source.expectedAmount,
                        type: 'RECEIVED',
                        kind: 'INCOME',
                        date: occurrence,
                        recipientName: source.name,
                        rawSms: `Scheduled income: ${source.name}`,
                        userId: source.userId,
                        categoryId: source.categoryId,
                    })
                    : undefined;
                await this.logIncome(source.id, source.expectedAmount, iso, ledgerEntry?.id, 'Scheduled income', true);
                inserted++;
            }
            occurrence = this.nextOccurrence(occurrence, source.frequency);
        }
        return inserted;
    },

    nextOccurrence(date: Date, frequency: IncomeFrequency): Date {
        const next = new Date(date);
        if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
        else if (frequency === 'BI_WEEKLY') next.setDate(next.getDate() + 14);
        else if (frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
        return next;
    },

    async confirmScheduledOrLog(sourceId: string, amount: number, receivedAt: string, transactionId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const scheduled = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM income_logs
             WHERE source_id = ? AND is_scheduled = 1 AND transaction_id IS NULL
             ORDER BY ABS(julianday(received_at) - julianday(?)) ASC
             LIMIT 1`,
            [sourceId, receivedAt]
        );
        if (scheduled) {
            await db.runAsync(
                `UPDATE income_logs
                 SET transaction_id = ?, amount = ?, notes = 'Confirmed by SMS'
                 WHERE id = ?`,
                [transactionId, amount, scheduled.id]
            );
            await db.runAsync('UPDATE income_sources SET last_received = ?, updated_at = ? WHERE id = ?', [receivedAt, new Date().toISOString(), sourceId]);
            return;
        }
        await this.logIncome(sourceId, amount, receivedAt, transactionId, 'Confirmed by SMS');
    },

    async unlinkTransaction(transactionId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            const existingLog = await db.getFirstAsync<any>(
                'SELECT id, source_id FROM income_logs WHERE transaction_id = ?',
                [transactionId]
            );

            if (!existingLog) {
                throw new Error('Linked income entry not found');
            }

            await db.runAsync('DELETE FROM income_logs WHERE id = ?', [existingLog.id]);

            const latestRemainingLog = await db.getFirstAsync<{ received_at: string }>(
                `SELECT received_at
                 FROM income_logs
                 WHERE source_id = ?
                 ORDER BY datetime(received_at) DESC
                 LIMIT 1`,
                [existingLog.source_id]
            );

            await db.runAsync(
                'UPDATE income_sources SET last_received = ?, updated_at = ? WHERE id = ?',
                [latestRemainingLog?.received_at ?? null, now, existingLog.source_id]
            );
        });

        notifyListeners('INCOME_LOGS');
        notifyListeners('INCOME_SOURCES');
    },

    async clearSourceLogs(sourceId: string): Promise<void> {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        await db.withTransactionAsync(async () => {
            await db.runAsync('DELETE FROM income_logs WHERE source_id = ?', [sourceId]);
            await db.runAsync(
                'UPDATE income_sources SET last_received = NULL, updated_at = ? WHERE id = ?',
                [now, sourceId]
            );
        });

        notifyListeners('INCOME_LOGS');
        notifyListeners('INCOME_SOURCES');
    },

    // ─── Auto-Detect ────────────────────────────────────────────────────────

    async detectRecurringIncome(): Promise<DetectedIncomePattern[]> {
        const allTx = await getTransactions();

        // Focus only on income transactions
        const incomeTx = allTx.filter(t => t.type === 'RECEIVED' && t.amount > 0);

        // Group by recipientName (sender name for income)
        const grouped: Record<string, typeof incomeTx> = {};
        for (const tx of incomeTx) {
            const key = (tx.recipientName || 'Unknown').trim().toLowerCase();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(tx);
        }

        const patterns: DetectedIncomePattern[] = [];

        for (const [, txList] of Object.entries(grouped)) {
            // Only suggest if seen at least twice
            if (txList.length < 2) continue;

            const amounts = txList.map(t => t.amount);
            const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
            const sortedDates = txList.map(t => new Date(t.date)).sort((a, b) => a.getTime() - b.getTime());

            // Calculate average interval in days
            let totalInterval = 0;
            for (let i = 1; i < sortedDates.length; i++) {
                totalInterval += (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
            }
            const avgDays = sortedDates.length > 1 ? totalInterval / (sortedDates.length - 1) : 0;

            let suggestedFrequency: IncomeFrequency = 'IRREGULAR';
            if (avgDays >= 25 && avgDays <= 35) suggestedFrequency = 'MONTHLY';
            else if (avgDays >= 12 && avgDays <= 16) suggestedFrequency = 'BI_WEEKLY';
            else if (avgDays >= 5 && avgDays <= 9) suggestedFrequency = 'WEEKLY';

            patterns.push({
                name: txList[0].recipientName || 'Unknown',
                averageAmount: Math.round(avgAmount),
                occurrences: txList.length,
                lastSeen: sortedDates[sortedDates.length - 1].toISOString(),
                suggestedFrequency,
                transactionIds: txList.map(t => t.id),
            });
        }

        // Sort by most recent
        return patterns.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    },

    // ─── Helpers ────────────────────────────────────────────────────────────

    mapDbToSource(row: any): IncomeSource {
        return {
            id: row.id,
            userId: row.user_id,
            name: row.name,
            categoryId: row.category_id,
            accountId: row.account_id,
            isRecurring: row.is_recurring === 1,
            expectedAmount: row.expected_amount,
            frequency: row.frequency,
            scheduledDate: row.scheduled_date,
            smsSenderId: row.sms_sender_id,
            color: row.color,
            status: row.status,
            lastReceived: row.last_received,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    mapDbToLog(row: any): IncomeLog {
        return {
            id: row.id,
            sourceId: row.source_id,
            transactionId: row.transaction_id,
            amount: row.amount,
            receivedAt: row.received_at,
            notes: row.notes,
            isScheduled: row.is_scheduled === 1,
            createdAt: row.created_at,
        };
    }
};
