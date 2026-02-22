import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTransactions } from '../../services/database';
import { SavingsGoal, savingsService } from '../../services/savingsService';
import { Transaction } from '../../types/transaction';

export default function GoalDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [goal, setGoal] = useState<SavingsGoal | null>(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<Transaction[]>([]);

    // Linking Modal State
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkableTransactions, setLinkableTransactions] = useState<Transaction[]>([]);
    const [linking, setLinking] = useState<string | null>(null);

    const scrollY = useSharedValue(0);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    const headerStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scrollY.value, [0, 50], [0, 1], Extrapolate.CLAMP);
        const borderOpacity = interpolate(scrollY.value, [0, 50], [0, 0.1], Extrapolate.CLAMP);
        return {
            backgroundColor: colorScheme === 'dark' ? `rgba(15, 23, 42, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
            borderBottomColor: colorScheme === 'dark' ? `rgba(255, 255, 255, ${borderOpacity})` : `rgba(0, 0, 0, ${borderOpacity})`,
            borderBottomWidth: 1,
        };
    });

    const loadData = async () => {
        if (!id) return;
        try {
            const fetchedGoal = await savingsService.getGoalById(id as string);
            setGoal(fetchedGoal);

            if (fetchedGoal) {
                const goalHistory = await savingsService.getGoalHistory(fetchedGoal.id);
                setHistory(goalHistory);
            }
        } catch (error) {
            console.error('Failed to load goal:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [id])
    );

    const handleDeposit = () => {
        Alert.prompt(
            'Deposit to Savings',
            'Enter amount to transfer from M-PESA to this goal.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Transfer',
                    onPress: async (amountText?: string) => {
                        const amount = parseFloat(amountText || '');
                        if (isNaN(amount) || amount <= 0) {
                            Alert.alert('Error', 'Invalid amount entered.');
                            return;
                        }

                        try {
                            // Using default M-PESA account ID for now
                            await savingsService.transferToSavings(goal!.id, amount, 'ACC-MPESA-DEFAULT');
                            Alert.alert('Success', 'Funds deposited successfully!');
                            loadData();
                        } catch (error: any) {
                            Alert.alert('Error', error.message || 'Failed to deposit funds.');
                        }
                    },
                },
            ],
            'plain-text',
            '',
            'numeric'
        );
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Goal',
            'Are you sure you want to delete this savings goal? This action cannot be undone, however linked transactions will remain as standard expenses.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await savingsService.deleteGoal(goal!.id);
                            router.back();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete goal.');
                        }
                    },
                },
            ]
        );
    };

    const fetchLinkableTransactions = async () => {
        try {
            const allTx = await getTransactions();
            // Filter: Outgoing only, not already linked to a goal, maybe not already linked to debt
            const eligible = allTx.filter(t =>
                t.type === 'SENT' &&
                !t.linkedGoalId &&
                !t.linkedDebtId &&
                t.transactionKind !== 'TRANSFER'
            );
            setLinkableTransactions(eligible);
            setShowLinkModal(true);
        } catch (error) {
            console.error('Error fetching linkable txs:', error);
            Alert.alert('Error', 'Failed to load eligible transactions.');
        }
    };

    const handleLinkTransaction = async (transactionId: string) => {
        if (!goal) return;
        setLinking(transactionId);
        try {
            await savingsService.linkTransactionToGoal(goal.id, transactionId);
            setShowLinkModal(false);
            Alert.alert('Success', 'Transaction successfully linked to goal.');
            loadData(); // Refresh goal data and history
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to link transaction.');
        } finally {
            setLinking(null);
        }
    };

    const handleUnlink = async (transactionId: string) => {
        Alert.alert(
            'Unlink Transaction',
            'Remove this transaction from the goal? This will reduce the goal progress but keep the transaction in your records.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await savingsService.unlinkTransactionFromGoal(transactionId);
                            Alert.alert('Success', 'Transaction unlinked successfully.');
                            loadData();
                        } catch (error: any) {
                            Alert.alert('Error', error.message || 'Failed to unlink.');
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    if (!goal) {
        return (
            <View className="flex-1 items-center justify-center pt-20">
                <Text>Goal not found.</Text>
            </View>
        );
    }

    const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
    const themeColor = goal.color || '#3b82f6';
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <Animated.View
                style={[
                    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top },
                    headerStyle
                ]}
            >
                <View className="px-6 py-4 flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image
                            source={require('../../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white truncate max-w-[200px]" numberOfLines={1}>{goal.name}</Text>
                    <TouchableOpacity onPress={handleDelete} className="p-2 -mr-2">
                        <FontAwesome name="trash-o" size={24} color="#ef4444" />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <Animated.ScrollView
                className="flex-1"
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 100 }}
            >
                <View className="p-6">
                    {/* Status Card */}
                    <View className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl shadow-sm mb-6 relative overflow-hidden border border-slate-100 dark:border-slate-800">
                        <View className="absolute right-[-20] top-[-20] w-32 h-32 rounded-bl-full opacity-10" style={{ backgroundColor: themeColor }} />

                        <View className="flex-row justify-between items-start mb-6">
                            <View className="flex-1">
                                <Text className="text-slate-500 dark:text-slate-400 text-sm mb-1 uppercase tracking-wider font-medium">Goal Progress</Text>
                                <Text className="text-4xl font-bold text-slate-900 dark:text-white">
                                    {progress.toFixed(1)}%
                                </Text>
                            </View>
                            {goal.status === 'COMPLETED' ? (
                                <View className="bg-green-100 dark:bg-green-900/30 px-4 py-1.5 rounded-full border border-green-200 dark:border-green-800/50">
                                    <Text className="text-green-600 dark:text-green-400 font-bold text-xs uppercase tracking-wider">Completed</Text>
                                </View>
                            ) : (
                                <View className="bg-blue-100 dark:bg-blue-900/30 px-4 py-1.5 rounded-full border border-blue-200 dark:border-blue-800/50">
                                    <Text className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">Active</Text>
                                </View>
                            )}
                        </View>

                        {/* Progress Bar */}
                        <View className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                            <View
                                className="h-full rounded-full"
                                style={{ width: `${progress}%`, backgroundColor: themeColor }}
                            />
                        </View>

                        <View className="flex-row justify-between mb-6">
                            <Text className="text-slate-600 dark:text-slate-300 font-medium">KES {goal.currentAmount.toLocaleString()}</Text>
                            <Text className="text-slate-400 dark:text-slate-500 font-medium tracking-wide">KES {goal.targetAmount.toLocaleString()}</Text>
                        </View>

                        <View className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 gap-2">
                            <View className="flex-row justify-between items-center">
                                <Text className="text-slate-500 dark:text-slate-400 text-xs">Remaining Amount</Text>
                                <Text className="text-slate-900 dark:text-white font-bold text-sm">KES {remaining.toLocaleString()}</Text>
                            </View>
                            {goal.targetDate && (
                                <View className="flex-row justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <Text className="text-slate-500 dark:text-slate-400 text-xs">Target Date</Text>
                                    <Text className="text-slate-900 dark:text-white font-bold text-sm">
                                        {new Date(goal.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View className="flex-row gap-3 mb-8">
                        {goal.status !== 'COMPLETED' && (
                        <TouchableOpacity
                            className="flex-1 p-4 rounded-2xl items-center shadow-lg flex-row justify-center gap-2"
                                style={{ backgroundColor: themeColor, shadowColor: themeColor }}
                            onPress={fetchLinkableTransactions}>
                            <Image
                                source={require(`../../assets/svg/link-sms.svg`)}
                                style={{ width: 22, height: 22 }}
                                tintColor={"white"}
                                contentFit="contain"
                            />
                            <Text className="text-white font-bold text-lg">Link SMS</Text>
                        </TouchableOpacity>
                        )}
                    </View>

                    {/* History */}
                    <Text className="text-lg font-bold text-slate-900 dark:text-white mb-4">Deposit History</Text>
                    {history.length > 0 ? (
                        <View className="space-y-3">
                            {history.map((tx) => (
                                <View
                                    key={tx.id}
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex-row justify-between items-center">
                                    <View className="flex-row items-center flex-1">
                                        <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3">
                                            {/* <FontAwesome name={tx.transactionKind === 'SAVINGS_TRANSFER' ? 'arrow-down' : 'link'} size={14} color={themeColor} /> */}
                                            <Image
                                                source={require(`../../assets/svg/savings-piggy.svg`)}
                                                style={{ width: 22, height: 22 }}
                                                tintColor={themeColor}
                                                contentFit="contain"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-slate-900 dark:text-white text-base">
                                                {tx.transactionKind === 'SAVINGS_TRANSFER' ? 'Deposit' : (tx.recipientName.toUpperCase().slice(0, 22) + ' ...' || 'Linked Expense')}
                                            </Text>
                                            <Text className="text-slate-400 text-xs mt-0.5">
                                                {new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                            </Text>
                                        </View>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-slate-900 dark:text-white font-bold text-lg">
                                            KES {tx.amount.toLocaleString()}
                                        </Text>
                                        <TouchableOpacity onPress={() => handleUnlink(tx.id)} className="mt-1">
                                            <Text className="text-red-500 font-medium text-xs">Unlink</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-100 dark:border-slate-800 items-center justify-center">
                            <FontAwesome name="inbox" size={48} color="#cbd5e1" />
                            <Text className="text-slate-500 dark:text-slate-400 mt-4 text-center font-medium">No deposits yet.</Text>
                            <Text className="text-slate-400 dark:text-slate-500 text-xs mt-2 text-center">Start saving to see your history here.</Text>
                        </View>
                    )}
                </View>
            </Animated.ScrollView>

            {/* Linking Modal */}
            <Modal
                visible={showLinkModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowLinkModal(false)}
            >
                <View className="flex-1 bg-gray-50 dark:bg-[#020617] pt-6 mt-8">
                    <View className="px-6 pb-4 flex-row justify-between items-center border-b border-gray-200 dark:border-slate-800">
                        <Text className="text-xl font-bold text-slate-900 dark:text-white">Link Transaction</Text>
                        <TouchableOpacity onPress={() => setShowLinkModal(false)} className="p-2 -mr-2">
                            <Image
                                source={require(`../../assets/svg/close.svg`)}
                                style={{ width: 20, height: 20}}
                                tintColor={isDark ? '#94a3b8' : themeColor}
                                contentFit="contain"
                            />
                        </TouchableOpacity>
                    </View>

                    {linkableTransactions.length === 0 ? (
                        <View className="flex-1 items-center justify-center p-6">
                            <Text className="text-slate-500 dark:text-slate-400 text-center">No eligible transactions found. Only standard expenses can be linked to savings goals.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={linkableTransactions}
                            keyExtractor={tx => tx.id}
                            contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                            renderItem={({ item: tx }) => (
                                <TouchableOpacity
                                    onPress={() => handleLinkTransaction(tx.id)}
                                    disabled={linking === tx.id}
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl mb-3 flex-row justify-between items-center border border-slate-100 dark:border-slate-800"
                                >
                                    <View className="flex-row items-center flex-1 pr-4">
                                        <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3">
                                            <Image
                                                source={require(`../../assets/svg/savings.svg`)}
                                                style={{ width: 20, height: 20 }}
                                                tintColor={isDark ? '#94a3b8' :themeColor }
                                                contentFit="contain"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-slate-900 dark:text-white font-semibold text-base" numberOfLines={1}>
                                                {tx.recipientName || tx.transactionKind}
                                            </Text>
                                            <Text className="text-slate-500 dark:text-slate-400 text-xs">
                                                {new Date(tx.date).toLocaleDateString()}
                                            </Text>
                                        </View>
                                    </View>

                                    <View className="flex-row items-center">
                                        <Text className="text-slate-900 dark:text-white font-bold mr-3">
                                            KES {tx.amount.toLocaleString()}
                                        </Text>
                                        {linking === tx.id ? (
                                            <ActivityIndicator size="small" color={themeColor} />
                                        ) : (
                                            <Image
                                                source={require(`../../assets/svg/link-sms.svg`)}
                                                style={{ width: 28, height: 28}}
                                                tintColor={themeColor}
                                                contentFit="contain"
                                            />
                                        )}
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}
