import { generateUUID } from '../utils/uuid';
import { getDb } from './core/db';
import { getTransactions } from './database';
import { debtService } from './debtService';
import { savingsService } from './savingsService';

export interface KeyMetrics {
    // Income & Expenses
    thisMonthIncome: number;
    thisMonthExpenses: number;
    lastMonthIncome: number;
    lastMonthExpenses: number;

    // Key Ratios
    savingsRate: number;           // (income - expenses) / income * 100
    debtToIncomeRatio: number;     // totalDebt / monthlyIncome * 100
    spendingVelocity: number;      // avg KES/day this month
    lastMonthVelocity: number;     // avg KES/day last month

    // Goals
    totalSaved: number;
    totalSavingsTarget: number;
    savingsProgress: number;       // % of total target achieved

    // Top spending category this month
    topCategory: { name: string; amount: number; icon?: string; color?: string } | null;

    // Net worth
    totalAssets: number;           // current account balances + savings
    totalLiabilities: number;      // outstanding debt
    netWorth: number;
}

export interface CategoryTrend {
    categoryName: string;
    categoryColor?: string;
    categoryIcon?: string;
    thisMonth: number;
    lastMonth: number;
    percentOfExpenses: number;
    trend: number; // positive = up, negative = down
}

export interface MonthlySummary {
    month: string;
    totalIncome: number;
    totalExpenses: number;
    totalSavings: number;
    netWorthSnapshot: number;
}

export const insightsService = {

    async getKeyMetrics(userId: string = 'local_user', providedTx?: any[]): Promise<KeyMetrics> {
        const db = getDb();
        const now = new Date();

        const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const startOfLastMonth = lastMonthDate.toISOString();
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

        const allTx = providedTx || await getTransactions();

        // --- Income & Expenses ---
        const thisMonthTx = allTx.filter(t => new Date(t.date) >= new Date(startOfThisMonth));
        const lastMonthTx = allTx.filter(t => {
            const d = new Date(t.date);
            return d >= new Date(startOfLastMonth) && d <= new Date(endOfLastMonth);
        });

        const thisMonthIncome = thisMonthTx.filter(t => t.type === 'RECEIVED').reduce((s, t) => s + t.amount, 0);
        const thisMonthExpenses = thisMonthTx.filter(t => t.type === 'SENT').reduce((s, t) => s + t.amount, 0);
        const lastMonthIncome = lastMonthTx.filter(t => t.type === 'RECEIVED').reduce((s, t) => s + t.amount, 0);
        const lastMonthExpenses = lastMonthTx.filter(t => t.type === 'SENT').reduce((s, t) => s + t.amount, 0);

        // --- Savings Rate ---
        const savingsRate = thisMonthIncome > 0
            ? Math.max(0, ((thisMonthIncome - thisMonthExpenses) / thisMonthIncome) * 100)
            : 0;

        // --- Spending Velocity (KES/day) ---
        const dayOfMonth = now.getDate();
        const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        const spendingVelocity = dayOfMonth > 0 ? thisMonthExpenses / dayOfMonth : 0;
        const lastMonthVelocity = daysInLastMonth > 0 ? lastMonthExpenses / daysInLastMonth : 0;

        // --- Debt-to-Income Ratio ---
        let totalLiabilities = 0;
        try {
            const debtSummary = await debtService.getDebtSummary(userId);
            totalLiabilities = debtSummary.totalLiabilities;
        } catch { /* no debts */ }

        const debtToIncomeRatio = thisMonthIncome > 0
            ? (totalLiabilities / thisMonthIncome) * 100
            : 0;

        // --- Savings Goals Progress ---
        let totalSaved = 0;
        let totalSavingsTarget = 0;
        let savingsProgress = 0;
        try {
            const goals = await savingsService.getGoals();
            totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
            totalSavingsTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
            savingsProgress = totalSavingsTarget > 0 ? (totalSaved / totalSavingsTarget) * 100 : 0;
        } catch { /* no savings */ }

        // --- Top Spending Category ---
        const categoryMap: Record<number, { name: string; amount: number; icon?: string; color?: string }> = {};
        for (const tx of thisMonthTx.filter(t => t.type === 'SENT' && t.categoryId)) {
            const cid = tx.categoryId!;
            if (!categoryMap[cid]) {
                categoryMap[cid] = { name: tx.categoryName || 'Uncategorized', amount: 0, icon: tx.categoryIcon, color: tx.categoryColor };
            }
            categoryMap[cid].amount += tx.amount;
        }
        const topCategory = Object.values(categoryMap).sort((a, b) => b.amount - a.amount)[0] ?? null;

        // --- Net Worth ---
        let totalAssets = 0;
        try {
            const balance = await db.getFirstAsync<{ total: number }>('SELECT SUM(balance) as total FROM accounts WHERE is_active = 1');
            totalAssets = (balance?.total ?? 0) + totalSaved;
        } catch { totalAssets = totalSaved; }

        const netWorth = totalAssets - totalLiabilities;

        // --- Cache monthly summary ---
        await this.upsertMonthlySummary(thisMonthStr, thisMonthIncome, thisMonthExpenses, totalSaved, netWorth);

        return {
            thisMonthIncome, thisMonthExpenses,
            lastMonthIncome, lastMonthExpenses,
            savingsRate, debtToIncomeRatio,
            spendingVelocity, lastMonthVelocity,
            totalSaved, totalSavingsTarget, savingsProgress,
            topCategory, totalAssets, totalLiabilities, netWorth,
        };
    },

    async getCategoryTrends(providedTx?: any[]): Promise<CategoryTrend[]> {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const allTx = providedTx || await getTransactions();
        const thisMonthExpTx = allTx.filter(t => t.type === 'SENT' && new Date(t.date) >= startOfThisMonth);
        const lastMonthExpTx = allTx.filter(t => {
            const d = new Date(t.date);
            return t.type === 'SENT' && d >= startOfLastMonth && d <= endOfLastMonth;
        });

        const thisMonthTotal = thisMonthExpTx.reduce((s, t) => s + t.amount, 0);

        const thisMap: Record<number, { name: string; amount: number; color?: string; icon?: string }> = {};
        for (const tx of thisMonthExpTx.filter(t => t.categoryId)) {
            const id = tx.categoryId!;
            if (!thisMap[id]) thisMap[id] = { name: tx.categoryName || 'Uncategorized', amount: 0, color: tx.categoryColor, icon: tx.categoryIcon };
            thisMap[id].amount += tx.amount;
        }

        const lastMap: Record<number, number> = {};
        for (const tx of lastMonthExpTx.filter(t => t.categoryId)) {
            lastMap[tx.categoryId!] = (lastMap[tx.categoryId!] || 0) + tx.amount;
        }

        return Object.entries(thisMap)
            .map(([id, data]) => ({
                categoryName: data.name,
                categoryColor: data.color,
                categoryIcon: data.icon,
                thisMonth: data.amount,
                lastMonth: lastMap[Number(id)] ?? 0,
                percentOfExpenses: thisMonthTotal > 0 ? (data.amount / thisMonthTotal) * 100 : 0,
                trend: data.amount - (lastMap[Number(id)] ?? 0),
            }))
            .sort((a, b) => b.thisMonth - a.thisMonth)
            .slice(0, 6); // Top 6 categories
    },

    async getMonthlySummaries(months: number = 6): Promise<MonthlySummary[]> {
        const db = getDb();
        const rows = await db.getAllAsync<any>(
            'SELECT * FROM monthly_summaries ORDER BY month DESC LIMIT ?', [months]
        );
        return rows.map(r => ({
            month: r.month,
            totalIncome: r.total_income,
            totalExpenses: r.total_expenses,
            totalSavings: r.total_savings,
            netWorthSnapshot: r.net_worth_snapshot,
        })).reverse(); // oldest first for charts
    },

    async recordNetWorthSnapshot(): Promise<void> {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];
        const metrics = await this.getKeyMetrics();
        const id = generateUUID();
        await db.runAsync(`
            INSERT OR REPLACE INTO net_worth_history (id, snapshot_date, total_assets, total_liabilities, net_worth)
            VALUES (?, ?, ?, ?, ?)
        `, [id, today, metrics.totalAssets, metrics.totalLiabilities, metrics.netWorth]);
    },

    async getNetWorthHistory(days: number = 90): Promise<{ date: string; netWorth: number }[]> {
        const db = getDb();
        const rows = await db.getAllAsync<any>(
            'SELECT * FROM net_worth_history ORDER BY snapshot_date DESC LIMIT ?', [days]
        );
        return rows.map(r => ({ date: r.snapshot_date, netWorth: r.net_worth })).reverse();
    },

    async upsertMonthlySummary(
        month: string, income: number, expenses: number, savings: number, netWorth: number
    ): Promise<void> {
        const db = getDb();
        const id = generateUUID();
        await db.runAsync(`
            INSERT OR REPLACE INTO monthly_summaries (id, month, total_income, total_expenses, total_savings, net_worth_snapshot, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, month, income, expenses, savings, netWorth, new Date().toISOString()]);
    },
};
