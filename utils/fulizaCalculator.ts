export const calculateFulizaDailyCharge = (outstandingBalance: number): number => {
    if (outstandingBalance <= 100) return 0;
    if (outstandingBalance <= 500) return 3;
    if (outstandingBalance <= 1000) return 6;
    if (outstandingBalance <= 1500) return 21.6;
    if (outstandingBalance <= 2500) return 24;
    return 30;
};

export const calculateAccessFee = (loanAmount: number): number => {
    return loanAmount * 0.01; // 1%
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
