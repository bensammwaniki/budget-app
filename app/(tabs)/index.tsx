import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import CategorizationModal from '../../components/CategorizationModal';
import { SAMPLE_SMS_MESSAGES } from '../../data/sampleTransactions';
import { useAuth } from '../../services/AuthContext';
import { getRecipientCategory, getSpendingSummary, getTransactions, initDatabase, saveRecipientCategory, saveTransaction, updateTransactionCategory } from '../../services/database';
import { readMpesaSMS, requestSMSPermission } from '../../services/smsService';
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
  const [uncategorizedQueue, setUncategorizedQueue] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Derived state: Use selectedTransaction if set (Edit Mode), otherwise check queue (Queue Mode)
  const activeTransaction = selectedTransaction || (uncategorizedQueue.length > 0 ? uncategorizedQueue[0] : null);

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
    // Try to read real SMS first (Android only)
    let messages = SAMPLE_SMS_MESSAGES;

    if (Platform.OS === 'android') {
      try {
        const realSMS = await readMpesaSMS();
        if (realSMS.length > 0) {
          console.log(`Using ${realSMS.length} real M-PESA messages`);
          messages = realSMS;
        } else {
          console.log('No real SMS found, using sample messages');
        }
      } catch (error) {
        console.log('Failed to read SMS, using sample messages:', error);
      }
    }

    for (const sms of messages) {
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

    // Check for ALL uncategorized transactions (both SENT and RECEIVED)
    const uncategorized = txs.filter(t => !t.categoryId);
    if (uncategorized.length > 0) {
      setUncategorizedQueue(uncategorized);
      setModalVisible(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setModalVisible(false); // Close modal during refresh
    try {
      // Import clearDatabase dynamically to avoid circular dependency
      const { clearDatabase } = await import('../../services/database');

      // Clear all database tables
      await clearDatabase();

      // Reinitialize everything fresh
      await initDatabase();
      await processSampleMessages();
      await loadDashboardData();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTransactionPress = (tx: Transaction) => {
    // Allow categorizing both SENT and RECEIVED transactions
    setSelectedTransaction(tx);
    setModalVisible(true);
  };

  const handleCategorySelect = async (categoryId: number) => {
    if (activeTransaction) {
      // 1. Update the mapping for future transactions
      await saveRecipientCategory(activeTransaction.recipientId, categoryId);

      // 2. Update the specific transaction (important for Edit Mode)
      // For Queue Mode, saveTransaction already handled the insert, but we need to update if we're "fixing" it.
      // Actually, saveRecipientCategory updates NULL categories, but if we are editing an EXISTING category, we need explicit update.
      await updateTransactionCategory(activeTransaction.id, categoryId);

      if (selectedTransaction) {
        // EDIT MODE: Close modal and clear selection
        setModalVisible(false);
        setSelectedTransaction(null);
        await loadDashboardData();
      } else {
        // QUEUE MODE: Remove processed item
        const newQueue = uncategorizedQueue.slice(1);
        setUncategorizedQueue(newQueue);

        if (newQueue.length === 0) {
          setModalVisible(false);
          await loadDashboardData();
        }
        // If more items, modal stays open with next item
      }
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedTransaction(null);
    // Note: Closing modal in Queue Mode skips the current item for now
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
        transaction={activeTransaction}
        onCategorySelect={handleCategorySelect}
        onClose={handleCloseModal}
      />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg shadow-black/50">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-slate-400 text-sm font-medium">Welcome back,</Text>
            <Text className="text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
          {Platform.OS === 'android' && (
            <TouchableOpacity
              className="bg-blue-600 px-4 py-2 rounded-full"
              onPress={async () => {
                const granted = await requestSMSPermission();
                if (granted) {
                  Alert.alert('Success', 'SMS permission granted! Pull down to refresh and load your M-PESA messages.');
                } else {
                  Alert.alert('Permission Denied', 'SMS permission is required to read M-PESA messages.');
                }
              }}
            >
              <Text className="text-white text-xs font-bold">Enable SMS</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Balance Card */}
        <View className="bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-900/40 overflow-hidden relative">
          {/* Background decoration */}
          <View className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/30 rounded-full blur-2xl" />
          <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-2xl" />

          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <View className="bg-green-500/20 px-2 py-1 rounded-lg">
              <Text className="text-green-200 text-xs font-medium">
                Income: KES {spending?.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </Text>
            </View>
          </View>
          <Text className="text-white text-4xl font-bold mb-2">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View className="flex-row items-center mb-6">
            <View className="bg-red-500/20 px-2 py-1 rounded-lg">
              <Text className="text-red-200 text-xs font-medium">
                Transaction cost: KES {spending?.monthlyTransactionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </Text>
            </View>
          </View>

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
          <Text className="text-white text-lg font-bold">Recent Spendings</Text>
        </View>

        <View className="gap-4">
          {transactions.map((tx) => (
            <TouchableOpacity
              key={tx.id}
              className="flex-row items-center bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-sm active:bg-slate-800"
              onPress={() => handleTransactionPress(tx)}
            >
              <View className="w-12 h-12 rounded-full bg-[#0f172a] items-center justify-center mr-4 border border-slate-700">
                <FontAwesome
                  name={(tx.categoryIcon as any) || (tx.type === 'RECEIVED' ? 'arrow-down' : 'shopping-cart')}
                  size={18}
                  color={tx.categoryColor || (tx.type === 'RECEIVED' ? '#4ade80' : '#94a3b8')}
                />
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold text-base" numberOfLines={1}>{tx.recipientName}</Text>
                <View className="flex-row items-center mt-0.5">
                  {tx.categoryName && (
                    <Text className="text-xs font-medium mr-2" style={{ color: tx.categoryColor }}>
                      {tx.categoryName}
                    </Text>
                  )}
                  <Text className="text-slate-500 text-xs">
                    {tx.date.toLocaleDateString()} • {tx.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
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
