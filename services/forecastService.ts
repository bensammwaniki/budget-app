import { getTransactions } from './database';
import { isCashflowTransaction } from './financialSettingsService';

export interface ForecastResult {
    projectedExpenses: number;   // Predicted total for next month
    projectedIncome: number;     // Predicted total income next month
    projectedSavings: number;    // income - expenses
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'; // Based on data availability
    daysUntilExhaustion: number | null; // Days until current month budget blown (if applicable)
    monthlyDataPoints: number;   // How many months of data used
}

interface MonthlyData {
    income: number;
    expenses: number;
}

export const forecastService = {

    async forecast(providedTx?: any[]): Promise<ForecastResult> {
        const allTx = providedTx || await getTransactions();

        // Collect last 6 months of data
        const monthlyData: Record<string, MonthlyData> = {};
        const now = new Date();

        for (let i = 1; i <= 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[key] = { income: 0, expenses: 0 };
        }

        for (const tx of allTx) {
            if (!isCashflowTransaction(tx)) continue;
            const d = new Date(tx.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyData[key]) {
                if (tx.type === 'RECEIVED') monthlyData[key].income += tx.amount;
                else monthlyData[key].expenses += tx.amount;
            }
        }

        const dataPoints = Object.values(monthlyData).filter(m => m.expenses > 0 || m.income > 0);
        const n = dataPoints.length;

        if (n === 0) {
            return {
                projectedExpenses: 0, projectedIncome: 0,
                projectedSavings: 0, confidence: 'LOW',
                daysUntilExhaustion: null, monthlyDataPoints: 0,
            };
        }

        // Weighted average: most recent month = weight 3, prev = weight 2, older = weight 1
        const weights = [3, 2, 2, 1, 1, 1];
        const entries = Object.entries(monthlyData)
            .sort(([a], [b]) => b.localeCompare(a)) // most recent first
            .slice(0, 6);

        let weightedExpenses = 0;
        let weightedIncome = 0;
        let totalWeight = 0;

        entries.forEach(([, data], idx) => {
            const w = weights[idx] ?? 1;
            weightedExpenses += data.expenses * w;
            weightedIncome += data.income * w;
            totalWeight += w;
        });

        const projectedExpenses = totalWeight > 0 ? weightedExpenses / totalWeight : 0;
        const projectedIncome = totalWeight > 0 ? weightedIncome / totalWeight : 0;
        const projectedSavings = projectedIncome - projectedExpenses;

        const confidence: ForecastResult['confidence'] = n >= 4 ? 'HIGH' : n >= 2 ? 'MEDIUM' : 'LOW';

        // Days until exhaustion: current month spend pace vs projected monthly
        const dayOfMonth = now.getDate();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthExpenses = allTx
            .filter(t => isCashflowTransaction(t) && t.type === 'SENT' && new Date(t.date) >= thisMonthStart)
            .reduce((s, t) => s + t.amount, 0);

        const dailyVelocity = dayOfMonth > 0 ? thisMonthExpenses / dayOfMonth : 0;
        const remaining = projectedExpenses - thisMonthExpenses;
        const daysUntilExhaustion = dailyVelocity > 0 && remaining > 0
            ? Math.round(remaining / dailyVelocity)
            : null;

        return {
            projectedExpenses: Math.round(projectedExpenses),
            projectedIncome: Math.round(projectedIncome),
            projectedSavings: Math.round(projectedSavings),
            confidence,
            daysUntilExhaustion,
            monthlyDataPoints: n,
        };
    },
};
