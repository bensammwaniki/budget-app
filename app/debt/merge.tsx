import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { debtService } from '../../services/debtService';
import { Debt } from '../../types/debt';

export default function MergeDebtScreen() {
  const router = useRouter();
  const { sourceId } = useLocalSearchParams<{ sourceId?: string }>();
  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [mergingId, setMergingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await debtService.getDebts('local_user', 'ACTIVE');
        setDebts(items.filter((debt) => debt.id !== sourceId));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sourceId]);

  const handleMerge = (target: Debt) => {
    if (!sourceId) return;

    Alert.alert(
      'Merge debts',
      `Move the balance and linked payments from "${target.name}" into the selected debt? This will delete "${target.name}" after merging.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            try {
              setMergingId(target.id);
              await debtService.mergeDebts({
                sourceDebtId: target.id,
                targetDebtId: sourceId,
              });
              router.back();
            } catch (error: any) {
              Alert.alert('Merge failed', error?.message || 'Could not merge debts');
            } finally {
              setMergingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-[#020617]">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-[#020617] px-5 pt-14">
      <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Merge debts</Text>
      <Text className="text-slate-500 dark:text-slate-400 mb-5">
        Pick the debt to absorb into the current one. We’ll move linked payments and transactions across.
      </Text>

      <FlatList
        data={debts}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View className="py-10">
            <Text className="text-slate-500 dark:text-slate-400">No other active debts to merge.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleMerge(item)}
            disabled={mergingId === item.id}
            className="bg-white dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 rounded-[12px] p-4 mb-3"
          >
            <View className="flex-row justify-between items-center">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-slate-900 dark:text-white">{item.name}</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-sm">
                  KES {item.currentBalance.toLocaleString()} remaining
                </Text>
              </View>
              <Text className="text-blue-500 font-semibold">
                {mergingId === item.id ? 'Merging…' : 'Merge'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        onPress={() => router.back()}
        className="py-4 items-center"
      >
        <Text className="text-slate-500 dark:text-slate-400 font-semibold">Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
