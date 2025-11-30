export interface Transaction {
    id: string;
    amount: number;
    type: 'SENT' | 'RECEIVED';
    recipientId: string; // Name or Account Number (e.g., "DAD RONGAI" or "333667")
    recipientName: string; // Display name
    date: Date;
    balance: number;
    transactionCost: number;
    categoryId?: number;
    categoryName?: string;
    categoryIcon?: string;
    categoryColor?: string;
    rawSms: string;
}

export interface Category {
    id: number;
    name: string;
    type: 'EXPENSE' | 'INCOME';
    icon: string;
    color: string;
    isCustom?: boolean;
}

export interface Recipient {
    id: string; // Unique Identifier
    categoryId: number;
    lastSeen: Date;
}

export interface SpendingSummary {
    currentBalance: number;
    dailyTotal: number;
    weeklyTotal: number;
    monthlyTotal: number;
    transactionCount: number;
    totalSpent: number;
    monthlyTransactionCost: number;
    totalIncome: number;
}
