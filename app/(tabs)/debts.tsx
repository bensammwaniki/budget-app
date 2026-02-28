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
import { initDatabase, subscribeToDatabaseChanges } from '../../services/database';
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
  const [liabilityTotal, setLiabilityTotal] = useState<number>(0);
  const [receivableTotal, setReceivableTotal] = useState<number>(0);
  const [liabilityCount, setLiabilityCount] = useState<number>(0);
  const [receivableCount, setReceivableCount] = useState<number>(0);

  const formatCurrency = (value: any) =>
    `KES ${Number(value || 0).toLocaleString()}`;

  const loadDebts = useCallback(async () => {
    try {
      setLoading(true);
      await initDatabase();
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

  // Load debts when filters change or database updates
  useEffect(() => {
    loadDebts();

    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'DEBTS' || type === 'TRANSACTIONS') {
        loadDebts();
      }
    });

    return unsubscribe;
  }, [loadDebts]);

  // Load totals for both types based on status (ACTIVE or PAID)
  const loadTotals = useCallback(async () => {
    try {
      await initDatabase();
      const liabs = await debtService.getDebts('local_user', statusFilter, 'LIABILITY');
      const recs = await debtService.getDebts('local_user', statusFilter, 'RECEIVABLE');

      const sum = (rows: any[]) => rows.reduce((acc, r) => acc + (Number(r.current_balance || r.currentBalance || 0) + Number(r.accrued_fees || r.accruedFees || 0 || 0)), 0);

      setLiabilityTotal(sum(liabs));
      setReceivableTotal(sum(recs));
      setLiabilityCount(Array.isArray(liabs) ? liabs.length : 0);
      setReceivableCount(Array.isArray(recs) ? recs.length : 0);
    } catch (err) {
      console.error('Failed to load debt totals:', err);
      setLiabilityTotal(0);
      setReceivableTotal(0);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

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
    const projectedFinal = balance + (item.projectedInterest || 0);

    const originalAmount = item.isReducingBalance ? principal : principal + (principal * (item.interestRate || 0) / 100);
    const progress =
      originalAmount > 0
        ? Math.max(0, Math.min(((originalAmount - balance) / originalAmount) * 100, 100))
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
              {formatCurrency(projectedFinal > balance ? projectedFinal : balance)}
            </Text>
            {projectedFinal > balance && (
              <Text className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter -mt-1">
                Projected Total
              </Text>
            )}

            {!item.isRevolving && (
              <Text className="text-slate-400 text-xs text-right">
                of {formatCurrency(item.isReducingBalance ? principal : principal + (principal * (item.interestRate || 0) / 100))}
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
          <View className="px-6 mt-4 ">
            {/* Main Tabs (Active vs Paid) */}
            <View style={{ flexDirection: 'row', backgroundColor: '#e6edf3', padding: 2, borderRadius: 50, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              {(['ACTIVE', 'PAID'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={{ flex: 1, paddingVertical: 6, borderRadius: 50, backgroundColor: statusFilter === f ? '#ffffff' : 'transparent', alignItems: 'center' }}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text style={{ textAlign: 'center', fontWeight: '700', color: statusFilter === f ? '#0f172a' : '#94a3b8' }}>
                    {f === 'ACTIVE' ? 'Active' : 'History'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-4 mb-5">
              {/* Sub Tabs (Debts vs Assets) - Only show in ACTIVE view */}
              {statusFilter === 'ACTIVE' && (
                <View className="flex-col gap-4 mb-5">

                  {/* I Owe Card */}
                  <TouchableOpacity
                    onPress={() => setTypeFilter('LIABILITY')}
                    className={`rounded-2xl p-5 border shadow-sm ${typeFilter === 'LIABILITY'
                      ? 'bg-red-500 border-red-500'
                      : 'bg-white border-slate-200'
                      }`}
                  >
                    <Text className={`text-sm font-medium ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-500'}`} >
                      Total I Owe
                    </Text>

                    <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 8, color: typeFilter === 'LIABILITY' ? '#fff' : '#0f172a' }}>
                      {formatCurrency(liabilityTotal)}
                    </Text>

                    <Text className={`mt-2 text-sm ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-400'}`} >
                      {liabilityCount} {statusFilter === 'ACTIVE' ? 'active' : ''} {liabilityCount === 1 ? 'debt' : 'debts'}
                    </Text>
                  </TouchableOpacity>


                  {/* Owed To Me Card */}
                  <TouchableOpacity
                    onPress={() => setTypeFilter('RECEIVABLE')}
                    className={`rounded-2xl p-5 border shadow-sm ${typeFilter === 'RECEIVABLE'
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-slate-200'
                      }`}>
                    <Text className={`text-sm font-medium ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-500'}`}>
                      Total Owed To Me
                    </Text>

                    <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 8, color: typeFilter === 'RECEIVABLE' ? '#fff' : '#0f172a' }}>
                      {formatCurrency(receivableTotal)}
                    </Text>
                    <Text className={`mt-2 text-sm ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-400'}`}>
                      {receivableCount} {statusFilter === 'ACTIVE' ? (receivableCount === 1 ? 'person owes' : 'people owe') : 'past'} you
                    </Text>
                  </TouchableOpacity>

                </View>
              )}


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