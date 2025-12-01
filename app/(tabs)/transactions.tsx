import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { getTransactions, Transaction } from '../../services/database';

export default function TransactionsScreen() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(() => {
        const allTransactions = getTransactions();
        setTransactions(allTransactions);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const filteredTransactions = transactions.filter(t => {
        const matchesFilter =
            filter === 'ALL' ? true :
                filter === 'INCOME' ? ['RECEIVE', 'DEPOSIT'].includes(t.type) :
                    !['RECEIVE', 'DEPOSIT'].includes(t.type);

        const matchesSearch =
            t.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.type.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesFilter && matchesSearch;
    });

    const formatCurrency = (amount: number) => {
        return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    };

    const renderItem = ({ item }: { item: Transaction }) => (
        <View className="flex-row items-center bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-sm mb-3">
            <View className="w-12 h-12 rounded-full bg-[#0f172a] items-center justify-center mr-4 border border-slate-700">
                <FontAwesome
                    name={['RECEIVE', 'DEPOSIT'].includes(item.type) ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={['RECEIVE', 'DEPOSIT'].includes(item.type) ? '#4ade80' : '#f87171'}
                />
            </View>
            <View className="flex-1">
                <Text className="text-white font-semibold text-base" numberOfLines={1}>{item.recipient}</Text>
                <Text className="text-slate-500 text-xs mt-0.5">{new Date(item.date).toLocaleDateString()} • {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <View className="items-end">
                <Text className={`font-bold ${['RECEIVE', 'DEPOSIT'].includes(item.type) ? 'text-green-400' : 'text-white'}`}>
                    {['RECEIVE', 'DEPOSIT'].includes(item.type) ? '+' : '-'} {formatCurrency(item.amount)}
                </Text>
                <Text className="text-slate-600 text-[10px] mt-1">{item.type}</Text>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-[#020617]">
            <StatusBar style="light" />

            {/* Header */}
            <View className="px-6 pt-16 pb-4 bg-[#0f172a] border-b border-slate-800">
                <Text className="text-white text-3xl font-bold mb-4">Transactions</Text>

                {/* Search Bar */}
                <View className="flex-row items-center bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-3 mb-4">
                    <FontAwesome name="search" size={16} color="#94a3b8" />
                    <TextInput
                        className="flex-1 ml-3 text-white text-base"
                        placeholder="Search transactions..."
                        placeholderTextColor="#64748b"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {/* Filter Tabs */}
                <View className="flex-row gap-3">
                    {['ALL', 'INCOME', 'EXPENSE'].map((f) => (
                        <TouchableOpacity
                            key={f}
                            onPress={() => setFilter(f as any)}
                            className={`px-4 py-2 rounded-full border ${filter === f ? 'bg-blue-600 border-blue-500' : 'bg-[#1e293b] border-slate-700'}`}
                        >
                            <Text className={`font-semibold ${filter === f ? 'text-white' : 'text-slate-400'}`}>
                                {f.charAt(0) + f.slice(1).toLowerCase()}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* List */}
            <FlatList
                data={filteredTransactions}
                renderItem={renderItem}
                keyExtractor={item => item.id ? item.id.toString() : Math.random().toString()}
                contentContainerClassName="p-6 pb-24"
                ListEmptyComponent={
                    <View className="items-center justify-center mt-20">
                        <View className="w-20 h-20 bg-[#1e293b] rounded-full items-center justify-center mb-4 border border-slate-700">
                            <FontAwesome name="search" size={32} color="#64748b" />
                        </View>
                        <Text className="text-slate-400 font-semibold text-lg">No transactions found</Text>
                    </View>
                }
            />
        </View>
    );
}
