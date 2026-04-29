import { generateUUID } from '../utils/uuid';
import { getDb, initDatabase, notifyListeners } from './core/db';
import { ledgerService } from './ledgerService';

export interface ManualRecurringTransactionTemplate {
  id: string;
  userId: string;
  accountId: string;
  type: 'SENT' | 'RECEIVED';
  amount: number;
  recipientName: string;
  rawSms: string;
  startMonth: string;
  lastGeneratedMonth: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateManualRecurringTransactionPayload {
  userId?: string;
  accountId: string;
  type: 'SENT' | 'RECEIVED';
  amount: number;
  recipientName: string;
  rawSms: string;
  createdAt?: Date;
}

interface UpdateManualRecurringTransactionPayload {
  accountId?: string;
  type?: 'SENT' | 'RECEIVED';
  amount?: number;
  recipientName?: string;
  rawSms?: string;
  isActive?: boolean;
}

export interface ManualRecurringRunInfo {
  lastAutoPostedAt: string | null;
  nextRunAt: string | null;
}

const toMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const fromMonthKeyToDate = (monthKey: string): Date | null => {
  const parts = monthKey.split('-');
  if (parts.length !== 2) return null;
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
};

const addMonths = (date: Date, months: number): Date => {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
};

const toKind = (type: 'SENT' | 'RECEIVED') => (type === 'SENT' ? 'EXPENSE' : 'INCOME');

const mapRowToTemplate = (row: any): ManualRecurringTransactionTemplate => ({
  id: row.id,
  userId: row.user_id,
  accountId: row.account_id,
  type: row.type,
  amount: Number(row.amount) || 0,
  recipientName: row.recipient_name,
  rawSms: row.raw_sms || '',
  startMonth: row.start_month,
  lastGeneratedMonth: row.last_generated_month,
  isActive: row.is_active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const manualRecurringTransactionService = {
  async getTemplates(userId: string = 'local_user'): Promise<ManualRecurringTransactionTemplate[]> {
    await initDatabase();
    const db = getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM manual_recurring_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    return rows.map(mapRowToTemplate);
  },

  async getTemplateById(id: string): Promise<ManualRecurringTransactionTemplate | null> {
    await initDatabase();
    const db = getDb();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM manual_recurring_transactions WHERE id = ? LIMIT 1',
      [id]
    );
    return row ? mapRowToTemplate(row) : null;
  },

  async createTemplate(payload: CreateManualRecurringTransactionPayload): Promise<ManualRecurringTransactionTemplate> {
    await initDatabase();
    const db = getDb();

    const now = payload.createdAt || new Date();
    const nowIso = now.toISOString();
    const monthKey = toMonthKey(now);
    const id = generateUUID();

    await db.runAsync(
      `INSERT INTO manual_recurring_transactions (
        id, user_id, account_id, type, amount, recipient_name, raw_sms,
        start_month, last_generated_month, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        payload.userId || 'local_user',
        payload.accountId,
        payload.type,
        payload.amount,
        payload.recipientName,
        payload.rawSms,
        monthKey,
        monthKey,
        nowIso,
        nowIso,
      ]
    );

    notifyListeners('TRANSACTIONS');

    return {
      id,
      userId: payload.userId || 'local_user',
      accountId: payload.accountId,
      type: payload.type,
      amount: payload.amount,
      recipientName: payload.recipientName,
      rawSms: payload.rawSms,
      startMonth: monthKey,
      lastGeneratedMonth: monthKey,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  async updateTemplate(id: string, updates: UpdateManualRecurringTransactionPayload): Promise<void> {
    await initDatabase();
    const db = getDb();
    const now = new Date().toISOString();

    const sets: string[] = [];
    const values: any[] = [];

    if (updates.accountId !== undefined) {
      sets.push('account_id = ?');
      values.push(updates.accountId);
    }
    if (updates.type !== undefined) {
      sets.push('type = ?');
      values.push(updates.type);
    }
    if (updates.amount !== undefined) {
      sets.push('amount = ?');
      values.push(Math.abs(Number(updates.amount) || 0));
    }
    if (updates.recipientName !== undefined) {
      sets.push('recipient_name = ?');
      values.push(updates.recipientName);
    }
    if (updates.rawSms !== undefined) {
      sets.push('raw_sms = ?');
      values.push(updates.rawSms);
    }
    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      values.push(updates.isActive ? 1 : 0);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    values.push(now, id);

    await db.runAsync(
      `UPDATE manual_recurring_transactions
       SET ${sets.join(', ')}
       WHERE id = ?`,
      values
    );

    notifyListeners('TRANSACTIONS');
  },

  async setTemplateActive(id: string, isActive: boolean): Promise<void> {
    return this.updateTemplate(id, { isActive });
  },

  async deleteTemplate(id: string): Promise<void> {
    await initDatabase();
    const db = getDb();
    await db.runAsync('DELETE FROM manual_recurring_transactions WHERE id = ?', [id]);
    notifyListeners('TRANSACTIONS');
  },

  async getTemplateRunInfo(template: ManualRecurringTransactionTemplate): Promise<ManualRecurringRunInfo> {
    await initDatabase();
    const db = getDb();

    const latestRun = await db.getFirstAsync<{ date: string }>(
      `SELECT date
       FROM transactions
       WHERE reference_id LIKE ?
         AND is_deleted = 0
       ORDER BY date DESC
       LIMIT 1`,
      [`MREC:${template.id}:%`]
    );

    const lastMonthDate = fromMonthKeyToDate(template.lastGeneratedMonth);
    let nextRunAt: string | null = null;
    if (template.isActive && lastMonthDate) {
      nextRunAt = addMonths(lastMonthDate, 1).toISOString();
    }

    return {
      lastAutoPostedAt: latestRun?.date || null,
      nextRunAt,
    };
  },

  async runDueMonthlyTransactions(referenceDate: Date = new Date()): Promise<number> {
    await initDatabase();
    const db = getDb();

    const nowIso = new Date().toISOString();
    const currentMonthKey = toMonthKey(referenceDate);

    const templates = await db.getAllAsync<any>(
      `SELECT * FROM manual_recurring_transactions
       WHERE is_active = 1`
    );

    let createdCount = 0;

    for (const template of templates) {
      const lastMonthDate = fromMonthKeyToDate(template.last_generated_month);
      if (!lastMonthDate) continue;

      let nextMonthDate = addMonths(lastMonthDate, 1);

      while (toMonthKey(nextMonthDate) <= currentMonthKey) {
        const monthKey = toMonthKey(nextMonthDate);
        const recurringRef = `MREC:${template.id}:${monthKey}`;

        const existing = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM transactions WHERE reference_id = ?',
          [recurringRef]
        );

        if (!existing || existing.count === 0) {
          await ledgerService.recordTransaction({
            accountId: template.account_id,
            amount: Math.abs(Number(template.amount) || 0),
            type: template.type,
            kind: toKind(template.type),
            date: new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), 1, 0, 0, 0, 0),
            recipientName: template.recipient_name,
            rawSms: `${template.raw_sms} (Auto recurring)`,
            userId: template.user_id || 'local_user',
            referenceId: recurringRef,
          });
          createdCount += 1;
        }

        await db.runAsync(
          `UPDATE manual_recurring_transactions
           SET last_generated_month = ?, updated_at = ?
           WHERE id = ?`,
          [monthKey, nowIso, template.id]
        );

        nextMonthDate = addMonths(nextMonthDate, 1);
      }
    }

    if (createdCount > 0) {
      notifyListeners('TRANSACTIONS');
    }

    return createdCount;
  },
};
