export const calculateFulizaDailyCharge = (outstandingBalance: number): number => {
    if (outstandingBalance <= 100) return 0;
    if (outstandingBalance <= 500) return 3;
    if (outstandingBalance <= 1000) return 6;
    if (outstandingBalance <= 1500) return 21.6;
    if (outstandingBalance <= 2500) return 24;
    return 30;
};

export const calculateAccessFee = (loanAmount: number): number => {
    return loanAmount * 0.01; // 1% interest
};

export const estimateFulizaCost = (
    outstandingBalance: number,
    daysUntilPayback: number
): { dailyCharge: number; totalCost: number; accessFee: number } => {
    const dailyCharge = calculateFulizaDailyCharge(outstandingBalance);
    const accessFee = calculateAccessFee(outstandingBalance);
    const totalCost = accessFee + (dailyCharge * daysUntilPayback);

    return { dailyCharge, totalCost, accessFee };
};

/**
 * Calculates the total Fuliza costs (Access Fees + Daily Maintenance Fees) per month
 * by replaying the transaction history to simulate the daily outstanding balance.
 */
export const calculateMonthlyFulizaCosts = (messages: any[]): Map<string, number> => {
    // 1. Filter relevant messages and sort chronologically
    const events = messages
        .filter(m => m.type === 'LOAN' || m.type === 'REPAYMENT')
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    const monthlyCosts = new Map<string, number>();
    let currentBalance = 0;
    let lastDate = events.length > 0 ? events[0].date : new Date();

    // Helper to add cost to a specific month
    const addCost = (date: Date, amount: number) => {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = monthlyCosts.get(monthKey) || 0;
        monthlyCosts.set(monthKey, current + amount);
    };

    // 2. Replay events
    for (const event of events) {
        const currentDate = event.date;

        // Calculate daily fees for the days BETWEEN the last event and this event
        if (currentBalance > 0) {
            const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // We charge for each day the balance was outstanding
            // Note: This is an estimation. Real billing runs at midnight.
            // For simplicity, we apply the rate of the *previous* balance for the duration.
            const dailyRate = calculateFulizaDailyCharge(currentBalance);

            // Attribute daily charges to the correct month for each day
            let dayCursor = new Date(lastDate);
            dayCursor.setDate(dayCursor.getDate() + 1); // Start form next day

            for (let i = 0; i < diffDays; i++) {
                addCost(new Date(dayCursor), dailyRate);
                dayCursor.setDate(dayCursor.getDate() + 1);
            }
        }

        // Apply the event to the balance
        if (event.type === 'LOAN') {
            // Use the explicit outstanding balance if available, otherwise estimate
            if (event.outstandingBalance !== undefined) {
                currentBalance = event.outstandingBalance;
            } else {
                currentBalance += event.amount;
            }

            // Add the one-time access fee
            if (event.accessFee) {
                addCost(currentDate, event.accessFee);
            }
        } else if (event.type === 'REPAYMENT') {
            // For repayments, we need to reduce the outstanding balance
            if (event.outstandingBalance !== undefined && event.outstandingBalance !== null) {
                // If SMS explicitly tells us the remaining outstanding balance, use it
                currentBalance = event.outstandingBalance;
            } else {
                // Otherwise subtract the repayment amount from current balance
                currentBalance = Math.max(0, currentBalance - event.amount);
            }
        }

        lastDate = currentDate;
    }

    // 3. Calculate fees from the last event until NOW if there's still a balance
    if (currentBalance > 0) {
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            const dailyRate = calculateFulizaDailyCharge(currentBalance);
            const totalDailyCharges = dailyRate * diffDays;
            addCost(now, totalDailyCharges);
        }
    }

    return monthlyCosts;
};
