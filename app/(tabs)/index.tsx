import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import CategorizationModal from '../../components/CategorizationModal';
import CashTransactionModal from '../../components/modals/CashTransactionModal';
import RecategorizeScopeModal from '../../components/modals/RecategorizeScopeModal';
import SelectIncomeSourceSheet from '../../components/modals/SelectIncomeSourceSheet';
import SelectSavingsGoalSheet from '../../components/modals/SelectSavingsGoalSheet';
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
import {
  FreshStartConfig,
  getFinancialMonthRange,
  getFinancialSettings,
  getFreshStartEffectiveDate,
  getPreviousFinancialMonthRange,
  isCashflowTransaction,
  isInternalTransfer,
} from '../../services/financialSettingsService';
import { IncomeSource, incomeService } from '../../services/incomeService';
import { ledgerService } from '../../services/ledgerService';
import { manualRecurringTransactionService } from '../../services/manualRecurringTransactionService';
import { SavingsGoal, savingsService } from '../../services/savingsService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { syncMessages } from '../../services/smsService';
import { Category, Transaction } from '../../types/transaction';
// calculateFulizaDailyCharge removed - now handled in debt detail if needed

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST 3 MONTHS' | 'CURRENT YEAR' | 'ALL TIME';

const normalizeSearchValue = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

export default function HomeScreen() {
  const { user, phoneNumber } = useAuth();
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
  const [hideInternalTransfers, setHideInternalTransfers] = useState(false);
  const [freshStartConfig, setFreshStartConfig] = useState<FreshStartConfig | null>(null);
  const [imBankEnabled, setImBankEnabled] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const openingCashModalRef = useRef(false);
  const [cashType, setCashType] = useState<'SENT' | 'RECEIVED'>('SENT');
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [cashAccountId, setCashAccountId] = useState<'ACC-CASH-DEFAULT' | 'ACC-MPESA-DEFAULT'>('ACC-CASH-DEFAULT');
  const [cashIsRecurring, setCashIsRecurring] = useState(false);
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


  // Load settings and subscribe to changes
  useEffect(() => {
    if (!dbReady) return;

    const loadHomeSettings = async () => {
      try {
        const [enabled, financialSettings] = await Promise.all([
          getUserSettings('bank_im_enabled'),
          getFinancialSettings(),
        ]);
        setImBankEnabled(enabled === 'true');
        setFinancialMonthStart(financialSettings.monthStartDay);
        setHideInternalTransfers(financialSettings.hideInternalTransfers);
        setFreshStartConfig(financialSettings.freshStart);
      } catch (error) {
        console.error('Error loading home settings:', error);
      }
    };

    loadHomeSettings();

    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'SETTINGS') {
        loadHomeSettings();
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

  useEffect(() => {
    const runProgressiveSync = async () => {
      try {
        setIsSyncing(true);
        setDbReady(true);

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
    setCashAccountId('ACC-CASH-DEFAULT');
    setCashIsRecurring(false);
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

    const accountLabel = cashAccountId === 'ACC-MPESA-DEFAULT' ? 'M-PESA' : 'Cash';
    const recipient = cashNote.trim() || (cashType === 'SENT' ? `${accountLabel} expense` : `${accountLabel} income`);

    setSavingCashTx(true);
    try {
      await ledgerService.recordTransaction({
        accountId: cashAccountId,
        amount,
        type: cashType,
        kind: cashType === 'SENT' ? 'EXPENSE' : 'INCOME',
        date: new Date(),
        recipientName: recipient,
        rawSms: `Manual ${accountLabel.toLowerCase()} ${cashType === 'SENT' ? 'expense' : 'income'} entry`,
        userId: 'local_user',
      });

      if (cashIsRecurring) {
        await manualRecurringTransactionService.createTemplate({
          userId: 'local_user',
          accountId: cashAccountId,
          amount,
          type: cashType,
          recipientName: recipient,
          rawSms: `Manual ${accountLabel.toLowerCase()} ${cashType === 'SENT' ? 'expense' : 'income'} entry`,
          createdAt: new Date(),
        });
      }

      setCashModalVisible(false);
      resetCashForm();
      showAlert({
        title: 'Saved',
        message: `${accountLabel} transaction added successfully${cashIsRecurring ? ' with monthly recurring enabled.' : '.'}`,
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

  useEffect(() => {
    if (!dbReady) return;

    const processRecurring = () => {
      manualRecurringTransactionService.runDueMonthlyTransactions().catch((error) => {
        console.error('Failed to process recurring manual transactions:', error);
      });
    };

    processRecurring();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        processRecurring();
      }
    });

    return () => subscription.remove();
  }, [dbReady]);

  // Calculate date boundaries once
  const dateRange = useMemo(() => {
    const now = new Date();
    const thisMonthRange = getFinancialMonthRange(now, financialMonthStart);
    const lastMonthRange = getPreviousFinancialMonthRange(now, financialMonthStart);

    const startOfCurrentYear = new Date(now.getFullYear(), 0, 1);
    const startOfLast3Months = new Date(thisMonthRange.start.getFullYear(), thisMonthRange.start.getMonth() - 2, thisMonthRange.start.getDate());

    return {
      startOfThisMonth: thisMonthRange.start,
      startOfLastMonth: lastMonthRange.start,
      endOfLastMonth: lastMonthRange.end,
      startOfCurrentYear,
      startOfLast3Months,
    };
  }, [financialMonthStart]);

  // Calculate carried forward balance (from previous financial month)
  const carriedForwardBalance = useMemo(() => {
    const { startOfLastMonth, endOfLastMonth } = dateRange;
    const freshStartDate = getFreshStartEffectiveDate(freshStartConfig);

    if (freshStartConfig?.resetBroughtForward && freshStartDate && startOfLastMonth < freshStartDate) {
      return 0;
    }

    const lastMonthTransactions = allTransactions.filter(t => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      return txDate >= startOfLastMonth &&
        txDate <= endOfLastMonth &&
        !t.isDeleted &&
        isCashflowTransaction(t, { userPhoneNumber: phoneNumber });
    });

    const income = lastMonthTransactions
      .filter(t => t.type === 'RECEIVED')
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = lastMonthTransactions
      .filter(t => t.type === 'SENT')
      .reduce((sum, t) => sum + t.amount, 0);

    return income - expense;
  }, [allTransactions, dateRange, freshStartConfig, phoneNumber]);

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
      if (hideInternalTransfers && isInternalTransfer(t, { userPhoneNumber: phoneNumber })) return false;

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
      const q = normalizeSearchValue(searchQuery);
      filtered = filtered.filter((t) => {
        const recipient = normalizeSearchValue(t.recipientName || '');
        const categoryName = normalizeSearchValue(t.categoryName || '');
        const categoryType = t.type === 'SENT' ? 'expense' : 'income';
        const kind = normalizeSearchValue((t.transactionKind || '').replace(/_/g, ' '));
        const amount = t.amount.toString();
        const account = normalizeSearchValue(`${t.accountName || ''} ${t.accountType || ''}`);
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
  }, [allTransactions, selectedPeriod, dateRange, hideInternalTransfers, imBankEnabled, phoneNumber, searchQuery]);

  // Calculate summary statistics for the selected period
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cost = 0;

    filteredTransactions.forEach((t: Transaction) => {
      if (!isCashflowTransaction(t, { userPhoneNumber: phoneNumber })) return;
      const amount = Math.abs(t.amount || 0);
      const fee = Math.abs(t.transactionCost || 0);

      if (t.type === 'RECEIVED') {
        income += amount;
      } else {
        expense += amount;
      }
      cost += fee;
    });

    return {
      income,
      expense,
      cost
    };
  }, [filteredTransactions, phoneNumber]);


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

  const handleManageRecurring = () => {
    setCashModalVisible(false);
    router.push('/automation/manual-recurring');
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

  const handleLinkToGoalRequest = async (_tx: Transaction) => {
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

  const handleLinkToIncomeRequest = async (_tx: Transaction) => {
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
            className="ml-3 px-4 py-2 rounded-[12px] bg-blue-50 dark:bg-blue-900/30 flex-row items-center"
          >
            <FontAwesome name="plus" size={12} color={isDark ? '#93c5fd' : '#2563eb'} />
            <Text className="ml-2 text-xs font-bold text-blue-700 dark:text-blue-200 uppercase">Add Manual TXN</Text>
          </TouchableOpacity>
        </View>

        {showTotalBalanceCard && (
          <View className="bg-blue-600 rounded-[12px] p-6 overflow-hidden relative">
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

      </View>

      {/* Debt Summary Widget */}
      {debtSummary && debtSummary.activeDebts > 0 && (
        <View className="mt-8 mb-2 mx-4">
          <View className="bg-white dark:bg-[#1e293b] pt-5 rounded-[16px] border border-slate-100 dark:border-purple-800 overflow-hidden">
            <View className="flex-row justify-between items-start mb-1 px-6">
              <View className="flex-1">
                <Text className="text-purple-800 dark:text-purple-200 font-bold text-base mb-1">Total Debt</Text>
                <Text className="text-slate-900 dark:text-white text-3xl font-bold">
                  KES {Math.abs(debtSummary.netDebt).toLocaleString()}
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  {debtSummary.activeDebts} active {debtSummary.activeDebts === 1 ? 'debt' : 'debts'}
                </Text>
              </View>
              <View className="items-end gap-y-2">
                <View className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 items-center justify-center">
                  <FontAwesome name="exchange" size={20} color="#9333ea" />
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/debts')}
                  className="flex-row items-center gap-1"
                >
                  <Text className="text-blue-600 dark:text-blue-400 text-xs font-medium">View All</Text>
                  <FontAwesome name="chevron-right" size={10} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            </View>

            {debtSummary.activeDebts > 0 && (
              <View className="flex-row justify-between items-center mt-4 px-6 py-4 bg-slate-50 dark:bg-slate-800/50">
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

      {/* Grouped Transaction List Card Start */}
      <View className="mx-4 mt-6 bg-white dark:bg-[#1e293b] rounded-t-[16px] border-t border-x border-slate-100 dark:border-slate-700 overflow-hidden">
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-slate-900 dark:text-white text-sm font-bold">Recent Transactions</Text>
            <View className="flex-row items-center">
              {periodLoading && (
                <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 6 }} />
              )}
              <Text className="text-slate-500 text-xs">
                {filteredTransactions.length} items
              </Text>
            </View>
          </View>

          <View className="bg-slate-50 dark:bg-[#0f172a] h-12 px-3 rounded-[10px] flex-row items-center border border-slate-100 dark:border-slate-800">
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
              className="flex-1 h-full text-sm text-slate-900 dark:text-white"
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

        <View className="px-4 pb-3">
          <View className="bg-slate-50 dark:bg-[#0f172a] p-1 rounded-[12px] border border-slate-100 dark:border-slate-800">
            <View className="flex-row flex-wrap gap-1">
              {(['THIS_MONTH', 'LAST_MONTH', 'LAST 3 MONTHS', 'CURRENT YEAR', 'ALL TIME'] as Period[]).map((period, index) => {
                const isBottomRow = index >= 3;
                return (
                  <TouchableOpacity
                    key={period}
                    className={`py-2 rounded-[10px] items-center justify-center ${isBottomRow ? 'w-[49%]' : 'w-[32%]'} ${selectedPeriod === period ? 'bg-blue-600' : 'bg-white dark:bg-slate-800'}`}
                    onPress={() => {
                      setPeriodLoading(true);
                      setDisplayLimit(20);
                      setTimeout(() => {
                        setSelectedPeriod(period);
                        setPeriodLoading(false);
                      }, 100);
                    }}
                  >
                    <Text className={`font-semibold text-[10px] text-center ${selectedPeriod === period ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                      {getPeriodLabel(period)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="mx-4 bg-white dark:bg-[#1e293b] border-x border-b border-slate-100 dark:border-slate-700 rounded-b-[16px] px-4 pb-4 overflow-hidden">
          <TransactionSkeleton />
          <TransactionSkeleton />
          <TransactionSkeleton />
        </View>
      );
    }
    return <View className="mx-4 h-6 bg-white dark:bg-[#1e293b] rounded-b-[16px] border-b border-x border-slate-100 dark:border-slate-700" />;
  };

  return (
    <View className="flex-1 app-screen">
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

      <CashTransactionModal
        visible={cashModalVisible}
        colorScheme={colorScheme}
        isDark={isDark}
        saving={savingCashTx}
        cashType={cashType}
        cashAmount={cashAmount}
        cashNote={cashNote}
        cashAccountId={cashAccountId}
        isRecurring={cashIsRecurring}
        onChangeType={setCashType}
        onChangeAmount={setCashAmount}
        onChangeNote={setCashNote}
        onChangeAccountId={setCashAccountId}
        onChangeRecurring={setCashIsRecurring}
        onSave={handleSaveCashTransaction}
        onManageRecurring={handleManageRecurring}
        onClose={() => setCashModalVisible(false)}
        onCancel={() => {
          setCashModalVisible(false);
          resetCashForm();
        }}
      />

      <Animated.FlatList
        className="app-screen"
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
        onEndReachedThreshold={1}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        getItemLayout={(_data, index) => (
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

      <SelectSavingsGoalSheet
        visible={savingsModalVisible}
        amount={activeTransaction?.amount}
        goals={savingsGoals}
        linkingGoal={linkingGoal}
        onClose={() => { setSavingsModalVisible(false); setSelectedTransaction(null); }}
        onSelectGoal={handleConfirmLinkToGoal}
      />

      <SelectIncomeSourceSheet
        visible={incomeModalVisible}
        isDark={isDark}
        amount={activeTransaction?.amount}
        incomeSources={incomeSources}
        linkingIncome={linkingIncome}
        onClose={() => { setIncomeModalVisible(false); setSelectedTransaction(null); }}
        onSelectIncome={handleConfirmLinkToIncome}
      />

      <RecategorizeScopeModal
        visible={scopeModalVisible}
        colorScheme={colorScheme}
        onClose={() => setScopeModalVisible(false)}
        onJustThis={async () => {
          setScopeModalVisible(false);
          if (activeTransaction && pendingCategory) {
            await updateTransactionCategory(activeTransaction.id, pendingCategory.id);
          }
          setSelectedTransaction(null);
        }}
        onPast={async () => {
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
        onFuture={async () => {
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
        onAll={async () => {
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
      />
    </View>
  );
}
