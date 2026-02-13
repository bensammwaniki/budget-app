import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DebtBreakdownChart, { DebtItem } from '../../components/DebtBreakdownChart';
import { debtService } from '../../services/debtService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { Debt } from '../../types/debt';

export default function DebtsScreen() {
    const router = useRouter();
    const { colorScheme } = useColorScheme();
    const insets = useSafeAreaInsets();
    const { showTabBar } = useScrollVisibility();

    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'ACTIVE' | 'PAID'>('ACTIVE');

    const loadDebts = async () => {
        try {
            const data = await debtService.getDebts('local_user', filter);
            setDebts(data);
        } catch (error) {
            console.error("Failed to load debts:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            showTabBar(); // Ensure tab bar is visible when returning
            loadDebts();
        }, [filter])
    );

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadDebts();
    };

    const chartData: DebtItem[] = debts.map((d, index) => ({
        label: d.name,
        value: d.currentBalance,
        color: ['#FF6B6B', '#4D96FF', '#FFD93D', '#6BCB77', '#8D6E63'][index % 5]
    }));

    const renderItem = ({ item }: { item: Debt }) => (
        <TouchableOpacity
            className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-3 shadow-sm border border-slate-100 dark:border-slate-800"
            onPress={() => router.push(`/debt/${item.id}`)}
        >
            <View className="flex-row justify-between items-start mb-2">
                <View className="flex-row items-center gap-3">
                    <View className={`w-10 h-10 rounded-full items-center justify-center ${filter === 'ACTIVE' ? 'bg-red-100 dark:bg-red-900/20' : 'bg-green-100 dark:bg-green-900/20'}`}>
                        <FontAwesome name={item.name.toLowerCase().includes('bank') ? 'bank' : 'money'} size={18} color={filter === 'ACTIVE' ? '#ef4444' : '#22c55e'} />
                    </View>
                    <View>
                        <Text className="text-slate-900 dark:text-white font-bold text-base">{item.name}</Text>
                        {item.dueDate && (
                            <Text className="text-slate-500 text-xs">Due: {item.dueDate.toLocaleDateString()}</Text>
                        )}
                    </View>
                </View>
                <View className="items-end">
                    <Text className="text-slate-900 dark:text-white font-bold text-lg">
                        KES {item.currentBalance.toLocaleString()}
                    </Text>
                    <Text className="text-slate-400 text-xs">
                        of KES {item.principalAmount.toLocaleString()}
                    </Text>
                </View>
            </View>

            {/* Progress Bar */}
            <View className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                <View
                    className={`h-full ${filter === 'ACTIVE' ? 'bg-blue-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(((item.principalAmount - item.currentBalance) / item.principalAmount) * 100, 100)}%` }}
                />
            </View>
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <View className="px-6 py-4 flex-row justify-between items-center bg-white dark:bg-[#0f172a] shadow-sm">
                <Text className="text-2xl font-bold text-slate-900 dark:text-white">Debts</Text>
                <TouchableOpacity onPress={() => router.push('/debt/add')} className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center">
                    <FontAwesome name="plus" size={16} color="#3b82f6" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={debts}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                ListHeaderComponent={
                    <View className="p-6">
                        {/* Chart Section */}
                        {filter === 'ACTIVE' && (
                            <View className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl shadow-sm mb-6 items-center">
                                <DebtBreakdownChart data={chartData} />
                            </View>
                        )}

                        {/* Filter Tabs */}
                        <View className="flex-row bg-slate-200 dark:bg-slate-800 p-1 rounded-xl mb-4">
                            <TouchableOpacity
                                className={`flex-1 py-2 rounded-lg ${filter === 'ACTIVE' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
                                onPress={() => setFilter('ACTIVE')}
                            >
                                <Text className={`text-center font-bold ${filter === 'ACTIVE' ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>Active</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`flex-1 py-2 rounded-lg ${filter === 'PAID' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
                                onPress={() => setFilter('PAID')}
                            >
                                <Text className={`text-center font-bold ${filter === 'PAID' ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>Paid</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                }
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
                ListEmptyComponent={
                    !loading ? (
                        <View className="items-center py-10">
                            <Text className="text-slate-400">No debts found.</Text>
                        </View>
                    ) : <ActivityIndicator className="mt-10" />
                }
            />
        </View>
    );
}
