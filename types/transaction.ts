export type TransactionKind = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'DEBT_PRINCIPAL' | 'DEBT_REPAYMENT' | 'SAVINGS_TRANSFER';

export interface Transaction {
    id: string; // UUID (Primary Key)
    uuid: string; // Redundant but explicit in reqs, often same as ID
    userId: string;
    accountId: string;
    categoryId?: number;

    amount: number;
    type: 'SENT' | 'RECEIVED'; // Legacy/Display direction
    transactionKind: TransactionKind;

    recipientId?: string;
    recipientName: string;

    date: Date;

    // Ledger Auditing
    balanceAfter?: number;
    referenceId?: string; // For linking transfers (Account A debit <-> Account B credit)

    // Meta
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    isDeleted: boolean;

    // Legacy/Display
    categoryName?: string;
    categoryIcon?: string;
    categoryColor?: string;
    rawSms: string;

    // Legacy support
    balance?: number;
    transactionCost: number;

    // Debt/Goal linking (Optional for now, part of Phase 2/3 but good to have type ready)
    linkedDebtId?: string;
    linkedGoalId?: string;
}

export interface Category {
    id: number;
    name: string;
    type: 'EXPENSE' | 'INCOME';
    icon: string;
    color: string;
    isCustom?: boolean;
    description?: string;
}

export interface Recipient {
    id: string; // Unique Identifier
    categoryId: number;
    lastSeen: Date;
}

export interface FulizaTransaction {
    id: string;
    amount: number;
    type: 'LOAN' | 'REPAYMENT';
    accessFee?: number;
    outstandingBalance?: number;
    dueDate?: Date;
    linkedTransactionId?: string;
    date: Date;
    rawSms: string;
    transactionKind: TransactionKind;
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

export interface MonthlyBudget {
    month: string; // YYYY-MM
    totalIncome: number;
}

export interface CategoryBudget {
    id: number;
    month: string; // YYYY-MM
    categoryId: number;
    budgetAmount: number;
}
