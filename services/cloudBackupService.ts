import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, NativeEventSubscription, Platform } from 'react-native';
import { DatabaseChangeType, generateUUID, getDb, initDatabase, notifyListenersImmediate, subscribeToDatabaseChanges } from './core/db';

type BackupPrimitive = string | number | null;
type BackupRow = Record<string, BackupPrimitive>;

interface CloudBackupPayload {
    schemaVersion: number;
    exportedAt: string;
    userId: string;
    devicePlatform: string;
    tables: Record<string, BackupRow[]>;
}

interface AuthenticatedUser {
    uid: string;
    getIdToken: () => Promise<string>;
}

interface BackupSession {
    userId: string;
    getIdToken: () => Promise<string>;
    pendingTimer: ReturnType<typeof setTimeout> | null;
    unsubscribeDb: (() => void) | null;
    appStateSubscription: NativeEventSubscription | null;
    isSyncing: boolean;
    lastUploadAtMs: number;
}

const BACKUP_SCHEMA_VERSION = 1;
const MAX_RESTORE_ROWS = 50000;
const AUTO_BACKUP_DEBOUNCE_MS = 12000;
const MIN_BACKUP_INTERVAL_MS = 20000;

const BACKUP_TABLES = [
    'categories',
    'accounts',
    'recipients',
    'transactions',
    'fuliza_transactions',
    'debts',
    'debt_payments',
    'savings_goals',
    'income_sources',
    'income_logs',
    'automation_rules',
    'monthly_budgets',
    'category_budgets',
    'monthly_summaries',
    'category_trends',
    'net_worth_history',
    'user_settings',
    'processed_sms'
] as const;

const CLEAR_ORDER = [...BACKUP_TABLES].reverse();

const BUSINESS_DATA_TABLES = [
    'transactions',
    'debts',
    'debt_payments',
    'savings_goals',
    'income_sources',
    'income_logs',
    'fuliza_transactions',
    'monthly_budgets',
    'category_budgets'
] as const;

const TIMESTAMP_QUERIES = [
    'SELECT MAX(updated_at) as ts FROM accounts',
    'SELECT MAX(updated_at) as ts FROM transactions',
    'SELECT MAX(updated_at) as ts FROM debts',
    'SELECT MAX(updated_at) as ts FROM savings_goals',
    'SELECT MAX(updated_at) as ts FROM income_sources',
    'SELECT MAX(created_at) as ts FROM income_logs',
    'SELECT MAX(date) as ts FROM fuliza_transactions'
] as const;

const ALL_CHANGE_TYPES: DatabaseChangeType[] = [
    'TRANSACTIONS',
    'CATEGORIES',
    'BUDGETS',
    'SETTINGS',
    'INCOME_LOGS',
    'DEBTS',
    'SAVINGS',
    'INCOME_SOURCES'
];

let activeSession: BackupSession | null = null;

const toLocalChangeKey = (userId: string) => `aws_backup_last_local_change_at:${userId}`;

const resolveUserUrl = (template: string, userId: string): string => {
    return template.replace(/\{uid\}/g, encodeURIComponent(userId));
};

const getAwsUploadUrl = (userId: string): string | null => {
    const template = process.env.EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL;
    if (!template) return null;
    return resolveUserUrl(template, userId);
};

const getAwsDownloadUrl = (userId: string): string | null => {
    const template = process.env.EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL;
    if (!template) return null;
    return resolveUserUrl(template, userId);
};

const getAuthHeaders = (token: string): Record<string, string> => {
    return token
        ? { Authorization: `Bearer ${token}` }
        : {};
};

const parseTimestamp = (value: string | null | undefined): number => {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

const markLocalDataChanged = async (userId: string, timestampIso?: string): Promise<void> => {
    const value = timestampIso || new Date().toISOString();
    try {
        await AsyncStorage.setItem(toLocalChangeKey(userId), value);
    } catch (error) {
        console.warn('AWS backup: failed to persist local change marker', error);
    }
};

const getLocalBusinessRowCount = async (): Promise<number> => {
    await initDatabase();
    const db = getDb();
    let total = 0;

    for (const table of BUSINESS_DATA_TABLES) {
        const row = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) as total FROM ${table}`);
        total += row?.total || 0;
    }

    return total;
};

const computeLatestLocalChangeMs = async (): Promise<number> => {
    await initDatabase();
    const db = getDb();
    let latest = 0;

    for (const query of TIMESTAMP_QUERIES) {
        const row = await db.getFirstAsync<{ ts: string | null }>(query);
        const rowMs = parseTimestamp(row?.ts || null);
        if (rowMs > latest) latest = rowMs;
    }

    return latest;
};

const getLocalLastChangeMs = async (userId: string): Promise<number> => {
    try {
        const marker = await AsyncStorage.getItem(toLocalChangeKey(userId));
        if (marker) {
            const markerMs = parseTimestamp(marker);
            if (markerMs > 0) return markerMs;
        }
    } catch (error) {
        console.warn('AWS backup: failed to read local change marker', error);
    }

    const latestMs = await computeLatestLocalChangeMs();
    if (latestMs > 0) {
        await markLocalDataChanged(userId, new Date(latestMs).toISOString());
    }
    return latestMs;
};

const collectTableRows = async (table: string): Promise<BackupRow[]> => {
    const db = getDb();
    const rows = await db.getAllAsync<Record<string, BackupPrimitive>>(`SELECT * FROM ${table}`);
    return rows.map((row) => ({ ...row }));
};

const buildPayloadFromLocalDb = async (userId: string): Promise<CloudBackupPayload> => {
    await initDatabase();
    const tables: Record<string, BackupRow[]> = {};

    for (const table of BACKUP_TABLES) {
        tables[table] = await collectTableRows(table);
    }

    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        userId,
        devicePlatform: Platform.OS,
        tables
    };
};

const readPayloadFromResponse = async (response: Response): Promise<CloudBackupPayload | null> => {
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`Cloud backup download failed (${response.status})`);
    }

    const text = await response.text();
    if (!text?.trim()) return null;

    const parsed = JSON.parse(text) as unknown;
    const payloadCandidate = (parsed as { payload?: unknown; backup?: unknown })?.payload
        || (parsed as { payload?: unknown; backup?: unknown })?.backup
        || parsed;

    if (!payloadCandidate || typeof payloadCandidate !== 'object') {
        throw new Error('Cloud backup payload is malformed');
    }

    const payload = payloadCandidate as Partial<CloudBackupPayload>;
    if (!payload.tables || typeof payload.tables !== 'object') {
        throw new Error('Cloud backup payload has no table data');
    }

    return {
        schemaVersion: Number(payload.schemaVersion || BACKUP_SCHEMA_VERSION),
        exportedAt: payload.exportedAt || new Date(0).toISOString(),
        userId: payload.userId || 'local_user',
        devicePlatform: payload.devicePlatform || 'unknown',
        tables: payload.tables as Record<string, BackupRow[]>
    };
};

const validateRestorePayload = (payload: CloudBackupPayload, expectedUserId: string): void => {
    if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new Error(`Unsupported backup schema version: ${payload.schemaVersion}`);
    }
    if (payload.userId !== expectedUserId) {
        throw new Error('Backup belongs to a different user');
    }
    if (!Number.isFinite(parseTimestamp(payload.exportedAt))) {
        throw new Error('Backup has an invalid export date');
    }

    let rowCount = 0;
    for (const [table, rows] of Object.entries(payload.tables)) {
        if (!BACKUP_TABLES.includes(table as typeof BACKUP_TABLES[number]) || !Array.isArray(rows)) {
            throw new Error('Backup contains an invalid table');
        }
        rowCount += rows.length;
        if (rowCount > MAX_RESTORE_ROWS) throw new Error('Backup contains too many rows');
        if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error('Backup contains an invalid row');
        }
    }
};

const downloadCloudPayload = async (session: BackupSession): Promise<CloudBackupPayload | null> => {
    const url = getAwsDownloadUrl(session.userId);
    if (!url) return null;

    const token = await session.getIdToken();
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            ...getAuthHeaders(token)
        }
    });

    return readPayloadFromResponse(response);
};

const uploadCloudPayload = async (session: BackupSession, payload: CloudBackupPayload): Promise<void> => {
    const url = getAwsUploadUrl(session.userId);
    if (!url) return;

    const token = await session.getIdToken();
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token)
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Cloud backup upload failed (${response.status})`);
    }
};

const uploadCurrentLocalState = async (session: BackupSession, reason: 'login-seed' | 'auto' | 'flush'): Promise<string> => {
    const payload = await buildPayloadFromLocalDb(session.userId);
    await uploadCloudPayload(session, payload);
    session.lastUploadAtMs = Date.now();
    await markLocalDataChanged(session.userId, payload.exportedAt);
    console.log(`☁️ AWS backup uploaded (${reason})`);
    return payload.exportedAt;
};

const getTableColumns = async (table: string): Promise<Set<string>> => {
    const db = getDb();
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    return new Set(cols.map((col) => col.name));
};

const redactSmsFieldsForRestore = (table: string, row: BackupRow): BackupRow => {
    if (typeof row.raw_sms !== 'string') return row;
    if (table === 'fuliza_transactions') return { ...row, raw_sms: 'Imported SMS transaction' };
    if (table !== 'transactions') return row;

    const raw = row.raw_sms;
    if (raw.startsWith('Manual ') || raw.startsWith('Scheduled income:') || raw.startsWith('Internal Transfer:')) {
        return row;
    }
    return {
        ...row,
        raw_sms: /m-pesa balance\s+is/i.test(raw)
            ? 'Imported SMS transaction - M-PESA balance reported'
            : 'Imported SMS transaction'
    };
};

const restorePayloadToLocalDb = async (payload: CloudBackupPayload, expectedUserId: string): Promise<void> => {
    validateRestorePayload(payload, expectedUserId);
    await initDatabase();
    const db = getDb();

    // Preserve the current local state before the destructive transaction. The
    // restore itself is transactional, so a failed insert also rolls back.
    const snapshot = await buildPayloadFromLocalDb(expectedUserId);
    await db.runAsync(
        'INSERT INTO restore_snapshots (id, created_at, payload_json) VALUES (?, ?, ?)',
        [generateUUID(), new Date().toISOString(), JSON.stringify(snapshot)]
    );
    await db.runAsync(
        `DELETE FROM restore_snapshots
         WHERE id NOT IN (SELECT id FROM restore_snapshots ORDER BY created_at DESC LIMIT 3)`
    );

    const tableColumnsMap = new Map<string, Set<string>>();
    for (const table of BACKUP_TABLES) {
        tableColumnsMap.set(table, await getTableColumns(table));
    }

    await db.withTransactionAsync(async () => {
        for (const table of CLEAR_ORDER) {
            await db.runAsync(`DELETE FROM ${table}`);
        }

        for (const table of BACKUP_TABLES) {
            const rows = payload.tables[table];
            if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

            const validColumns = tableColumnsMap.get(table) || new Set<string>();
            for (const originalRow of rows) {
                const row = redactSmsFieldsForRestore(table, originalRow);
                const entries = Object.entries(row).filter(([key, value]) => {
                    return validColumns.has(key) && value !== undefined;
                });

                if (entries.length === 0) continue;

                const columnsSql = entries.map(([key]) => `"${key}"`).join(', ');
                const placeholdersSql = entries.map(() => '?').join(', ');
                const values = entries.map(([, value]) => value);

                await db.runAsync(
                    `INSERT INTO ${table} (${columnsSql}) VALUES (${placeholdersSql})`,
                    values
                );
            }
        }
    });
};

const notifyAllDbConsumers = (): void => {
    ALL_CHANGE_TYPES.forEach((type) => notifyListenersImmediate(type));
};

const runBackupUpload = async (reason: 'login-seed' | 'auto' | 'flush'): Promise<void> => {
    if (!activeSession) return;
    if (activeSession.isSyncing) return;

    const nowMs = Date.now();
    if (reason === 'auto' && nowMs - activeSession.lastUploadAtMs < MIN_BACKUP_INTERVAL_MS) {
        return;
    }

    activeSession.isSyncing = true;
    try {
        await uploadCurrentLocalState(activeSession, reason);
    } catch (error) {
        console.warn(`AWS backup upload failed (${reason}):`, error);
    } finally {
        if (activeSession) {
            activeSession.isSyncing = false;
        }
    }
};

const flushPendingUpload = async (): Promise<void> => {
    if (!activeSession) return;
    if (activeSession.pendingTimer) {
        clearTimeout(activeSession.pendingTimer);
        activeSession.pendingTimer = null;
    }
    await runBackupUpload('flush');
};

const scheduleBackupUpload = (): void => {
    if (!activeSession) return;
    if (activeSession.isSyncing) return;

    if (activeSession.pendingTimer) {
        clearTimeout(activeSession.pendingTimer);
    }

    activeSession.pendingTimer = setTimeout(() => {
        if (activeSession) {
            activeSession.pendingTimer = null;
        }
        void runBackupUpload('auto');
    }, AUTO_BACKUP_DEBOUNCE_MS);
};

const handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'background' || nextState === 'inactive') {
        void flushPendingUpload();
    }
};

const syncFromCloudOnLogin = async (): Promise<void> => {
    if (!activeSession) return;
    activeSession.isSyncing = true;

    try {
        const [remotePayload, localRows, localLastChangeMs] = await Promise.all([
            downloadCloudPayload(activeSession),
            getLocalBusinessRowCount(),
            getLocalLastChangeMs(activeSession.userId)
        ]);

        if (!remotePayload) {
            if (localRows > 0) {
                await uploadCurrentLocalState(activeSession, 'login-seed');
            }
            return;
        }

        validateRestorePayload(remotePayload, activeSession.userId);
        const remoteMs = parseTimestamp(remotePayload.exportedAt);

        if (localRows === 0) {
            await restorePayloadToLocalDb(remotePayload, activeSession.userId);
            await markLocalDataChanged(activeSession.userId, remotePayload.exportedAt);
            notifyAllDbConsumers();
            console.log('☁️ AWS backup restored on login');
            return;
        }

        if (localLastChangeMs > remoteMs + 1000) {
            await uploadCurrentLocalState(activeSession, 'login-seed');
        } else if (remoteMs > localLastChangeMs + 1000) {
            // Never replace non-empty local data without an explicit user action.
            console.warn('AWS backup is newer than local data; automatic restore skipped until the user confirms it.');
        }
    } catch (error) {
        console.warn('AWS backup login sync failed:', error);
    } finally {
        if (activeSession) {
            activeSession.isSyncing = false;
        }
    }
};

export const isAwsBackupConfigured = (): boolean => {
    return Boolean(process.env.EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL && process.env.EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL);
};

export const startAwsBackupSession = async (user: AuthenticatedUser): Promise<void> => {
    if (!isAwsBackupConfigured()) {
        return;
    }

    await stopAwsBackupSession();

    activeSession = {
        userId: user.uid,
        getIdToken: () => user.getIdToken(),
        pendingTimer: null,
        unsubscribeDb: null,
        appStateSubscription: null,
        isSyncing: false,
        lastUploadAtMs: 0
    };

    activeSession.unsubscribeDb = subscribeToDatabaseChanges(() => {
        if (!activeSession || activeSession.isSyncing) return;
        void markLocalDataChanged(activeSession.userId);
        scheduleBackupUpload();
    });

    activeSession.appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    await syncFromCloudOnLogin();
};

export const stopAwsBackupSession = async (): Promise<void> => {
    if (!activeSession) return;

    if (activeSession.pendingTimer) {
        clearTimeout(activeSession.pendingTimer);
        activeSession.pendingTimer = null;
    }
    activeSession.unsubscribeDb?.();
    activeSession.appStateSubscription?.remove();

    activeSession = null;
};

export const backupNowToAws = async (): Promise<void> => {
    if (!activeSession) return;
    await runBackupUpload('flush');
};
