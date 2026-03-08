import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getDb, initDatabase } from './core/db';
import { getCategories, getTransactions } from './database';
import { debtService } from './debtService';
import { incomeService } from './incomeService';
import { insightsService } from './insightsService';
import { savingsService } from './savingsService';

type SheetCell = string | number | boolean | Date | null | undefined;
type Sheet = {
    name: string;
    rows: SheetCell[][];
};

const excelEscape = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const sanitizeSheetName = (name: string): string => {
    const cleaned = name.replace(/[\\/:?*\[\]]/g, ' ').trim();
    return cleaned.slice(0, 31) || 'Sheet';
};

const cellToXml = (value: SheetCell): string => {
    if (value === null || value === undefined) {
        return '<Cell><Data ss:Type="String"></Data></Cell>';
    }

    if (value instanceof Date) {
        return `<Cell><Data ss:Type="DateTime">${excelEscape(value.toISOString())}</Data></Cell>`;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
    }

    if (typeof value === 'boolean') {
        return `<Cell><Data ss:Type="String">${value ? 'Yes' : 'No'}</Data></Cell>`;
    }

    return `<Cell><Data ss:Type="String">${excelEscape(String(value))}</Data></Cell>`;
};

const rowToXml = (row: SheetCell[]): string => {
    const cells = row.map(cellToXml).join('');
    return `<Row>${cells}</Row>`;
};

const workbookToXml = (sheets: Sheet[]): string => {
    const sheetXml = sheets
        .map((sheet) => {
            const rowsXml = sheet.rows.map(rowToXml).join('');
            return `<Worksheet ss:Name="${excelEscape(sanitizeSheetName(sheet.name))}"><Table>${rowsXml}</Table></Worksheet>`;
        })
        .join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheetXml}
</Workbook>`;
};

const toIso = (value: Date | string | null | undefined): string =>
    value ? new Date(value).toISOString() : '';

const csvEscape = (value: SheetCell): string => {
    if (value === null || value === undefined) return '';
    const raw = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
};

const sheetsToCsv = (sheets: Sheet[]): string => {
    return sheets
        .map((sheet) => {
            const header = `### ${sheet.name}`;
            const rows = sheet.rows.map((row) => row.map(csvEscape).join(',')).join('\n');
            return `${header}\n${rows}`;
        })
        .join('\n\n');
};

const saveExportToDevice = async (
    content: string,
    fileBaseName: string,
    extension: 'csv' | 'xls',
    mimeType: string
): Promise<string> => {
    if (!FileSystem.documentDirectory) {
        throw new Error('Document directory is not available on this device.');
    }

    const tempUri = `${FileSystem.documentDirectory}${fileBaseName}.${extension}`;
    await FileSystem.writeAsStringAsync(tempUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    // Android: write to user-selected folder (typically Downloads) for true device download.
    if (Platform.OS === 'android') {
        const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
        if (!permissions.granted) {
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
            throw new Error('Download cancelled. Please allow folder access to save the export file.');
        }
        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            `${fileBaseName}.${extension}`,
            mimeType
        );
        const base64Content = await FileSystem.readAsStringAsync(tempUri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, base64Content, {
            encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        return targetUri;
    }

    return tempUri;
};

const buildExportSheets = async (): Promise<{ sheets: Sheet[]; generatedAt: Date }> => {
    await initDatabase();
    const db = getDb();

    const transactions = await getTransactions();
    const [categories, debts, savingsGoals, incomeSources, incomeLogs] = await Promise.all([
        getCategories(),
        debtService.getDebts('local_user'),
        savingsService.getGoals('local_user'),
        incomeService.getSources('local_user'),
        incomeService.getLogs(),
    ]);

    const [keyMetrics, categoryTrends, monthlySummaries, netWorthHistory] = await Promise.all([
        insightsService.getKeyMetrics('local_user', transactions),
        insightsService.getCategoryTrends(transactions),
        insightsService.getMonthlySummaries(24),
        insightsService.getNetWorthHistory(365),
    ]);

    const accounts = await db.getAllAsync<any>(
        'SELECT id, name, type, balance, currency, is_active, created_at, updated_at FROM accounts ORDER BY name ASC'
    );
    const automationRules = await db.getAllAsync<any>(
        'SELECT id, name, type, conditions, action, is_enabled FROM automation_rules ORDER BY id ASC'
    );
    const userSettings = await db.getAllAsync<any>(
        'SELECT key, value FROM user_settings ORDER BY key ASC'
    );
    const budgets = await db.getAllAsync<any>(
        'SELECT month, total_income FROM monthly_budgets ORDER BY month DESC'
    );
    const categoryBudgets = await db.getAllAsync<any>(`
        SELECT cb.month, cb.category_id, c.name AS category_name, c.type AS category_type, cb.budget_amount
        FROM category_budgets cb
        LEFT JOIN categories c ON c.id = cb.category_id
        ORDER BY cb.month DESC, c.name ASC
    `);
    const debtPayments = await db.getAllAsync<any>(`
        SELECT dp.id, dp.debt_id, dp.transaction_id, dp.amount, dp.date, dp.created_at, d.name AS debt_name
        FROM debt_payments dp
        LEFT JOIN debts d ON d.id = dp.debt_id
        ORDER BY dp.date DESC
    `);

    const generatedAt = new Date();
    const sheets: Sheet[] = [
        {
            name: 'Overview',
            rows: [
                ['Generated At', generatedAt.toISOString()],
                ['Export Type', 'Full Financial Spreadsheet'],
                ['Note', 'Use Chart_* sheets to build charts in Excel/Sheets.'],
                [],
                ['Total Transactions', transactions.length],
                ['Total Categories', categories.length],
                ['Total Debts', debts.length],
                ['Total Savings Goals', savingsGoals.length],
                ['Total Income Sources', incomeSources.length],
                ['Total Income Logs', incomeLogs.length],
                [],
                ['This Month Income', keyMetrics.thisMonthIncome],
                ['This Month Expenses', keyMetrics.thisMonthExpenses],
                ['Last Month Income', keyMetrics.lastMonthIncome],
                ['Last Month Expenses', keyMetrics.lastMonthExpenses],
                ['Savings Rate %', keyMetrics.savingsRate],
                ['Debt-To-Income %', keyMetrics.debtToIncomeRatio],
                ['Spending Velocity (KES/day)', keyMetrics.spendingVelocity],
                ['Last Month Velocity (KES/day)', keyMetrics.lastMonthVelocity],
                ['Total Saved', keyMetrics.totalSaved],
                ['Total Savings Target', keyMetrics.totalSavingsTarget],
                ['Savings Progress %', keyMetrics.savingsProgress],
                ['Total Assets', keyMetrics.totalAssets],
                ['Total Liabilities', keyMetrics.totalLiabilities],
                ['Net Worth', keyMetrics.netWorth],
                ['Top Category', keyMetrics.topCategory?.name || ''],
                ['Top Category Amount', keyMetrics.topCategory?.amount || 0],
            ],
        },
        {
            name: 'Transactions',
            rows: [
                [
                    'ID',
                    'Date',
                    'Type',
                    'Kind',
                    'Amount',
                    'Cost',
                    'Account',
                    'Account Type',
                    'Category',
                    'Category ID',
                    'Recipient',
                    'Linked Debt ID',
                    'Linked Goal ID',
                    'Reference ID',
                    'Raw SMS',
                ],
                ...transactions.map((tx) => [
                    tx.id,
                    tx.date.toISOString(),
                    tx.type,
                    tx.transactionKind,
                    tx.amount,
                    tx.transactionCost || 0,
                    tx.accountName || '',
                    tx.accountType || '',
                    tx.categoryName || '',
                    tx.categoryId || '',
                    tx.recipientName || '',
                    tx.linkedDebtId || '',
                    tx.linkedGoalId || '',
                    tx.referenceId || '',
                    tx.rawSms || '',
                ]),
            ],
        },
        {
            name: 'Categories',
            rows: [
                ['ID', 'Name', 'Type', 'Icon', 'Color', 'Custom', 'Description'],
                ...categories.map((cat) => [
                    cat.id,
                    cat.name,
                    cat.type,
                    cat.icon,
                    cat.color,
                    cat.isCustom ? 'Yes' : 'No',
                    cat.description || '',
                ]),
            ],
        },
        {
            name: 'Accounts',
            rows: [
                ['ID', 'Name', 'Type', 'Balance', 'Currency', 'Active', 'Created At', 'Updated At'],
                ...accounts.map((acc: any) => [
                    acc.id,
                    acc.name,
                    acc.type,
                    acc.balance || 0,
                    acc.currency || 'KES',
                    acc.is_active === 1 ? 'Yes' : 'No',
                    toIso(acc.created_at),
                    toIso(acc.updated_at),
                ]),
            ],
        },
        {
            name: 'Debts',
            rows: [
                ['ID', 'Name', 'Type', 'Status', 'Principal', 'Current Balance', 'Interest Rate', 'Start Date', 'Due Date', 'Account ID'],
                ...debts.map((debt) => [
                    debt.id,
                    debt.name,
                    debt.type,
                    debt.status,
                    debt.principalAmount,
                    debt.currentBalance,
                    debt.interestRate || 0,
                    toIso(debt.startDate),
                    toIso(debt.dueDate),
                    debt.accountId || '',
                ]),
            ],
        },
        {
            name: 'Debt Payments',
            rows: [
                ['Payment ID', 'Debt ID', 'Debt Name', 'Transaction ID', 'Amount', 'Date', 'Created At'],
                ...debtPayments.map((p: any) => [
                    p.id,
                    p.debt_id,
                    p.debt_name || '',
                    p.transaction_id,
                    p.amount || 0,
                    toIso(p.date),
                    toIso(p.created_at),
                ]),
            ],
        },
        {
            name: 'Savings Goals',
            rows: [
                ['ID', 'Name', 'Status', 'Target Amount', 'Current Amount', 'Target Date', 'Color', 'Created At', 'Updated At'],
                ...savingsGoals.map((goal) => [
                    goal.id,
                    goal.name,
                    goal.status,
                    goal.targetAmount,
                    goal.currentAmount,
                    toIso(goal.targetDate),
                    goal.color || '',
                    toIso(goal.createdAt),
                    toIso(goal.updatedAt),
                ]),
            ],
        },
        {
            name: 'Income Sources',
            rows: [
                ['ID', 'Name', 'Status', 'Recurring', 'Frequency', 'Expected Amount', 'Last Received', 'Category ID', 'Color'],
                ...incomeSources.map((src) => [
                    src.id,
                    src.name,
                    src.status,
                    src.isRecurring ? 'Yes' : 'No',
                    src.frequency,
                    src.expectedAmount || 0,
                    toIso(src.lastReceived),
                    src.categoryId || '',
                    src.color || '',
                ]),
            ],
        },
        {
            name: 'Income Logs',
            rows: [
                ['ID', 'Source ID', 'Transaction ID', 'Amount', 'Received At', 'Notes', 'Created At'],
                ...incomeLogs.map((log) => [
                    log.id,
                    log.sourceId,
                    log.transactionId || '',
                    log.amount,
                    toIso(log.receivedAt),
                    log.notes || '',
                    toIso(log.createdAt),
                ]),
            ],
        },
        {
            name: 'Monthly Budgets',
            rows: [
                ['Month', 'Total Income'],
                ...budgets.map((b: any) => [b.month, b.total_income || 0]),
            ],
        },
        {
            name: 'Category Budgets',
            rows: [
                ['Month', 'Category ID', 'Category Name', 'Category Type', 'Budget Amount'],
                ...categoryBudgets.map((b: any) => [
                    b.month,
                    b.category_id,
                    b.category_name || '',
                    b.category_type || '',
                    b.budget_amount || 0,
                ]),
            ],
        },
        {
            name: 'Automation Rules',
            rows: [
                ['ID', 'Name', 'Type', 'Enabled', 'Conditions', 'Action'],
                ...automationRules.map((rule: any) => [
                    rule.id,
                    rule.name,
                    rule.type,
                    rule.is_enabled === 1 ? 'Yes' : 'No',
                    rule.conditions,
                    rule.action,
                ]),
            ],
        },
        {
            name: 'Settings',
            rows: [
                ['Key', 'Value'],
                ...userSettings.map((setting: any) => [setting.key, setting.value]),
            ],
        },
        {
            name: 'Chart_CategoryTrends',
            rows: [
                ['Category', 'This Month', 'Last Month', 'Trend', 'Percent Of Expenses'],
                ...categoryTrends.map((trend) => [
                    trend.categoryName,
                    trend.thisMonth,
                    trend.lastMonth,
                    trend.trend,
                    trend.percentOfExpenses,
                ]),
            ],
        },
        {
            name: 'Chart_MonthlySummary',
            rows: [
                ['Month', 'Total Income', 'Total Expenses', 'Total Savings', 'Net Worth Snapshot'],
                ...monthlySummaries.map((m) => [
                    m.month,
                    m.totalIncome,
                    m.totalExpenses,
                    m.totalSavings,
                    m.netWorthSnapshot,
                ]),
            ],
        },
        {
            name: 'Chart_NetWorth',
            rows: [
                ['Date', 'Net Worth'],
                ...netWorthHistory.map((n) => [n.date, n.netWorth]),
            ],
        },
    ];

    return { sheets, generatedAt };
};

export const exportFinancialSpreadsheet = async (): Promise<string> => {
    const { sheets, generatedAt } = await buildExportSheets();
    const workbookXml = workbookToXml(sheets);
    const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    return saveExportToDevice(
        workbookXml,
        `budget-export-${stamp}`,
        'xls',
        'application/vnd.ms-excel'
    );
};

export const exportFinancialCsv = async (): Promise<string> => {
    const { sheets, generatedAt } = await buildExportSheets();
    const csvContent = sheetsToCsv(sheets);
    const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    return saveExportToDevice(
        csvContent,
        `budget-export-${stamp}`,
        'csv',
        'text/csv'
    );
};
