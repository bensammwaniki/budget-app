import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
// navigation will be imported dynamically in handlers to avoid requiring navigation context at render
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  RefreshControl,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  // Show tab bar when screen mounts
  useEffect(() => {
    showTabBar();
  }, [showTabBar]);

  // Load debts when filters change or database updates
  useEffect(() => {
    loadDebts();

    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'DEBTS' || type === 'TRANSACTIONS') {
        InteractionManager.runAfterInteractions(() => {
          loadDebts();
          loadTotals(); // also refresh totals on database changes
        });
      }
    });

    return unsubscribe;
  }, [loadDebts, loadTotals]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDebts();
  }, [loadDebts]);

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

  const handleEditDebt = useCallback((debtId: string) => {
    import('expo-router').then(({ router }) => {
      try {
        router.push({ pathname: '/debt/add', params: { editId: debtId } });
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
    const clampedProgress = Math.max(0, Math.min(progress, 100));
    const ringSize = 44;
    const strokeWidth = 2.5;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

    return (
      <TouchableOpacity
        className="app-card p-3 mb-4 mx-4 overflow-hidden"
        onPress={() => handleDebtPress(item.id)}
      >
        <View
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: mainColor }}
        />

        <View className="flex-row justify-between items-start mb-1.5">
          <View className="flex-row items-start gap-2.5 flex-1 pr-2.5">
            <View style={{ width: ringSize, height: ringSize }} className="items-center justify-center">
              {!item.isRevolving && (
                <Svg width={ringSize} height={ringSize} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    stroke={colorScheme === 'dark' ? '#334155' : '#e2e8f0'}
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    stroke={mainColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference}, ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                  />
                </Svg>
              )}
              <View className={`w-9 h-9 rounded-full items-center justify-center ${bgColor}`}>
                <FontAwesome
                  name={
                    item.type === 'OVERDRAFT'
                      ? 'warning'
                      : item.name?.toLowerCase().includes('bank')
                        ? 'bank'
                        : isLiability ? 'money' : 'arrow-circle-down'
                  }
                  size={15}
                  color={mainColor}
                />
              </View>
            </View>

            <View className="flex-1">
              <View className="flex-row items-center flex-wrap gap-1">
                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-[1px]">
                  {isLiability ? 'Borrowed From' : 'Owed By'}
                </Text>
                {item.interestRate !== undefined && item.interestRate !== null && (
                  <Text className="text-slate-400 text-[10px] font-medium">
                    {item.interestRate}% {item.isRevolving ? 'Revolving' : item.isReducingBalance ? 'Reducing' : 'Flat Interest'}
                  </Text>
                )}
                {item.interestRate === undefined || item.interestRate === null ? (
                  <Text className="text-slate-400 text-[10px] font-medium">
                    {item.isRevolving ? 'Revolving' : item.isReducingBalance ? 'Reducing' : 'Flat Interest'}
                  </Text>
                ) : null}
              </View>
              <Text className="text-slate-900 dark:text-white font-black text-[15px] mt-0.5" numberOfLines={1}>
                {(item.name || '').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </Text>
            </View>
          </View>

          <View className="items-end">
            {item.type !== 'OVERDRAFT' && (
              <TouchableOpacity
                className="w-7 h-7 rounded-full items-center justify-center mb-5"
                onPress={(event) => {
                  event.stopPropagation();
                  handleEditDebt(item.id);
                }}
              >
                <FontAwesome name="pencil" size={12} color={mainColor} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View className="flex-row flex-wrap gap-1.5 mb-1">
          {dueDateFormatted && (
            <View className="app-pill">
              <Text className="app-pill-text">Due {dueDateFormatted}</Text>
            </View>
          )}
        </View>

        <View className="flex-row justify-between items-end gap-3">
          <View className="flex-row items-center flex-wrap gap-1 ml-[5px] flex-1">
            <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Paid:
            </Text>
            <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
              {formatCurrency(Math.max(0, originalAmount - balance))}
            </Text>
            {!item.isRevolving && (
              <>
                <Text className="text-[10px] text-slate-400 dark:text-slate-500">•</Text>
                <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Progress:
                </Text>
                <Text style={{ color: mainColor }} className="text-[10px] font-semibold">
                  {progress.toFixed(1)}%
                </Text>
              </>
            )}
          </View>
          <View className="items-end">
            <Text className="font-black text-base" style={{ color: mainColor }}>
              {formatCurrency(projectedFinal > balance ? projectedFinal : balance)}
            </Text>
            <Text className="text-slate-400 text-[10px] text-right mt-0.5">
              {projectedFinal > balance ? 'Projected total' : `Original ${formatCurrency(originalAmount)}`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [handleDebtPress, handleEditDebt, colorScheme]);

  return (
    <View
      className="flex-1 app-screen"
      style={{ paddingTop: insets.top }}
    >
      <View className="px-4 py-4 flex-row justify-between items-center bg-white dark:bg-[#0f172a] border-b border-slate-100 dark:border-slate-800">
        <Text className="text-l font-bold text-slate-900 dark:text-white">
          {typeFilter === 'LIABILITY' ? 'My Debts' : 'All my Loans and Receivables'}
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
          <View className="px-4 mt-4 ">
            {/* Main Tabs (Active vs Paid) */}
            <View className="flex-row bg-slate-200 dark:bg-slate-800 p-0.5 rounded-full mb-4">
              {(['ACTIVE', 'PAID'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  className={`flex-1 py-1.5 rounded-full items-center ${statusFilter === f ? 'bg-white dark:bg-slate-700 shadow-sm' : 'bg-transparent'}`}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text className={`text-center font-bold ${statusFilter === f ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {f === 'ACTIVE' ? 'Active' : 'History'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {statusFilter === 'ACTIVE' && (
              <>
                <View className="flex-row gap-3 mb-4">
                  {liabilityCount > 0 && (
                    <TouchableOpacity
                      onPress={() => setTypeFilter('LIABILITY')}
                      className={`flex-1 rounded-[16px] p-4 overflow-hidden relative ${typeFilter === 'LIABILITY'
                        ? 'bg-red-500'
                        : 'bg-white dark:bg-[#0f172a]'
                        }`}
                    >
                      <View className="absolute right-[-10] top-[-10] opacity-10">
                        <FontAwesome name="warning" size={72} color={typeFilter === 'LIABILITY' ? '#fff' : '#ef4444'} />
                      </View>
                      <Text className={`text-[10px] font-bold uppercase tracking-[1px] ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        Debt Overview
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '900', marginTop: 8, color: typeFilter === 'LIABILITY' ? '#fff' : '#0f172a' }}>
                        {formatCurrency(liabilityTotal)}
                      </Text>
                      <Text className={`mt-3 text-[11px] ${typeFilter === 'LIABILITY' ? 'text-red-100' : 'text-slate-400'}`}>
                        {liabilityCount} {liabilityCount === 1 ? 'debt' : 'debts'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {receivableCount > 0 && (
                    <TouchableOpacity
                      onPress={() => setTypeFilter('RECEIVABLE')}
                      className={`flex-1 rounded-[16px] p-4 overflow-hidden relative ${typeFilter === 'RECEIVABLE'
                        ? 'bg-green-500'
                        : 'bg-white dark:bg-[#0f172a]'
                        }`}
                    >
                      <View className="absolute right-[-10] top-[-10] opacity-10">
                        <FontAwesome name="arrow-circle-down" size={72} color={typeFilter === 'RECEIVABLE' ? '#fff' : '#22c55e'} />
                      </View>
                      <Text className={`text-[10px] font-bold uppercase tracking-[1px] ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        Receivables Overview
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '900', marginTop: 8, color: typeFilter === 'RECEIVABLE' ? '#fff' : '#0f172a' }}>
                        {formatCurrency(receivableTotal)}
                      </Text>
                      <Text className={`mt-3 text-[11px] ${typeFilter === 'RECEIVABLE' ? 'text-green-100' : 'text-slate-400'}`}>
                        {receivableCount} {receivableCount === 1 ? 'person owes' : 'people owe'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {liabilityCount === 0 && receivableCount === 0 && (
                  <View className="app-card-muted w-full items-center justify-center py-8 px-4 mb-4">
                    <FontAwesome name="inbox" size={36} color="#cbd5e1" />
                    <Text className="text-slate-700 dark:text-white font-bold text-base mt-4 text-center">
                      No active receivables or liabilities
                    </Text>
                    <Text className="text-slate-400 text-sm mt-1 text-center">
                      Press the{' '}
                      <Text className="font-bold text-blue-500">+</Text>
                      {' '}button to add a debt or loan.
                    </Text>
                  </View>
                )}

              </>
            )}

          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-10 px-10">
              <Text className="text-slate-400 text-center">
                {statusFilter === 'ACTIVE'
                  ? `You have no active ${typeFilter === 'LIABILITY' ? 'debts' : 'receivables'}.`
                  : `No paid ${typeFilter === 'LIABILITY' ? 'debts' : 'receivables'} found.`}
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
