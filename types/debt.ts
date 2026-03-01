export type DebtStatus = 'ACTIVE' | 'PAID' | 'DEFAULTED';

export interface Debt {
    id: string; // UUID
    userId: string;
    accountId?: string; // Optional: Linked to an account (e.g., Bank Loan -> Bank Account)
    type: 'LIABILITY' | 'RECEIVABLE' | 'OVERDRAFT';
    name: string; // e.g., "Fuliza", "HELB", "M-Shwari", "KCB M-Pesa"
    isRevolving: boolean; // True for overdrafts that don't have a fixed principal (like Fuliza)
    isReducingBalance?: boolean; // True if the debt repayment reduces the original principal

    principalAmount: number; // Original Debt Amount
    currentBalance: number; // Remaining to be paid
    interestRate?: number; // Optional %

    startDate: Date;
    dueDate?: Date;
    status: DebtStatus;

    createdAt: Date;
    updatedAt: Date;
    accruedFees?: number; // Estimated unbilled fees since last update
    projectedInterest?: number; // Estimated interest by the due date
}

export interface DebtPayment {
    id: string; // UUID
    debtId: string;
    transactionId: string; // Link to Ledger Transaction
    amount: number;
    date: Date;
}
