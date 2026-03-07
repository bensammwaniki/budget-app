import { useEffect, useState } from 'react';
import {
    getSpendingSummary,
    getTransactions,
    initDatabase,
    subscribeToDatabaseChanges
} from '../services/database';
import { SpendingSummary, Transaction } from '../types/transaction';

export function useTransactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            await initDatabase();
            const data = await getTransactions();
            setTransactions(data);
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();

        // Subscribe to changes
        const unsubscribe = subscribeToDatabaseChanges((type) => {
            if (type === 'TRANSACTIONS' || type === 'CATEGORIES') {
                load();
            }
        });

        return unsubscribe;
    }, []);

    return { transactions, loading, refresh: load };
}

export function useSpendingSummary() {
    const [summary, setSummary] = useState<SpendingSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            await initDatabase();
            const data = await getSpendingSummary();
            setSummary(data);
        } catch (error) {
            console.error('Error loading spending summary:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();

        // Subscribe to changes
        const unsubscribe = subscribeToDatabaseChanges((type) => {
            if (type === 'TRANSACTIONS' || type === 'CATEGORIES' || type === 'BUDGETS') {
                load();
            }
        });

        return unsubscribe;
    }, []);

    return { summary, loading, refresh: load };
}
