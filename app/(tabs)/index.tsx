import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import CategorizationModal from '../../components/CategorizationModal';
import { SAMPLE_SMS_MESSAGES } from '../../data/sampleTransactions';
import { useAuth } from '../../services/AuthContext';
import { getRecipientCategory, getSpendingSummary, getTransactions, initDatabase, saveRecipientCategory, saveTransaction } from '../../services/database';
import { SpendingSummary, Transaction } from '../../types/transaction';
import { parseMpesaSms } from '../../utils/smsParser';

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Categorization State
  const [modalVisible, setModalVisible] = useState(false);
  const [currentUncategorized, setCurrentUncategorized] = useState<Transaction | null>(null);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      await initDatabase();
      await processSampleMessages();
      await loadDashboardData();
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processSampleMessages = async () => {
    for (const sms of SAMPLE_SMS_MESSAGES) {
      const transaction = parseMpesaSms(sms);
      if (transaction) {
        // Check if we have a saved category for this recipient
        const savedCategoryId = await getRecipientCategory(transaction.recipientId);
        if (savedCategoryId) {
          transaction.categoryId = savedCategoryId;
        }
        await saveTransaction(transaction);
      }
    }
  };

  const loadDashboardData = async () => {
    const txs = await getTransactions();
    const summary = await getSpendingSummary();
    setTransactions(txs);
    setSpending(summary);

    // Check for uncategorized transactions
    const uncategorized = txs.find(t => !t.categoryId && t.type === 'SENT');
    if (uncategorized) {
      setCurrentUncategorized(uncategorized);
      setModalVisible(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await processSampleMessages(); // Re-process to simulate new messages or updates
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleCategorySelect = async (categoryId: number) => {
    if (currentUncategorized) {
      await saveRecipientCategory(currentUncategorized.recipientId, categoryId);
      setModalVisible(false);
      setCurrentUncategorized(null);
      await loadDashboardData(); // Reload to reflect changes
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#020617] items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#020617]"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}
    >
      <StatusBar style="light" />
      <CategorizationModal
        visible={modalVisible}
        transaction={currentUncategorized}
        onCategorySelect={handleCategorySelect}
        onClose={() => setModalVisible(false)}
      />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg shadow-black/50">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-slate-400 text-sm font-medium">Welcome back,</Text>
            <Text className="text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
          <TouchableOpacity className="w-12 h-12 bg-[#1e293b] rounded-full items-center justify-center border border-slate-700">
            <FontAwesome name="bell" size={20} color="#94a3b8" />
            <View className="absolute top-3 right-3.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1e293b]" />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View className="bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-900/40 overflow-hidden relative">
          {/* Background decoration */}
          <View className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/30 rounded-full blur-2xl" />
          <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-2xl" />

          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <FontAwesome name="eye" size={16} color="#bfdbfe" />
          </View>
          <Text className="text-white text-4xl font-bold mb-6">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>

          <View className="flex-row justify-between gap-3">
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">Today</Text>
              <Text className="text-white font-bold">KES {spending?.dailyTotal.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">This Week</Text>
              <Text className="text-white font-bold">KES {spending?.weeklyTotal.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">This Month</Text>
              <Text className="text-white font-bold">KES {spending?.monthlyTotal.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      </View>



      {/* Recent Transactions */}
      <View className="px-6 mt-8 mb-8">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-white text-lg font-bold">Recent Transactions</Text>
          <TouchableOpacity>
            <Text className="text-blue-400 font-semibold">See All</Text>
          </TouchableOpacity>
        </View>

        <View className="gap-4">
          {transactions.map((tx) => (
            <TouchableOpacity key={tx.id} className="flex-row items-center bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-sm">
              <View className="w-12 h-12 rounded-full bg-[#0f172a] items-center justify-center mr-4 border border-slate-700">
                <FontAwesome
                  name={tx.type === 'RECEIVED' ? 'arrow-down' : 'shopping-cart'}
                  size={18}
                  color={tx.type === 'RECEIVED' ? '#4ade80' : '#94a3b8'}
                />
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold text-base" numberOfLines={1}>{tx.recipientName}</Text>
                <Text className="text-slate-500 text-xs mt-0.5">
                  {tx.date.toLocaleDateString()} • {tx.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text className={`font-bold ${tx.type === 'RECEIVED' ? 'text-green-400' : 'text-white'}`}>
                {tx.type === 'RECEIVED' ? '+' : '-'} KES {tx.amount.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}

          {transactions.length === 0 && (
            <View className="bg-[#1e293b] rounded-2xl p-8 items-center border border-slate-800 border-dashed">
              <Text className="text-slate-500">No transactions found</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
