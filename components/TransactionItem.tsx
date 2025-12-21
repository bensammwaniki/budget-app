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

    return (
        <TouchableOpacity
            className="flex-row items-center bg-white dark:bg-[#1e293b] mx-6 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm mb-4 active:opacity-70"
            onPress={() => onPress(tx)}
        >
            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 border ${isBankTransaction
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-[#0f172a] border-gray-100 dark:border-slate-700'
                }`}>
                <FontAwesome
                    name={((tx.categoryIcon) || (isBankTransaction ? 'bank' : (tx.type === 'RECEIVED' ? 'arrow-down' : 'shopping-cart'))) as any}
                    size={18}
                    color={tx.categoryColor || (isBankTransaction ? '#2563eb' : (tx.type === 'RECEIVED' ? '#4ade80' : '#94a3b8'))}
                />
            </View>
            <View className="flex-1">
                <Text className="text-slate-900 dark:text-white font-semibold text-base" numberOfLines={1}>
                    {tx.recipientName}
                </Text>
                <View className="flex-row items-center mt-0.5">
                    <View className={`px-1.5 py-0.5 rounded mr-2 ${isBankTransaction ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                        <Text className={`text-[8px] font-bold ${isBankTransaction ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-400'}`}>
                            {isBankTransaction ? 'I&M BANK' : 'M-PESA'}
                        </Text>
                    </View>
                    {tx.categoryName && (
                        <Text className="text-[10px] font-medium mr-2" style={{ color: tx.categoryColor }}>
                            {tx.categoryName}
                        </Text>
                    )}
                    <Text className="text-slate-400 text-[10px]">
                        {tx.date.toLocaleDateString()}
                    </Text>
                </View>
            </View>
            <Text className={`font-bold ${tx.type === 'RECEIVED' ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>
                {tx.type === 'RECEIVED' ? '+' : '-'} KES {tx.amount.toLocaleString()}
            </Text>
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
