export interface AutomationCondition {
    field: 'TIME' | 'AMOUNT' | 'DESCRIPTION';
    operator: 'BETWEEN' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS' | 'EQUALS';
    value: any; // { start: 18, end: 22 } or 5000 or "Uber"
}

export interface AutomationAction {
    categoryId: number;
}

export interface AutomationRule {
    id: number;
    name: string;
    type: 'EXPENSE' | 'INCOME';
    conditions: AutomationCondition[];
    action: AutomationAction;
    isEnabled: boolean;
}
