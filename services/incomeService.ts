import { generateUUID } from '../utils/uuid';
import { getDb, initDatabase, notifyListeners } from './core/db';
import { getTransactions } from './database';

export type IncomeFrequency = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'IRREGULAR';

export interface IncomeSource {
    id: string;
    userId: string;
    name: string;
    categoryId?: number;
    isRecurring: boolean;
    expectedAmount?: number;
    frequency: IncomeFrequency;
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
            INSERT INTO income_sources(id, user_id, name, category_id, is_recurring, expected_amount, frequency, color, status, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `, [
            id, userId, data.name, data.categoryId ?? null,
            data.isRecurring ? 1 : 0,
            normalizedExpectedAmount,
            normalizedFrequency,
            data.color ?? null,
            now, now
        ]);

        const source = (await this.getSourceById(id))!;

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

    async logIncome(sourceId: string, amount: number, receivedAt: string, transactionId?: string, notes?: string): Promise<IncomeLog> {
        await initDatabase();
        const db = getDb();
        const id = generateUUID();
        const now = new Date().toISOString();

        await db.runAsync(`
            INSERT INTO income_logs(id, source_id, transaction_id, amount, received_at, notes, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
        `, [id, sourceId, transactionId ?? null, amount, receivedAt, notes ?? null, now]);

        // Update last_received on the source
        await db.runAsync(`
            UPDATE income_sources SET last_received = ?, updated_at = ? WHERE id = ?
        `, [receivedAt, now, sourceId]);

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
        await this.logIncome(sourceId, tx.amount, receivedAt, transactionId);
        notifyListeners('INCOME_LOGS');
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
            isRecurring: row.is_recurring === 1,
            expectedAmount: row.expected_amount,
            frequency: row.frequency,
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
            createdAt: row.created_at,
        };
    }
};
