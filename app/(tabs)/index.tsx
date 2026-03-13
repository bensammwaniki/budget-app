import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import CategorizationModal from '../../components/CategorizationModal';
import { TransactionSkeleton } from '../../components/SkeletonLoader';
import TransactionItem from '../../components/TransactionItem';
import { useAlert } from '../../context/AlertContext';
import { useTransactions } from '../../hooks/useDatabase';
import { useAuth } from '../../services/AuthContext';
import {
  getUserSettings,
  initDatabase,
  saveRecipientCategory,
  subscribeToDatabaseChanges,
  updateTransactionCategory,
  updateTransactionCategoryByScope,
  updateTransactionDate
} from '../../services/database';
import { debtService } from '../../services/debtService';
import { IncomeLog, IncomeSource, incomeService } from '../../services/incomeService';
import { ledgerService } from '../../services/ledgerService';
import { SavingsGoal, savingsService } from '../../services/savingsService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { syncMessages } from '../../services/smsService';
import { Category, Transaction } from '../../types/transaction';
// calculateFulizaDailyCharge removed - now handled in debt detail if needed

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST 3 MONTHS' | 'CURRENT YEAR' | 'ALL TIME';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const firstName = user?.displayName?.split(' ')[0] || 'User';
  const { showTabBar, hideTabBar } = useScrollVisibility();
  const lastScrollY = useSharedValue(0);

  // Use Reactive Hooks
  const { transactions: allTransactions } = useTransactions();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');
  const [refreshing, setRefreshing] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20); // Smaller initial limit for better fast-load
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [financialMonthStart, setFinancialMonthStart] = useState(1);
  const [imBankEnabled, setImBankEnabled] = useState(false);
  const [logs, setLogs] = useState<IncomeLog[]>([]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const openingCashModalRef = useRef(false);
  const [cashType, setCashType] = useState<'SENT' | 'RECEIVED'>('SENT');
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [savingCashTx, setSavingCashTx] = useState(false);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Categorization State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [debtSummary, setDebtSummary] = useState<{
    totalLiabilities: number;
    totalReceivables: number;
    netDebt: number;
    activeDebts: number;
  } | null>(null);
  const [dbReady, setDbReady] = useState(false);

  // Linking to Savings State
  const [savingsModalVisible, setSavingsModalVisible] = useState(false);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [linkingGoal, setLinkingGoal] = useState<string | null>(null);

  // Linking to Income State
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [linkingIncome, setLinkingIncome] = useState<string | null>(null);

  // Re-categorization Scope State
  const [scopeModalVisible, setScopeModalVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<Category | null>(null);

  const { showAlert } = useAlert();
  const activeTransaction = selectedTransaction;


  // Load bank settings and subscribe to changes
  useEffect(() => {
    if (!dbReady) return;

    const loadBankSettings = async () => {
      try {
        const enabled = await getUserSettings('bank_im_enabled');
        setImBankEnabled(enabled === 'true');
      } catch (error) {
        console.error('Error loading bank settings:', error);
      }
    };

    loadBankSettings();

    // Subscribe to settings changes so we update when user toggles banks
    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'SETTINGS') {
        loadBankSettings();
      }
    });

    return unsubscribe;
  }, [dbReady]);

  // Load debt summary
  useEffect(() => {
    if (!dbReady) return;

    const loadDebtSummary = async () => {
      try {
        const summary = await debtService.getDebtSummary('local_user');
        setDebtSummary(summary);
      } catch (error) {
        console.error('Error loading debt summary:', error);
      }
    };

    loadDebtSummary();

    // Subscribe to transaction/debt/savings changes to refresh debt summary
    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'TRANSACTIONS' || type === 'DEBTS' || type === 'SAVINGS' || type === 'INCOME_LOGS' || type === 'INCOME_SOURCES') {
        loadDebtSummary();
      }
    });

    return unsubscribe;
  }, [dbReady]);

  // Load income logs
  useEffect(() => {
    if (!dbReady) return;

    const loadIncomeLogs = async () => {
      try {
        const fetchedLogs = await incomeService.getLogs();
        setLogs(fetchedLogs);
      } catch (error) {
        console.error('Error loading income logs:', error);
      }
    };

    loadIncomeLogs();

    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'INCOME_LOGS' || type === 'INCOME_SOURCES' || type === 'TRANSACTIONS') {
        loadIncomeLogs();
      }
    });

    return unsubscribe;
  }, [dbReady]);

  useEffect(() => {
    const runProgressiveSync = async () => {
      try {
        setIsSyncing(true);
        setDbReady(true);

        const startDay = await getUserSettings('financial_month_start_day');
        if (startDay) setFinancialMonthStart(parseInt(startDay, 10));

        const lastSync = await getUserSettings('last_sync_timestamp');

        if (!lastSync) {
          // FIRST LAUNCH: Quick 30-day sync to show data fast
          console.log('🚀 First launch: Starting Quick Start sync (30 days)...');
          await syncMessages(30);
          await debtService.updateFulizaFees();

          // Then deep sync in background (1 year)
          console.log('⏳ Quick start complete. Starting Background Deep Sync (366 days)...');
          syncMessages(366).then(() => {
            console.log('✅ Deep sync complete.');
            debtService.updateFulizaFees();
            setIsSyncing(false);
          }).catch(err => {
            console.error('Deep sync error:', err);
            setIsSyncing(false);
          });
        } else {
          // SUBSEQUENT LAUNCHES: Only sync SMS newer than last sync timestamp
          // syncMessages already uses last_sync_timestamp to compute the gap — avoids re-parsing old messages
          await initDatabase();
          await debtService.updateFulizaFees();

          // Run incremental sync silently in background (only new SMS since last sync)
          syncMessages().then(() => {
            debtService.updateFulizaFees();
          }).catch(err => {
            console.error('Incremental sync error:', err);
          }).finally(() => {
            setIsSyncing(false);
          });
        }
      } catch (error) {
        console.error('Error in progressive sync:', error);
        setIsSyncing(false);
      }
    };
    runProgressiveSync();
  }, []);


  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await syncMessages(30); // Full monthly sync on manual refresh
      await debtService.updateFulizaFees();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const resetCashForm = () => {
    setCashType('SENT');
    setCashAmount('');
    setCashNote('');
  };

  const handleSaveCashTransaction = async () => {
    const amount = parseFloat(cashAmount.replace(/,/g, '').trim());
    if (!amount || amount <= 0) {
      showAlert({
        title: 'Invalid Amount',
        message: 'Enter a valid amount greater than 0.',
        type: 'error',
        buttons: [{ text: 'OK', style: 'cancel' }],
      });
      return;
    }

    const recipient = cashNote.trim() || (cashType === 'SENT' ? 'Cash expense' : 'Cash income');

    setSavingCashTx(true);
    try {
      await ledgerService.recordTransaction({
        accountId: 'ACC-CASH-DEFAULT',
        amount,
        type: cashType,
        kind: cashType === 'SENT' ? 'EXPENSE' : 'INCOME',
        date: new Date(),
        recipientName: recipient,
        rawSms: `Manual cash ${cashType === 'SENT' ? 'expense' : 'income'} entry`,
        userId: 'local_user',
      });

      setCashModalVisible(false);
      resetCashForm();
      showAlert({
        title: 'Saved',
        message: 'Cash transaction added successfully.',
        type: 'success',
        buttons: [{ text: 'OK' }],
      });
    } catch (error: any) {
      showAlert({
        title: 'Save Failed',
        message: error?.message || 'Could not save cash transaction.',
        type: 'error',
        buttons: [{ text: 'OK', style: 'cancel' }],
      });
    } finally {
      setSavingCashTx(false);
    }
  };

  // Calculate date boundaries once
  const dateRange = useMemo(() => {
    const now = new Date();
    const startDay = financialMonthStart;

    let startOfThisMonth: Date;
    if (now.getDate() >= startDay) {
      startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), startDay);
    } else {
      startOfThisMonth = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
    }

    const startOfLastMonth = new Date(startOfThisMonth.getFullYear(), startOfThisMonth.getMonth() - 1, startDay);
    const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);

    const startOfCurrentYear = new Date(now.getFullYear(), 0, 1);
    const startOfLast3Months = new Date(startOfThisMonth.getFullYear(), startOfThisMonth.getMonth() - 2, startDay);

    return { startOfThisMonth, startOfLastMonth, endOfLastMonth, startOfCurrentYear, startOfLast3Months };
  }, [financialMonthStart]);

  // Calculate carried forward balance (from previous financial month)
  const carriedForwardBalance = useMemo(() => {
    const { startOfLastMonth, endOfLastMonth } = dateRange;

    const lastMonthTransactions = allTransactions.filter(t => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      return txDate >= startOfLastMonth && txDate <= endOfLastMonth && !t.isDeleted;
    });

    const income = lastMonthTransactions
      .filter(t => t.type === 'RECEIVED')
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = lastMonthTransactions
      .filter(t => t.type === 'SENT')
      .reduce((sum, t) => sum + t.amount, 0);

    return income - expense;
  }, [allTransactions, dateRange]);

  const carriedForwardPeriodLabel = useMemo(() => {
    const { endOfLastMonth } = dateRange;
    return endOfLastMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [dateRange]);

  // Filter transactions based on selected period AND bank settings
  const filteredTransactions = useMemo(() => {
    let filtered = allTransactions.filter((t: Transaction) => {
      // Filter out bank transactions if bank is disabled
      const isBankTransaction = t.id.startsWith('IM_');

      if (isBankTransaction && !imBankEnabled) {
        return false; // Hide bank transactions when bank is disabled
      }

      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;

      const { startOfThisMonth, startOfLastMonth, endOfLastMonth, startOfCurrentYear, startOfLast3Months } = dateRange;

      if (selectedPeriod === 'THIS_MONTH') {
        return txDate >= startOfThisMonth;
      } else if (selectedPeriod === 'LAST_MONTH') {
        return txDate >= startOfLastMonth && txDate <= endOfLastMonth;
      } else if (selectedPeriod === 'LAST 3 MONTHS') {
        return txDate >= startOfLast3Months;
      } else if (selectedPeriod === 'CURRENT YEAR') {
        return txDate >= startOfCurrentYear;
      }
      return true; // 'ALL TIME' or unmatched falls through
    });

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((t) => {
        const recipient = (t.recipientName || '').toLowerCase();
        const categoryName = (t.categoryName || '').toLowerCase();
        const categoryType = t.type === 'SENT' ? 'expense' : 'income';
        const kind = (t.transactionKind || '').toLowerCase().replace(/_/g, ' ');
        const amount = t.amount.toString();
        const account = `${t.accountName || ''} ${t.accountType || ''}`.toLowerCase();
        const categoryId = t.categoryId ? String(t.categoryId) : '';

        return (
          recipient.includes(q) ||
          amount.includes(q) ||
          categoryName.includes(q) ||
          categoryType.includes(q) ||
          kind.includes(q) ||
          account.includes(q) ||
          categoryId.includes(q)
        );
      });
    }

    // Debug: Count bank transactions
    const bankTransactions = filtered.filter(t => t.id.startsWith('IM_'));

    // Show sample IDs to verify what's in the database
    const sampleIds = allTransactions.slice(0, 10).map(t => t.id);
    console.log(`📊 Total transactions: ${allTransactions.length}, Filtered: ${filtered.length}, Bank: ${bankTransactions.length}`);
    console.log(`🔍 Sample transaction IDs:`, sampleIds);
    if (bankTransactions.length > 0) {
      console.log(`🏦 Bank transaction IDs:`, bankTransactions.map(t => t.id));
    }

    return filtered;
  }, [allTransactions, selectedPeriod, dateRange, imBankEnabled, searchQuery]);

  // Calculate summary statistics for the selected period
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cost = 0;

    const { startOfThisMonth, startOfLastMonth, endOfLastMonth, startOfCurrentYear, startOfLast3Months } = dateRange;

    // Calculate income from explicit Income logs based on the selected period
    logs.forEach((l) => {
      const logDate = new Date(l.receivedAt);
      let isInPeriod = false;

      if (selectedPeriod === 'THIS_MONTH') {
        isInPeriod = logDate >= startOfThisMonth;
      } else if (selectedPeriod === 'LAST_MONTH') {
        isInPeriod = logDate >= startOfLastMonth && logDate <= endOfLastMonth;
      } else if (selectedPeriod === 'LAST 3 MONTHS') {
        isInPeriod = logDate >= startOfLast3Months;
      } else if (selectedPeriod === 'CURRENT YEAR') {
        isInPeriod = logDate >= startOfCurrentYear;
      } else {
        isInPeriod = true;
      }

      if (isInPeriod) {
        income += l.amount;
      }
    });

    filteredTransactions.forEach((t: Transaction) => {
      const amount = Math.abs(t.amount || 0);
      const fee = Math.abs(t.transactionCost || 0);

      if (t.type !== 'RECEIVED') {
        expense += amount;
      }
      cost += fee;
    });

    return {
      income,
      expense,
      cost
    };
  }, [filteredTransactions, logs, selectedPeriod, dateRange]);


  const getPeriodLabel = (period: Period) => {
    const now = new Date();

    if (period === 'THIS_MONTH') {
      return now.toLocaleString('default', { month: 'long' });
    }

    if (period === 'LAST_MONTH') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return lastMonth.toLocaleString('default', { month: 'long' });
    }

    if (period === 'LAST 3 MONTHS') return 'Last 3 Months';
    if (period === 'CURRENT YEAR') return 'This Year';
    if (period === 'ALL TIME') return 'All Time';

    return period;
  };

  const showTotalBalanceCard = selectedPeriod !== 'ALL TIME';
  const totalBalanceValue = periodSummary.income - periodSummary.expense + (selectedPeriod === 'THIS_MONTH' ? carriedForwardBalance : 0);

  const handleTransactionPress = (tx: Transaction) => {
    if (modalVisible) return;
    // Fuliza transactions are automated and should not be manually categorized
    const isFuliza = tx.recipientId === 'FULIZA_REPAYMENT' ||
      tx.id?.startsWith('FULIZA-FEES-') ||
      tx.categoryId === 12;

    if (isFuliza) return;

    setSelectedTransaction(tx);
    setModalVisible(true);
  };

  const openCashModal = () => {
    if (cashModalVisible || openingCashModalRef.current || savingCashTx) return;
    openingCashModalRef.current = true;
    setCashModalVisible(true);
    openingCashModalRef.current = false;
  };

  const handleCategorySelect = async (category: Category) => {
    if (activeTransaction) {
      try {
        const isFirstTime = !activeTransaction.categoryId || activeTransaction.categoryId === 0;

        if (isFirstTime) {
          setModalVisible(false);
          setSelectedTransaction(null);
          // First time categorizing: creates automation rule (future) & applies to past uncategorized
          if (activeTransaction.recipientId) {
            await saveRecipientCategory(activeTransaction.recipientId, category.id, activeTransaction.type);
          } else {
            await updateTransactionCategory(activeTransaction.id, category.id);
          }
        } else {
          // RE-CATEGORIZING: Close categorization modal and show scope modal
          setModalVisible(false);
          setPendingCategory(category);
          setScopeModalVisible(true);
        }
      } catch (error) {
        console.error("Failed to save category:", error);
      }
    }
  };


  const handleDeleteTransaction = async (tx: Transaction) => {
    // Show confirmation dialog before deleting
    showAlert({
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => { } }, // Just close alert
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setModalVisible(false);
              setSelectedTransaction(null);
              await ledgerService.reverseTransaction(tx.id);

              // Optional: Show success alert or toast
            } catch (error) {
              console.error("Failed to delete transaction:", error);
              showAlert({
                title: 'Error',
                message: error instanceof Error ? error.message : 'Could not delete transaction.',
                type: 'error'
              });
            }
          }
        }
      ]
    });
  };

  const handleDateChange = async (newDate: Date) => {
    if (activeTransaction) {
      try {
        setModalVisible(false);
        setSelectedTransaction(null);
        await updateTransactionDate(activeTransaction.id, newDate);
      } catch (error) {
        console.error("Failed to update date:", error);
      }
    }
  };

  const handleLinkToGoalRequest = async (tx: Transaction) => {
    setModalVisible(false);
    try {
      const goals = await savingsService.getGoals();
      setSavingsGoals(goals.filter(g => g.status !== 'COMPLETED'));
      if (goals.length === 0) {
        showAlert({ title: 'No Goals', message: 'You have no active savings goals setup.', type: 'info' });
        return;
      }
      setSavingsModalVisible(true);
    } catch (e) {
      console.error(e);
      showAlert({ title: 'Error', message: 'Failed to fetch goals.', type: 'error' });
    }
  };

  const handleLinkToIncomeRequest = async (tx: Transaction) => {
    setModalVisible(false);
    try {
      const sources = await incomeService.getSources();
      const active = sources.filter(s => s.status === 'ACTIVE');
      if (active.length === 0) {
        showAlert({ title: 'No Sources', message: 'Create an income source first from the Income tab.', type: 'info' });
        return;
      }
      setIncomeSources(active);
      setIncomeModalVisible(true);
    } catch (e) {
      console.error(e);
      showAlert({ title: 'Error', message: 'Failed to fetch income sources.', type: 'error' });
    }
  };

  const handleConfirmLinkToIncome = async (sourceId: string) => {
    if (!activeTransaction) return;
    setLinkingIncome(sourceId);
    try {
      await incomeService.linkTransactionToSource(sourceId, activeTransaction.id);
      setIncomeModalVisible(false);
      setSelectedTransaction(null);
      showAlert({ title: 'Linked!', message: 'Income successfully linked to source!', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Error', message: e.message || 'Failed to link transaction.', type: 'error' });
    } finally {
      setLinkingIncome(null);
    }
  };

  const handleConfirmLinkToGoal = async (goalId: string) => {
    if (!activeTransaction) return;
    setLinkingGoal(goalId);
    try {
      await savingsService.linkTransactionToGoal(goalId, activeTransaction.id);
      setSavingsModalVisible(false);
      setSelectedTransaction(null);
      showAlert({ title: 'Success', message: 'Transaction successfully linked to savings goal!', type: 'success' });
    } catch (e: any) {
      console.error(e);
      showAlert({ title: 'Error', message: e.message || 'Failed to link transaction.', type: 'error' });
    } finally {
      setLinkingGoal(null);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedTransaction(null);
  };

  const handleEndReached = () => {
    if (loadingMore || displayLimit >= filteredTransactions.length) return;
    setLoadingMore(true);
    setTimeout(() => {
      setDisplayLimit(prev => prev + 20);
      setLoadingMore(false);
    }, 800);
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;
      if (currentY <= 0) {
        showTabBar();
      } else if (diff > 5) {
        hideTabBar();
      }
      lastScrollY.value = currentY;
    },
  });

  const renderHeader = () => (
    <View>
      <View className="px-6 pt-16 pb-4 bg-white dark:bg-[#0f172a] rounded-b-[10px]">
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                Welcome back,
              </Text>

              {isSyncing && (
                <View className="flex-row items-center dark:bg-blue-900/20 px-2 py-0.5">
                  <ActivityIndicator
                    size="small"
                    color="#f63b7dff"
                    style={{ transform: [{ scale: 0.6 }] }}
                  />
                  <Text className="text-red-400 dark:text-red-400 text-[10px] font-bold ml-0.5">
                    Syncing SMS...
                  </Text>
                </View>
              )}
            </View>

            <Text className="text-slate-900 dark:text-white text-xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
          <TouchableOpacity
            onPress={openCashModal}
            disabled={cashModalVisible || savingCashTx}
            className="ml-3 px-4 py-2 rounded-[12px] bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 flex-row items-center"
          >
            <FontAwesome name="plus" size={12} color={isDark ? '#93c5fd' : '#2563eb'} />
            <Text className="ml-2 text-xs font-bold text-blue-700 dark:text-blue-200 uppercase">Add Cash TXN</Text>
          </TouchableOpacity>
        </View>

        {showTotalBalanceCard && (
          <View className="bg-blue-600 rounded-[12px] p-6 shadow-xl shadow-blue-900/20 overflow-hidden relative">
            <View className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/30 rounded-full blur-2xl" />
            <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-2xl" />

            <View className="flex-row justify-between items-start mb-2">
              <Text className="text-blue-100 font-medium">Total Balance</Text>
              <View className="bg-red-500/20 px-2 py-1 rounded-lg">
                <Text className="text-red-200 text-xs font-medium">
                  Cost: KES {periodSummary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
            {selectedPeriod === 'THIS_MONTH' && carriedForwardBalance !== 0 && (
              <Text className="text-blue-200 text-xs mb-1">
                Carried Forward ({carriedForwardPeriodLabel}): KES {carriedForwardBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            )}
            <Text className="text-white text-4xl font-bold mb-2">
              KES {formatCurrency(totalBalanceValue)}
            </Text>

            <View className="flex-row justify-between gap-3 mt-4">
              <View className="flex-1 bg-green-500/30 px-3 py-2 rounded-xl">
                <Text className="text-green-100 text-xs mb-1">Income</Text>
                <Text className="text-white font-bold">KES {periodSummary.income.toLocaleString()}</Text>
              </View>
              <View className="flex-1 bg-red-500/30 px-3 py-2 rounded-xl">
                <Text className="text-red-100 text-xs mb-1">Expense</Text>
                <Text className="text-white font-bold">KES {periodSummary.expense.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        <View className="bg-white flex-row justify-between items-center dark:bg-[#1e293b] p-1 rounded-[20px] border border-gray-200 dark:border-slate-700 mt-6 overflow-hidden">
          {(['THIS_MONTH', 'LAST_MONTH', 'LAST 3 MONTHS', 'CURRENT YEAR', 'ALL TIME'] as Period[]).map((period) => (
            <TouchableOpacity
              key={period}
              className={`px-2 py-1 mr-1 text-[8px] font-medium rounded-[20px] ${selectedPeriod === period ? 'bg-blue-600' : ''}`}
              onPress={() => {
                setPeriodLoading(true);
                setDisplayLimit(20);
                setTimeout(() => {
                  setSelectedPeriod(period);
                  setPeriodLoading(false);
                }, 100);
              }}
            >
              <Text className={`uppercase font-medium text-[8px] text-center ${selectedPeriod === period ? 'text-white' : 'text-slate-400'}`}>
                {getPeriodLabel(period)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>


      </View>

      {/* Debt Summary Widget */}
      {debtSummary && debtSummary.activeDebts > 0 && (
        <View className="px-6 mt-8 mb-2">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-slate-900 dark:text-white text-lg font-bold">Debts</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/debts')}
              className="flex-row items-center gap-1"
            >
              <Text className="text-blue-600 dark:text-blue-400 text-sm font-medium">View All</Text>
              <FontAwesome name="chevron-right" size={12} color="#3b82f6" />
            </TouchableOpacity>
          </View>

          <View className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 p-5 rounded-[12px] border border-purple-200 dark:border-purple-800">
            <View className="flex-row justify-between items-start mb-1">
              <View className="flex-1">
                <Text className="text-purple-800 dark:text-purple-200 font-bold text-base mb-1">Total Debt</Text>
                <Text className="text-slate-900 dark:text-white text-3xl font-bold">
                  KES {Math.abs(debtSummary.netDebt).toLocaleString()}
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  {debtSummary.activeDebts} active {debtSummary.activeDebts === 1 ? 'debt' : 'debts'}
                </Text>
              </View>
              <View className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 items-center justify-center">
                <FontAwesome name="exchange" size={20} color="#9333ea" />
              </View>
            </View>



            {debtSummary.activeDebts > 0 && (
              <View className="flex-row justify-between items-center mb-1 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[12px]">
                <View>
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">Debt Summary</Text>
                  <View className="flex-row items-center gap-4">
                    {debtSummary.totalLiabilities > 0 && (
                      <View>
                        <Text className="text-[10px] text-slate-400 font-semibold uppercase">I Owe</Text>
                        <Text className="text-red-600 dark:text-red-400 font-bold text-sm">KES {debtSummary.totalLiabilities.toLocaleString()}</Text>
                      </View>
                    )}
                    {debtSummary.totalReceivables > 0 && (
                      <View>
                        <Text className="text-[10px] text-slate-400 font-semibold uppercase">Owed to Me</Text>
                        <Text className="text-green-600 dark:text-green-400 font-bold text-sm">KES {debtSummary.totalReceivables.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Active Debts</Text>
                  <Text className="text-slate-900 dark:text-white font-bold text-sm">{debtSummary.activeDebts}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* search bar */}
      <View className="mx-6 mt-6">
        <View className="h-12 px-3 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f172a] flex-row items-center shadow-sm">
          <View className="w-6 h-6 items-center justify-center mr-2">
            <Image
              source={require('../../assets/svg/search.svg')}
              style={{ width: 30, height: 30 }}
              tintColor={colorScheme === 'dark' ? '#93c5fd' : '#2563eb'}
              contentFit="contain"
            />
          </View>
          <TextInput
            placeholder="Search for amount, category, or recipient..."
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 h-full text-[10PX] text-slate-900 dark:text-white"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center ml-2"
            >
              <Image
                source={require('../../assets/svg/close.svg')}
                style={{ width: 8, height: 8 }}
                tintColor={colorScheme === 'dark' ? '#cbd5e1' : '#475569'}
                contentFit="contain"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* end search bar */}

      <View className="px-6 mt-6 mb-4 flex-row justify-between items-center">
        <Text className="text-slate-900 dark:text-white text-lg font-bold">Recent Transactions</Text>
        <Text className="text-slate-500 text-xs">
          {filteredTransactions.length} items
        </Text>
      </View>
      {periodLoading && (
        <View className="px-6 pb-4">
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}
    </View>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="px-6 pb-8">
          <TransactionSkeleton />
          <TransactionSkeleton />
          <TransactionSkeleton />
        </View>
      );
    }
    return <View className="h-24" />;
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <CategorizationModal
        visible={modalVisible}
        transaction={activeTransaction}
        onCategorySelect={handleCategorySelect}
        onDateChange={handleDateChange}
        onDelete={handleDeleteTransaction}
        onLinkToGoal={handleLinkToGoalRequest}
        onLinkToIncome={handleLinkToIncomeRequest}
        onClose={handleCloseModal}
      />

      <Modal
        transparent
        animationType="fade"
        visible={cashModalVisible}
        onRequestClose={() => !savingCashTx && setCashModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <TouchableOpacity
            className="flex-1 bg-black/50 justify-center items-center p-6"
            activeOpacity={1}
            onPress={() => !savingCashTx && setCashModalVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => { }}
              className="w-full max-h-[85%] bg-white dark:bg-[#0f172a] rounded-xl p-6 border border-slate-200 dark:border-slate-800"
            >
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View className="flex-row justify-between items-center mb-5">
                  <Text className="text-slate-900 dark:text-white text-xl font-black">Add Cash Transaction</Text>
                  <TouchableOpacity onPress={() => !savingCashTx && setCashModalVisible(false)}>
                    <Image
                      source={require('../../assets/svg/close.svg')}
                      style={{ width: 14, height: 14 }}
                      tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                      contentFit="contain"
                    />
                  </TouchableOpacity>
                </View>

                <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Transaction Type</Text>
                <View className="flex-row gap-2 mb-4">
                  <TouchableOpacity
                    onPress={() => setCashType('SENT')}
                    className={`flex-1 py-3 rounded-xl items-center border ${cashType === 'SENT'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    <Text className={`font-bold ${cashType === 'SENT' ? 'text-red-600 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}>
                      Expense
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCashType('RECEIVED')}
                    className={`flex-1 py-3 rounded-xl items-center border ${cashType === 'RECEIVED'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    <Text className={`font-bold ${cashType === 'RECEIVED' ? 'text-green-600 dark:text-green-300' : 'text-slate-600 dark:text-slate-300'}`}>
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Amount (KES)</Text>
                <View className="h-12 rounded-xl px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 justify-center mb-4">
                  <TextInput
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    placeholder="0"
                    placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
                    keyboardType="numeric"
                    className="text-base font-semibold text-slate-900 dark:text-white"
                  />
                </View>

                <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Note (Optional)</Text>
                <View className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-5">
                  <TextInput
                    value={cashNote}
                    onChangeText={setCashNote}
                    placeholder={cashType === 'SENT' ? 'What was this expense for?' : 'Where did this cash come from?'}
                    placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
                    className="text-slate-900 dark:text-white"
                  />
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => {
                      setCashModalVisible(false);
                      resetCashForm();
                    }}
                    disabled={savingCashTx}
                    className="flex-1 py-3 rounded-xl items-center bg-slate-100 dark:bg-slate-800"
                  >
                    <Text className="font-bold text-slate-700 dark:text-slate-200">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveCashTransaction}
                    disabled={savingCashTx}
                    className="flex-1 py-3 rounded-xl items-center bg-blue-600"
                  >
                    {savingCashTx ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="font-bold text-white">Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Animated.FlatList
        data={filteredTransactions
          .filter(t => !t.id.startsWith('FULIZA-FEES-'))
          .slice(0, searchQuery ? filteredTransactions.length : displayLimit)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            onPress={handleTransactionPress}
          />
        )}
        ListHeaderComponent={renderHeader()}
        ListFooterComponent={renderFooter()}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => (
          { length: 86, offset: 86 * index, index }
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Select Savings Goal Modal */}
      {savingsModalVisible && (
        <View className="absolute z-50 top-0 left-0 right-0 bottom-[100px] bg-black/40 justify-end">
          <View className="bg-white dark:bg-[#0f172a] rounded-t-[12px] p-6 pb-12 border-t border-slate-200 dark:border-slate-800">
            <View className="flex-row justify-between flex-wrap gap-y-3 items-center mb-6">
              <Text className="text-xl font-bold text-slate-900 dark:text-white">Select a Savings Goal</Text>
              <TouchableOpacity onPress={() => { setSavingsModalVisible(false); setSelectedTransaction(null); }}>
                <Image
                  source={require('../../assets/svg/close.svg')}
                  style={{ width: 10, height: 10 }}
                />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 dark:text-slate-400 mb-4">
              Where would you like to transfer KES {activeTransaction?.amount?.toLocaleString()}?
            </Text>

            {savingsGoals.length === 0 ? (
              <Text className="text-center text-slate-500 mt-4 mb-8">No active goals available.</Text>
            ) : (
              <View className="space-y-3">
                {savingsGoals.map(goal => (
                  <TouchableOpacity
                    key={goal.id}
                    onPress={() => handleConfirmLinkToGoal(goal.id)}
                    disabled={linkingGoal === goal.id}
                    className="bg-slate-50 dark:bg-[#1e293b] p-4 rounded-[12px] flex-row justify-between items-center mb-2 border border-slate-100 dark:border-slate-800"
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${goal.color || '#3b82f6'}20` }}>
                        <FontAwesome name="flag" size={16} color={goal.color || '#3b82f6'} />
                      </View>
                      <View>
                        <Text className="font-bold text-slate-900 dark:text-white">{goal.name}</Text>
                        <Text className="text-xs text-slate-500 mt-1">
                          KES {goal.currentAmount.toLocaleString()} / {goal.targetAmount.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    {linkingGoal === goal.id ? (
                      <ActivityIndicator size="small" color={goal.color || '#3b82f6'} />
                    ) : (
                      <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Select Income Source Modal */}
      {incomeModalVisible && (
        <View className="absolute z-50 top-0 left-0 right-0 bottom-0 bg-black/40 justify-end">
          <View className="bg-white dark:bg-[#0f172a] rounded-t-[32px] p-6 pb-12 border-t border-slate-200 dark:border-slate-800">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-900 dark:text-white">Select Income Source</Text>
              <TouchableOpacity onPress={() => { setIncomeModalVisible(false); setSelectedTransaction(null); }}>
                <FontAwesome name="times" size={20} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 dark:text-slate-400 mb-5">
              Link KES {activeTransaction?.amount?.toLocaleString()} to which income source?
            </Text>
            <View className="space-y-3">
              {incomeSources.map(src => (
                <TouchableOpacity
                  key={src.id}
                  onPress={() => handleConfirmLinkToIncome(src.id)}
                  disabled={linkingIncome === src.id}
                  className="bg-slate-50 dark:bg-[#1e293b] p-4 rounded-[12px] flex-row justify-between items-center mb-2 border border-slate-100 dark:border-slate-800"
                >
                  <View className="flex-row items-center">
                    <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${src.color || '#10b981'}20` }}>
                      <FontAwesome name="arrow-down" size={16} color={src.color || '#10b981'} />
                    </View>
                    <View>
                      <Text className="font-bold text-slate-900 dark:text-white">{src.name}</Text>
                      {src.isRecurring && (
                        <Text className="text-xs text-slate-500 mt-0.5">{src.frequency}</Text>
                      )}
                    </View>
                  </View>
                  {linkingIncome === src.id
                    ? <ActivityIndicator size="small" color={src.color || '#10b981'} />
                    : <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                  }
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Scope Modal */}
      <Modal
        visible={scopeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScopeModalVisible(false)}
      >
        <View className="flex-1 bg-black/40 justify-end mb-10">
          <View className="bg-white dark:bg-[#0f172a] rounded-t-[16px] p-6 pb-10">
            <Text className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              Recategorize Transactions
            </Text>
            <Text className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              How should this change be applied?
            </Text>

            <View className="gap-y-3">
              <TouchableOpacity
                onPress={async () => {
                  setScopeModalVisible(false);
                  if (activeTransaction && pendingCategory) {
                    await updateTransactionCategory(activeTransaction.id, pendingCategory.id);
                  }
                  setSelectedTransaction(null);
                }}
                className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 items-center justify-center mr-3">
                      <Image
                          source={require('../../assets/svg/transaction.svg')}
                          style={{ width: 16, height: 16 }}
                          tintColor={colorScheme === 'dark' ? '#fff' : '#3b82f6'}
                          contentFit="contain"
                      />
                  </View>
                  <Text className="text-slate-900 dark:text-white font-semibold">
                    Just this transaction
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setScopeModalVisible(false);
                  if (activeTransaction && pendingCategory) {
                    await updateTransactionCategoryByScope(
                      activeTransaction.id,
                      activeTransaction.recipientId || null,
                      activeTransaction.type,
                      activeTransaction.date,
                      pendingCategory.id,
                      'PAST'
                    );
                  }
                  setSelectedTransaction(null);
                }}
                className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 items-center justify-center mr-3">
                      <Image
                          source={require('../../assets/svg/transaction.svg')}
                          style={{ width: 16, height: 16 }}
                          tintColor={colorScheme === 'dark' ? '#fff' : '#f59e0b'}
                          contentFit="contain"
                      />
                  </View>
                  <Text className="text-slate-900 dark:text-white font-semibold">
                    Past similar transactions
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setScopeModalVisible(false);
                  if (activeTransaction && pendingCategory) {
                    await updateTransactionCategoryByScope(
                      activeTransaction.id,
                      activeTransaction.recipientId || null,
                      activeTransaction.type,
                      activeTransaction.date,
                      pendingCategory.id,
                      'FUTURE'
                    );
                  }
                  setSelectedTransaction(null);
                }}
                className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 items-center justify-center mr-3">
                      <Image
                          source={require('../../assets/svg/transaction.svg')}
                          style={{ width: 16, height: 16 }}
                          tintColor={colorScheme === 'dark' ? '#fff' : '#a855f7'}
                          contentFit="contain"
                      />
                  </View>
                  <Text className="text-slate-900 dark:text-white font-semibold">
                    Future transactions
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setScopeModalVisible(false);
                  if (activeTransaction && pendingCategory) {
                    await updateTransactionCategoryByScope(
                      activeTransaction.id,
                      activeTransaction.recipientId || null,
                      activeTransaction.type,
                      activeTransaction.date,
                      pendingCategory.id,
                      'ALL'
                    );
                  }
                  setSelectedTransaction(null);
                }}
                className="bg-slate-50 dark:bg-slate-800  p-4 rounded-[12px] flex-row justify-between items-center"
              >
                <View className="flex-row items-center" >
                  <View className="w-8 h-8 rounded-lg bg-green-100 dark:bg-purple-900/30 items-center justify-center mr-3">
                      <Image
                          source={require('../../assets/svg/transaction.svg')}
                          style={{ width: 16, height: 16 }}
                          tintColor={colorScheme === 'dark' ? '#fff' : '#65f755ff'}
                          contentFit="contain"
                      />
                  </View>
                  <Text className="text-slate-900 dark:text-white font-bold text-base">
                    Apply to All Transactions
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setScopeModalVisible(false)}
              className="bg-red-50 dark:bg-red-900/20 p-4 mt-6 mb-6 rounded-xl items-center border border-red-100 dark:border-red-900/50 justify-center"
            >
              <Text className="text-red-600 dark:text-red-400 font-semibold text-[16px]">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
