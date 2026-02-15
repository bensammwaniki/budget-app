import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
// navigation will be imported dynamically in handlers to avoid requiring navigation context at render
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
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'PAID'>('ACTIVE');
  const [typeFilter, setTypeFilter] = useState<'LIABILITY' | 'RECEIVABLE'>('LIABILITY');

  const formatCurrency = (value: any) =>
    `KES ${Number(value || 0).toLocaleString()}`;

  const loadDebts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await debtService.getDebts('local_user', statusFilter, typeFilter);
      setDebts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load debts:', error);
      setDebts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter]);

  // Show tab bar when screen mounts
  useEffect(() => {
    showTabBar();
  }, [showTabBar]);

  // Load debts when filters change
  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDebts();
  }, [loadDebts]);

  const chartData: DebtItem[] = useMemo(() => {
    const palette = typeFilter === 'LIABILITY'
      ? ['#FF6B6B', '#FFD93D', '#FF9F43', '#EE5253', '#A55EEA'] // Red/Orange palette
      : ['#6BCB77', '#4D96FF', '#10ac84', '#0fbcf9', '#05c46b']; // Green/Blue palette

    return debts
      .filter((d) => Number(d.currentBalance) > 0)
      .map((d, index) => ({
        label: d.name,
        value: Number(d.currentBalance || 0),
        color: palette[index % palette.length],
      }));
  }, [debts, typeFilter]);

  const handleDebtPress = useCallback((debtId: string) => {
    import('expo-router').then(({ router }) => {
      try {
        router.push(`/debt/${debtId}`);
      } catch (error) {
        console.error('Navigation error:', error);
      }
    }).catch(err => console.error('Failed to load router:', err));
  }, []);

  const handleAddDebt = useCallback(() => {
    import('expo-router').then(({ router }) => {
      try {
        router.push('/debt/add');
      } catch (error) {
        console.error('Navigation error:', error);
      }
    }).catch(err => console.error('Failed to load router:', err));
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

    const isLiability = item.type === 'LIABILITY' || item.type === 'OVERDRAFT';
    const mainColor = isLiability ? '#ef4444' : '#22c55e'; // Red vs Green
    const bgColor = isLiability ? 'bg-red-100 dark:bg-red-900/20' : 'bg-green-100 dark:bg-green-900/20';
    const progressBarColor = isLiability ? 'bg-red-500' : 'bg-green-500';

    return (
      <TouchableOpacity
        className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-3 shadow-sm border border-slate-100 dark:border-slate-800"
        onPress={() => handleDebtPress(item.id)}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-full items-center justify-center ${bgColor}`}>
              <FontAwesome
                name={
                  item.type === 'OVERDRAFT'
                    ? 'warning'
                    : item.name?.toLowerCase().includes('bank')
                      ? 'bank'
                      : isLiability ? 'money' : 'arrow-circle-down'
                }
                size={18}
                color={mainColor}
              />
            </View>

            <View>
              <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                {isLiability ? 'Borrowed From' : 'Owed By'}
              </Text>
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
            <Text
              className="font-bold text-lg"
              style={{ color: mainColor }}
            >
              {formatCurrency(balance)}
            </Text>

            {!item.isRevolving && (
              <Text className="text-slate-400 text-xs text-right">
                of {formatCurrency(principal)}
              </Text>
            )}
          </View>
        </View>

        {!item.isRevolving && (
          <View className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
            <View
              className={`h-full ${progressBarColor}`}
              style={{ width: `${progress}%` }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [handleDebtPress]);

  return (
    <View
      className="flex-1 bg-gray-50 dark:bg-[#020617]"
      style={{ paddingTop: insets.top }}
    >
      <View className="px-6 py-4 flex-row justify-between items-center bg-white dark:bg-[#0f172a] shadow-sm">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          {typeFilter === 'LIABILITY' ? 'My Debts' : 'Money Owed to Me'}
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
            {/* Main Tabs (Active vs Paid) */}
            <View style={{ flexDirection: 'row', backgroundColor: '#e6edf3', padding: 4, borderRadius: 12, marginBottom: 16 }}>
              {(['ACTIVE', 'PAID'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: statusFilter === f ? '#ffffff' : 'transparent', alignItems: 'center' }}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text style={{ textAlign: 'center', fontWeight: '700', color: statusFilter === f ? '#0f172a' : '#94a3b8' }}>
                    {f === 'ACTIVE' ? 'Active' : 'History'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-4 mb-5">
                {/* Sub Tabs (Debts vs Assets) */}
                <View className="flex-col gap-4 mb-5">

                  {/* I Owe Card */}
                  <TouchableOpacity
                    onPress={() => setTypeFilter('LIABILITY')}
                    className={`rounded-2xl p-5 border shadow-sm ${
                      typeFilter === 'LIABILITY'
                        ? 'bg-red-500 border-red-500'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-500'}`} >
                      Total I Owe
                    </Text>

                    <Text className={`text-3xl font-bold mt-2 ${typeFilter === 'LIABILITY' ? 'text-white' : 'text-slate-900'}`} >
                      $4,250
                    </Text>

                    <Text className={`mt-2 text-sm ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-400'}`} >
                      3 active debts
                    </Text>
                  </TouchableOpacity>


                  {/* Owed To Me Card */}
                  <TouchableOpacity
                    onPress={() => setTypeFilter('RECEIVABLE')}
                    className={`rounded-2xl p-5 border shadow-sm ${
                      typeFilter === 'RECEIVABLE'
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-slate-200'
                    }`}>
                    <Text className={`text-sm font-medium ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-500'}`}>
                      Total Owed To Me
                    </Text>

                    <Text className={`text-3xl font-bold mt-2 ${typeFilter === 'RECEIVABLE' ? 'text-white' : 'text-slate-900'}`}>
                      $2,180
                    </Text>
                    <Text className={`mt-2 text-sm ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-400'}`}>
                      2 people owe you
                    </Text>
                  </TouchableOpacity>

                </View>


                {statusFilter === 'ACTIVE' && chartData.length > 0 && (
                  <View className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 shadow-sm items-center">
                    <Text className="text-slate-500 text-xs font-bold uppercase mb-4 self-start">
                      {typeFilter === 'LIABILITY' ? 'Debt Breakdown' : 'Receivables Portfolio'}
                    </Text>
                    <DebtBreakdownChart data={chartData} />
                  </View>
                )}
            </View>

          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-10 px-10">
              <Text className="text-slate-400 text-center">
                {statusFilter === 'ACTIVE'
                  ? `You have no active ${typeFilter === 'LIABILITY' ? 'debts' : 'receivables'}.`
                  : `No paid ${typeFilter === 'LIABILITY' ? 'debts' : 'receivables'} found.`
                }
              </Text>
            </View>
          ) : (
            <ActivityIndicator className="mt-10" />
          )
        }
      />
    </View>
  );
}