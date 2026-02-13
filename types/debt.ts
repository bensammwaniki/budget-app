export type DebtStatus = 'ACTIVE' | 'PAID' | 'DEFAULTED';

export interface Debt {
    id: string; // UUID
    userId: string;
    accountId?: string; // Optional: Linked to an account (e.g., Bank Loan -> Bank Account)
    type: 'LIABILITY' | 'RECEIVABLE';
    name: string; // e.g., "Fuliza", "HESLB"

    principalAmount: number; // Original Debt Amount
    currentBalance: number; // Remaining to be paid
    interestRate?: number; // Optional %

    startDate: Date;
    dueDate?: Date;
    status: DebtStatus;

    createdAt: Date;
    updatedAt: Date;
}

export interface DebtPayment {
    id: string; // UUID
    debtId: string;
    transactionId: string; // Link to Ledger Transaction
    amount: number;
    date: Date;
}
