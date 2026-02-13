export type AccountType = 'M-PESA' | 'BANK' | 'CASH' | 'DEBT';

export interface Account {
    id: string; // UUID
    userId: string; // Link to user
    name: string;
    type: AccountType;
    balance: number;
    currency: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
