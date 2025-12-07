
interface FulizaEvent {
    id: string;
    amount: number;
    type: 'LOAN' | 'REPAYMENT';
    accessFee: number;
    outstandingBalance?: number;
    date: Date | string;
}

const calculateMonthlyFulizaCosts = (events: FulizaEvent[]): Map<string, number> => {
    const monthlyCosts = new Map<string, number>();

    if (events.length === 0) return monthlyCosts;

    // Convert dates to timestamps for reliable sorting
    const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Use today as the end boundary for calculation
    const endDate = new Date();

    let currentBalance = 0;
    let lastEventDate = new Date(sortedEvents[0].date);

    // Initialize 'currentDate' to the date of the first event
    let currentDate = new Date(lastEventDate);
    currentDate.setHours(0, 0, 0, 0); // Start of that day

    // Helper to add cost
    const addCost = (date: Date, amount: number) => {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${month.toString().padStart(2, '0')}`;
        const current = monthlyCosts.get(key) || 0;
        monthlyCosts.set(key, current + amount);
    };

    // Helper: Get Daily Maintenance Fee based on balance bands (Tariff as of 2024)
    const getDailyRate = (balance: number): number => {
        if (balance <= 100) return 0;
        if (balance <= 500) return 3;
        if (balance <= 1000) return 6;
        if (balance <= 1500) return 18;
        if (balance <= 2500) return 20;
        if (balance <= 70000) return 25; // As simplified example, real bands are more granular
        return 30;
    };

    // Iterate through ever day from first event until today
    let eventIndex = 0;

    while (currentDate <= endDate) {
        const nextDay = new Date(currentDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Process all events that happened ON 'currentDate'
        while (eventIndex < sortedEvents.length) {
            const event = sortedEvents[eventIndex];
            const eventDate = new Date(event.date);

            // If event happened after today (future?), stop
            if (eventDate.getTime() > nextDay.getTime()) break;

            // If event matches current date (ignoring time for simplified processing window, 
            // or strictly greater than last processed but less than next day)
            // Actually simpler: process all events <= nextDay (exclusive of nextDay start?) 
            // No, we iterate day by day.
            if (eventDate >= nextDay) break;

            // Apply Event Impact
            if (event.type === 'LOAN') {
                // Loan increases balance
                if (event.outstandingBalance !== undefined) {
                    currentBalance = event.outstandingBalance;
                } else {
                    currentBalance += event.amount + (event.accessFee || 0); // APPROX if standard not avail
                }

                // One-time Access Fee is charged on the day of the loan
                if (event.accessFee > 0) {
                    addCost(currentDate, event.accessFee);
                    console.log(`[${currentDate.toISOString().split('T')[0]}] Access Fee: ${event.accessFee}`);
                }
            } else if (event.type === 'REPAYMENT') {
                // Repayment reduces balance
                if (event.outstandingBalance !== undefined && event.outstandingBalance !== null) { // Fix for null
                    currentBalance = event.outstandingBalance;
                } else {
                    currentBalance = Math.max(0, currentBalance - event.amount);
                }
            }

            eventIndex++;
        }

        // After processing all transactions for the day, 
        // calculate daily maintenance fee on the End-of-Day balance

        // NOTE: Safaricom charges daily fee at 00:00 for the PREVIOUS day's outstanding.
        // So if I borrow in morning, balance > 0 end of day -> Charge.
        // If I repay fully in afternoon, balance = 0 end of day -> No Charge.
        // Wait, is this true? 
        // "Daily maintenance fee is charged on the outstanding balance at midnight."
        // So if you repay fully same day, balance at midnight is 0 -> No daily fee.
        // But Access fee applies.

        const dailyFee = getDailyRate(currentBalance);
        if (dailyFee > 0) {
            addCost(currentDate, dailyFee);
            console.log(`[${currentDate.toISOString().split('T')[0]}] Daily Fee: ${dailyFee} (Bal: ${currentBalance})`);
        } else {
            console.log(`[${currentDate.toISOString().split('T')[0]}] No Daily Fee (Bal: ${currentBalance})`);
        }

        // Move to next day
        currentDate = nextDay;
    }

    return monthlyCosts;
};

// Simulation Data based on User logs
const events: FulizaEvent[] = [
    {
        id: "TL5FV06V3A",
        date: "2025-12-05T08:10:00",
        amount: 100,
        type: 'LOAN',
        accessFee: 1.00,
        outstandingBalance: 173.45 // Previous + this loan
    },
    {
        id: "TL5FV06P6N",
        date: "2025-12-05T08:25:00",
        amount: 70,
        type: 'LOAN',
        accessFee: 0.70,
        outstandingBalance: 244.15
    },
    {
        id: "TL6FV0BMLB",
        date: "2025-12-06T14:45:00",
        amount: 244.15,
        type: 'REPAYMENT',
        accessFee: 0,
        outstandingBalance: 0
    }
];

const results = calculateMonthlyFulizaCosts(events);
console.log("\nReviewing Results:");
results.forEach((val, key) => console.log(`${key}: ${val}`));
