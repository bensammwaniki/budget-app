import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DebtBreakdownChart, { DebtItem } from '../../components/DebtBreakdownChart';
import { debtService } from '../../services/debtService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { Debt } from '../../types/debt';

export default function DebtsScreen() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const { showTabBar } = useScrollVisibility();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ACTIVE' | 'PAID'>('ACTIVE');

  const formatCurrency = (value: any) =>
    `KES ${Number(value || 0).toLocaleString()}`;

  const loadDebts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await debtService.getDebts('local_user', filter);
      setDebts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load debts:', error);
      setDebts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  // Show tab bar when screen mounts
  useEffect(() => {
    showTabBar();
  }, [showTabBar]);

  // Load debts when filter changes
  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDebts();
  }, [loadDebts]);

  const chartData: DebtItem[] = useMemo(() => {
    return debts
      .filter((d) => Number(d.currentBalance) > 0)
      .map((d, index) => ({
        label: d.name,
        value: Number(d.currentBalance || 0),
        color: ['#FF6B6B', '#4D96FF', '#FFD93D', '#6BCB77', '#8D6E63'][index % 5],
      }));
  }, [debts]);

  const handleDebtPress = useCallback((debtId: string) => {
    try {
      router.push(`/debt/${debtId}`);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  }, []);

  const handleAddDebt = useCallback(() => {
    try {
      router.push('/debt/add');
    } catch (error) {
      console.error('Navigation error:', error);
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: Debt }) => {
    const principal = Number(item.principalAmount || 0);
    const balance =
      Number(item.currentBalance || 0) + Number(item.accruedFees || 0);

    const progress =
      principal > 0
        ? Math.min(((principal - balance) / principal) * 100, 100)
        : 0;

    const dueDateFormatted =
      item.dueDate && !isNaN(new Date(item.dueDate).getTime())
        ? new Date(item.dueDate).toLocaleDateString()
        : null;

    return (
      <TouchableOpacity
        className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-3 shadow-sm border border-slate-100 dark:border-slate-800"
        onPress={() => handleDebtPress(item.id)}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center gap-3">
            <View
              className={`w-10 h-10 rounded-full items-center justify-center ${filter === 'ACTIVE'
                  ? 'bg-red-100 dark:bg-red-900/20'
                  : 'bg-green-100 dark:bg-green-900/20'
                }`}
            >
              <FontAwesome
                name={
                  item.type === 'OVERDRAFT'
                    ? 'warning'
                    : item.name?.toLowerCase().includes('bank')
                      ? 'bank'
                      : 'money'
                }
                size={18}
                color={
                  item.type === 'OVERDRAFT'
                    ? '#f97316'
                    : filter === 'ACTIVE'
                      ? '#ef4444'
                      : '#22c55e'
                }
              />
            </View>

            <View>
              <Text className="text-slate-900 dark:text-white font-bold text-base">
                {item.name}
              </Text>

              {dueDateFormatted && (
                <Text className="text-slate-500 text-xs">
                  Due: {dueDateFormatted}
                </Text>
              )}
            </View>
          </View>

          <View className="items-end">
            <Text className="text-slate-900 dark:text-white font-bold text-lg">
              {formatCurrency(balance)}
            </Text>

            {!item.isRevolving && (
              <Text className="text-slate-400 text-xs">
                of {formatCurrency(principal)}
              </Text>
            )}
          </View>
        </View>

        {!item.isRevolving && (
          <View className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
            <View
              className={`h-full ${filter === 'ACTIVE' ? 'bg-blue-500' : 'bg-green-500'
                }`}
              style={{ width: `${progress}%` }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [filter, formatCurrency, handleDebtPress]);

  return (
    <View
      className="flex-1 bg-gray-50 dark:bg-[#020617]"
      style={{ paddingTop: insets.top }}
    >
      <View className="px-6 py-4 flex-row justify-between items-center bg-white dark:bg-[#0f172a] shadow-sm">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          Debts
        </Text>

        <TouchableOpacity
          onPress={handleAddDebt}
          className="p-4 -ml-2 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center"
        >
          <Image
            source={require('../../assets/svg/plus.svg')}
            style={{ width: 18, height: 18 }}
            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
            contentFit="contain"
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={debts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View className="p-6">
            {filter === 'ACTIVE' && chartData.length > 0 && (
              <View className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl shadow-sm mb-6 items-center">
                <DebtBreakdownChart data={chartData} />
              </View>
            )}

            <View className="flex-row bg-slate-200 dark:bg-slate-800 p-1 rounded-xl mb-4">
              <TouchableOpacity
                className={`flex-1 py-2 rounded-lg ${filter === 'ACTIVE'
                    ? 'bg-white dark:bg-slate-600 shadow-sm'
                    : ''
                  }`}
                onPress={() => setFilter('ACTIVE')}
              >
                <Text
                  className={`text-center font-bold ${filter === 'ACTIVE'
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500'
                    }`}
                >
                  Active
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`flex-1 py-2 rounded-lg ${filter === 'PAID'
                    ? 'bg-white dark:bg-slate-600 shadow-sm'
                    : ''
                  }`}
                onPress={() => setFilter('PAID')}
              >
                <Text
                  className={`text-center font-bold ${filter === 'PAID'
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500'
                    }`}
                >
                  Paid
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-10">
              <Text className="text-slate-400">No debts found.</Text>
            </View>
          ) : (
            <ActivityIndicator className="mt-10" />
          )
        }
      />
    </View>
  );
}