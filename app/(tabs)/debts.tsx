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

  const handleToggleHistory = useCallback(() => {
    setStatusFilter((prev) => (prev === 'ACTIVE' ? 'PAID' : 'ACTIVE'));
  }, []);

  const renderItem = useCallback(({ item }: { item: Debt }) => {
    const principal = Number(item.principalAmount || 0);
    const balance =
      Number(item.currentBalance || 0) + Number(item.accruedFees || 0);
    const linkedPaymentCount = Number(item.linkedPaymentCount || 0);
    const linkedPaymentAmount = Number(item.linkedPaymentAmount || 0);

    const originalAmount = item.isReducingBalance ? principal : principal + (principal * (item.interestRate || 0) / 100);

    const dueDateFormatted =
      item.dueDate && !isNaN(new Date(item.dueDate).getTime())
        ? new Date(item.dueDate).toLocaleDateString()
        : null;

    const isLiability = item.type === 'LIABILITY' || item.type === 'OVERDRAFT';
    const mainColor = isLiability ? '#ef4444' : '#22c55e'; // Red vs Green

    if (statusFilter === 'PAID') {
      const settledAmount = Math.max(0, originalAmount);
      const createdDateLabel = item.createdAt && !isNaN(new Date(item.createdAt).getTime())
        ? new Date(item.createdAt).toLocaleDateString()
        : null;

      return (
        <TouchableOpacity
          className="app-card p-4 mb-3 mx-4"
          onPress={() => handleDebtPress(item.id)}
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-3">
              <Text className="text-slate-900 dark:text-white font-bold text-[15px]" numberOfLines={1}>
                {(item.name || '').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">
                {isLiability ? 'Liability' : 'Receivable'} • Settled
              </Text>
              {createdDateLabel && (
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                  Created {createdDateLabel}
                </Text>
              )}
            </View>

            <View className="items-end">
              <Text className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-[0.8px]">
                Paid
              </Text>
              <Text className="text-slate-900 dark:text-white font-black text-[14px] mt-1">
                {formatCurrency(settledAmount)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const outstandingAmount = Math.max(0, balance);
    const paidAmount = linkedPaymentCount > 0
      ? Math.max(0, linkedPaymentAmount)
      : 0;

    return (
      <TouchableOpacity
        className="app-card p-4 mb-3 mx-4"
        onPress={() => handleDebtPress(item.id)}
      >
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-3">
            <View className="flex-row items-start justify-between">
              <Text className="text-slate-900 dark:text-white font-bold text-[15px] flex-1 pr-2" numberOfLines={1}>
                {(item.name || '').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </Text>
              {item.type !== 'OVERDRAFT' && (
                <TouchableOpacity
                  className="w-6 h-6 rounded-full items-center justify-center"
                  onPress={(event) => {
                    event.stopPropagation();
                    handleEditDebt(item.id);
                  }}
                >
                  <FontAwesome name="pencil" size={11} color={mainColor} />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">
              {isLiability ? 'Liability' : 'Receivable'} • Active
            </Text>
            {dueDateFormatted && (
              <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                Due {dueDateFormatted}
              </Text>
            )}
            {linkedPaymentCount > 0 ? (
              <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                Linked {formatCurrency(paidAmount)}
              </Text>
            ) : (
              <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                No payments yet
              </Text>
            )}
          </View>

          <View className="items-end">
            <Text style={{ color: mainColor }} className="text-[10px] font-bold uppercase tracking-[0.8px]">
              Outstanding
            </Text>
            <Text style={{ color: mainColor }} className="font-black text-[14px] mt-1">
              {formatCurrency(outstandingAmount)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [handleDebtPress, handleEditDebt, statusFilter]);

  return (
    <View
      className="flex-1 app-screen"
      style={{ paddingTop: insets.top }}
    >
      <View className="px-4 py-3 flex-row justify-between items-center bg-white dark:bg-[#0f172a] border-b border-slate-100 dark:border-slate-800">
        <View>
          <Text className="text-base font-bold text-slate-900 dark:text-white">
            Debts
          </Text>
          <Text className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {statusFilter === 'PAID'
              ? 'History view'
              : typeFilter === 'LIABILITY'
                ? 'Liabilities view'
                : 'Receivables view'}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={handleToggleHistory}
            className={`w-9 h-9 rounded-full items-center justify-center border ${
              statusFilter === 'PAID'
                ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <FontAwesome
              name="history"
              size={14}
              color={statusFilter === 'PAID' ? (colorScheme === 'dark' ? '#0f172a' : '#ffffff') : (colorScheme === 'dark' ? '#cbd5e1' : '#475569')}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAddDebt}
            className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-full items-center justify-center border border-blue-100 dark:border-blue-800"
          >
            <Image
              source={require('../../assets/svg/plus.svg')}
              style={{ width: 16, height: 16 }}
              tintColor={colorScheme === 'dark' ? '#bfdbfe' : '#2563eb'}
              contentFit="contain"
            />
          </TouchableOpacity>
        </View>
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
          <View className="px-4 mt-4">
            {statusFilter === 'ACTIVE' && (
              <>
                <View className="mb-4">
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.8px] text-slate-400 mb-2 px-1">
                    Summary
                  </Text>
                  <View className="flex-row">
                    {liabilityCount > 0 && (
                      <TouchableOpacity
                        onPress={() => setTypeFilter('LIABILITY')}
                        activeOpacity={0.7}
                        className={`flex-1 p-3 rounded-xl border ${typeFilter === 'LIABILITY' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-white dark:bg-[#1e293b] border-slate-200 dark:border-slate-700'}`}
                      >
                        <Text className="text-[10px] uppercase font-bold tracking-[0.8px] text-slate-400 mb-1">Liabilities</Text>
                        <Text className="text-slate-900 dark:text-white font-black text-[15px]">{formatCurrency(liabilityTotal)}</Text>
                        <Text className="text-[10px] text-slate-400 mt-1">{liabilityCount} active</Text>
                      </TouchableOpacity>
                    )}

                    {liabilityCount > 0 && receivableCount > 0 && (
                      <View className="w-3" />
                    )}

                    {receivableCount > 0 && (
                      <TouchableOpacity
                        onPress={() => setTypeFilter('RECEIVABLE')}
                        activeOpacity={0.7}
                        className={`flex-1 p-3 rounded-xl border ${typeFilter === 'RECEIVABLE' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-white dark:bg-[#1e293b] border-slate-200 dark:border-slate-700'}`}
                      >
                        <Text className="text-[10px] uppercase font-bold tracking-[0.8px] text-slate-400 mb-1">Receivables</Text>
                        <Text className="text-slate-900 dark:text-white font-black text-[15px]">{formatCurrency(receivableTotal)}</Text>
                        <Text className="text-[10px] text-slate-400 mt-1">{receivableCount} active</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {liabilityCount === 0 && receivableCount === 0 && (
                  <View className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl w-full items-center justify-center py-7 px-4 mb-4">
                    <Text className="text-slate-700 dark:text-white font-semibold text-sm text-center">
                      No active debts or receivables
                    </Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center">
                      Tap + to add one
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
