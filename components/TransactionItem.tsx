import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Transaction } from '../types/transaction';

interface TransactionItemProps {
    transaction: Transaction;
    onPress: (tx: Transaction) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction: tx, onPress }) => {
    // Detect if this is a bank transaction
    const isBankTransaction = tx.id.startsWith('IM_') ||
        tx.id.includes('VCSA') ||
        tx.id.includes('OIGG');
    const accountType = tx.accountType || (
        tx.accountId === 'ACC-CASH-DEFAULT'
            ? 'CASH'
            : tx.accountId === 'ACC-MPESA-DEFAULT'
                ? 'M-PESA'
                : undefined
    );
    const sourceLabel = isBankTransaction
        ? 'I&M BANK'
        : accountType === 'CASH'
            ? 'CASH'
            : accountType === 'BANK'
                ? (tx.accountName || 'BANK').toUpperCase()
                : accountType === 'DEBT'
                    ? 'DEBT'
                    : 'M-PESA';
    const sourceTextClass = isBankTransaction
        ? 'text-blue-700 dark:text-blue-400'
        : accountType === 'CASH'
            ? 'text-amber-700 dark:text-amber-400'
            : accountType === 'BANK'
                ? 'text-indigo-700 dark:text-indigo-400'
                : accountType === 'DEBT'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-green-700 dark:text-green-400';

    return (
        <TouchableOpacity
            className="flex-row items-center mx-4 p-3 bg-white dark:bg-[#1e293b] border-x border-b border-slate-100 dark:border-slate-700 active:opacity-70"
            onPress={() => onPress(tx)}
        >
            <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 border ${isBankTransaction
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                : 'bg-gray-50 dark:bg-[#0f172a] border-gray-100 dark:border-slate-700'
                }`}>
                <FontAwesome
                    name={((tx.categoryIcon) || (isBankTransaction ? 'bank' : (tx.type === 'RECEIVED' ? 'arrow-down' : 'shopping-cart'))) as any}
                    size={16}
                    color={tx.categoryColor || (isBankTransaction ? '#2563eb' : (tx.type === 'RECEIVED' ? '#4ade80' : '#94a3b8'))}
                />
            </View>
            <View className="flex-1">
                <Text className="text-slate-900 dark:text-white font-semibold text-[13px]" numberOfLines={1}>
                    {(tx.recipientName || '').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </Text>
                <View className="flex-row items-center mt-0.5">
                    {tx.categoryName && (
                        <Text className="text-[9px] font-medium mr-2" style={{ color: tx.categoryColor }}>
                            {tx.categoryName}
                        </Text>
                    )}
                    <Text className="text-slate-400 text-[9px]">
                        {tx.date.toLocaleDateString()}
                    </Text>
                </View>
            </View>
            <View className="items-end ml-2">
                <Text className={`font-bold text-[12px] ${tx.type === 'RECEIVED' ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>
                    {tx.type === 'RECEIVED' ? '+' : '-'} KES {tx.amount.toLocaleString()}
                </Text>
                <Text className={`text-[9px] font-semibold mt-1 ${sourceTextClass}`}>
                    {sourceLabel}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

// Memoize to prevent unnecessary re-renders when other items change or during sync
export default React.memo(TransactionItem, (prevProps, nextProps) => {
    return (
        prevProps.transaction.id === nextProps.transaction.id &&
        prevProps.transaction.categoryId === nextProps.transaction.categoryId &&
        prevProps.transaction.amount === nextProps.transaction.amount &&
        prevProps.transaction.date.getTime() === nextProps.transaction.date.getTime()
    );
});
