import { AutomationCondition, AutomationRule } from "../types/automation";
import { Transaction } from "../types/transaction";

export const evaluateTransaction = (transaction: Partial<Transaction>, rules: AutomationRule[]): AutomationRule | null => {
    // Map Transaction Type (SENT/RECEIVED) to Rule Type (EXPENSE/INCOME)
    const txType = transaction.type === 'SENT' ? 'EXPENSE' : 'INCOME';

    // Filter by type (EXPENSE/INCOME) first
    const applicableRules = rules.filter(r => r.isEnabled && r.type === txType);

    for (const rule of applicableRules) {
        if (checkConditions(transaction, rule.conditions)) {
            return rule;
        }
    }
    return null;
};

const checkConditions = (transaction: Partial<Transaction>, conditions: AutomationCondition[]): boolean => {
    // All conditions must be met (AND logic)
    return conditions.every(condition => checkCondition(transaction, condition));
};

const checkCondition = (transaction: Partial<Transaction>, condition: AutomationCondition): boolean => {
    const txDate = transaction.date instanceof Date ? transaction.date : new Date(transaction.date || Date.now());

    switch (condition.field) {
        case 'TIME':
            // Value format: { start: 18, end: 22 } (Hours 0-23)
            const hour = txDate.getHours();
            const { start, end } = condition.value;
            // Handle cross-midnight range (e.g., 22 to 04)
            if (start <= end) {
                return hour >= start && hour <= end;
            } else {
                return hour >= start || hour <= end;
            }

        case 'AMOUNT':
            const amount = transaction.amount || 0;
            switch (condition.operator) {
                case 'GREATER_THAN': return amount > condition.value;
                case 'LESS_THAN': return amount < condition.value;
                case 'EQUALS': return amount === condition.value;
                case 'BETWEEN':
                    return amount >= condition.value.min && amount <= condition.value.max;
                default: return false;
            }

        case 'DESCRIPTION':
            const text = (transaction.recipientName || transaction.rawSms || '').toLowerCase();
            const keyword = String(condition.value).toLowerCase();
            switch (condition.operator) {
                case 'CONTAINS': return text.includes(keyword);
                case 'EQUALS': return text === keyword;
                default: return false;
            }

        default:
            return false;
    }
};
