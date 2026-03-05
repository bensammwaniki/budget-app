import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { debtService } from '../../services/debtService';
import { Debt } from '../../types/debt';
import { calculateFulizaDailyCharge } from '../../utils/fulizaCalculator';

export default function DebtDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();

    const [debt, setDebt] = useState<Debt | null>(null);
    const [loading, setLoading] = useState(true);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);

    // Link Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredMatches = useMemo(() => {
        if (!searchQuery.trim()) return potentialMatches;
        const q = searchQuery.toLowerCase();
        return potentialMatches.filter(t =>
            (t.recipient_name && t.recipient_name.toLowerCase().includes(q)) ||
            t.amount.toString().includes(q)
        );
    }, [potentialMatches, searchQuery]);

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
            const debtData = await debtService.getDebts('local_user');
            const found = debtData.find(d => d.id === id);
            setDebt(found || null);

            // Load payment history
            if (found) {
                const history = await debtService.getDebtHistory(found.id);
                setPaymentHistory(history);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [id])
    );

    const openLinkModal = async () => {
        if (!debt) return;
        setModalVisible(true);
        setMatchesLoading(true);
        try {
            const matches = await debtService.getPotentialMatches(debt.id);
            setPotentialMatches(matches);
        } catch (error) {
            console.error(error);
        } finally {
            setMatchesLoading(false);
        }
    };

    const handleLink = async (transactionId: string) => {
        if (!debt) return;
        try {
            await debtService.linkTransactionToDebt({
                debtId: debt.id,
                transactionId
            });
            setModalVisible(false);
            Alert.alert('Success', 'Transaction linked!');
            loadData();
        } catch (error) {
            Alert.alert('Error', 'Link failed: ' + error);
        }
    };

    const handleSettle = async () => {
        if (!debt) return;

        Alert.alert(
            "Clear Debt",
            `Are you sure you want to mark "${debt.name}" as fully paid? This is usually for payments made in cash.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Mark as Paid",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await debtService.settleDebt(debt.id);
                            Alert.alert("Success", "Debt marked as paid.");
                            loadData();
                        } catch (error) {
                            Alert.alert("Error", "Failed to clear debt.");
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteDebt = () => {
        Alert.alert(
            "Delete Debt",
            "Are you sure you want to delete this debt? This action cannot be undone. All linked payments will become normal expenses/incomes.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (debt) {
                                await debtService.deleteDebt(debt.id);
                                router.back();
                            }
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'Failed to delete debt');
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

    if (!debt) {
        return (
            <View className="flex-1 items-center justify-center pt-20">
                <Text>Debt not found.</Text>
            </View>
        );
    }

    const originalAmount = debt.isReducingBalance ? debt.principalAmount : debt.principalAmount + (debt.principalAmount * (debt.interestRate || 0) / 100);
    const balanceWithFees = debt.currentBalance + (debt.accruedFees || 0);
    const projectedTotal = balanceWithFees + (debt.projectedInterest || 0);
    const progress = Math.max(0, Math.min(((originalAmount - balanceWithFees) / originalAmount) * 100, 100));

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
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
                    <Text className="text-xl font-bold text-slate-900 dark:text-white">{debt.name}</Text>
                    <TouchableOpacity onPress={handleDeleteDebt} className="p-2 -mr-2">
                        <FontAwesome name="trash-o" size={22} color="#ef4444" />
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
                    <View className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl shadow-sm mb-6 relative overflow-hidden">
                        <View className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full opacity-10 ${debt.type === 'LIABILITY' ? 'bg-red-500' : 'bg-green-500'}`} />

                        <View className="flex-row justify-between items-start">
                            <View>
                                <Text className="text-slate-500 text-sm mb-1">{debt.type === 'RECEIVABLE' ? 'Owed to You' : 'You Owe'}</Text>
                                <Text className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
                                    KES {balanceWithFees.toLocaleString()}
                                </Text>
                                {(debt.projectedInterest || 0) > 0 && (
                                    <View className="mb-4">
                                        <Text className="text-blue-500 font-bold text-lg">
                                            → KES {projectedTotal.toLocaleString()}
                                        </Text>
                                        <Text className="text-slate-400 text-[10px] uppercase font-bold">Projected by {debt.dueDate?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Text>
                                    </View>
                                )}
                                {(debt.accruedFees || 0) > 0 && (
                                    <Text className="text-slate-400 text-xs -mt-3 mb-4 italic">
                                        Includes KES {debt.accruedFees?.toLocaleString()} accrued interest
                                    </Text>
                                )}
                            </View>
                            <View className="items-end">
                                {debt.status === 'PAID' ? (
                                    <View className="bg-green-100 px-3 py-1 rounded-full">
                                        <Text className="text-green-600 font-bold text-xs">PAID</Text>
                                    </View>
                                ) : debt.type === 'OVERDRAFT' && debt.currentBalance > 0 && (
                                    <View className="bg-orange-100 px-3 py-1 rounded-full">
                                        <Text className="text-orange-600 font-bold text-xs">
                                            KES {calculateFulizaDailyCharge(debt.currentBalance)}/day
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {debt.isRevolving ? (
                            <View className="mt-2">
                                <Text className="text-slate-400 text-xs italic">This is a revolving credit line (Overdraft)</Text>
                            </View>
                        ) : (
                            <>
                                <View className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                                    <View className={`h-full ${debt.type === 'LIABILITY' ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${progress}%` }} />
                                </View>
                                <View className="flex-row justify-between mb-4">
                                    <View>
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Total Paid</Text>
                                        <Text className="text-slate-900 dark:text-white font-bold">KES {Math.max(0, originalAmount - balanceWithFees).toLocaleString()}</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Total {debt.type === 'LIABILITY' ? 'Debt' : 'Loan'}</Text>
                                        <Text className="text-slate-900 dark:text-white font-bold">KES {originalAmount.toLocaleString()}</Text>
                                    </View>
                                </View>
                                <View className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                                    <Text className="text-slate-500 text-xs text-center italic">
                                        {progress.toFixed(1)}% of total clear
                                    </Text>
                                </View>
                            </>
                        )}

                        <View className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex-row justify-between items-center">
                            <View className="flex-row items-center gap-2">
                                <FontAwesome name="calendar" size={12} color="#94a3b8" />
                                <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider">Debt Inception</Text>
                            </View>
                            <Text className="text-slate-700 dark:text-slate-300 font-bold text-xs">
                                {new Date(debt.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
                        </View>
                    </View>

                    {/* Actions */}
                    {debt.status === 'ACTIVE' && debt.type !== 'OVERDRAFT' && (
                        <View className="flex-row gap-3 mb-8">
                            <TouchableOpacity
                                className="bg-blue-600 flex-1 p-3 rounded-xl items-center shadow-lg shadow-blue-500/30 flex-row justify-center gap-2"
                                onPress={openLinkModal}
                            >
                                <FontAwesome name="link" size={16} color="white" />
                                <Text className="text-white font-bold text-lg">Link</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="bg-white dark:bg-slate-800 flex-1 p-3 rounded-xl items-center shadow-sm border border-slate-200 dark:border-slate-700 flex-row justify-center gap-2"
                                onPress={handleSettle}
                            >
                                <Image
                                    source={require('../../assets/svg/clear.svg')}
                                    style={{ width: 24, height: 24 }}
                                    tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                                    contentFit="contain"
                                />

                                <Text className="text-slate-900 dark:text-white font-bold text-lg">Clear Debt</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Payment History */}
                    <Text className="text-lg font-bold text-slate-900 dark:text-white mb-4">Payment History</Text>
                    {paymentHistory.length > 0 ? (
                        <View className="space-y-3">
                            {paymentHistory.map((payment) => (
                                <View
                                    key={payment.payment_id}
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-100 dark:border-slate-800"
                                >
                                    <View className="flex-row justify-between items-start mb-2">
                                        <View className="flex-1">
                                            <Text className="font-bold text-slate-900 dark:text-white">
                                                {payment.recipient_name || 'Payment'}
                                            </Text>
                                            <Text className="text-slate-400 text-xs mt-1">
                                                {new Date(payment.payment_date).toLocaleDateString()}
                                            </Text>
                                        </View>
                                        <Text className="text-green-600 dark:text-green-400 font-bold text-lg">
                                            -KES {Number(payment.payment_amount).toLocaleString()}
                                        </Text>
                                    </View>
                                    {payment.raw_sms && (
                                        <View className="mt-1 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                            <Text className="text-slate-500 dark:text-slate-400 text-[10px] italic" numberOfLines={2}>
                                                "{payment.raw_sms}"
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl">
                            <Text className="text-slate-400 text-center py-4">No payments linked yet.</Text>
                        </View>
                    )}
                </View>
            </Animated.ScrollView>

            {/* Link Transaction Modal */}
            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <View className="flex-1 bg-gray-50 dark:bg-[#020617] pt-4">
                    <View className="px-6 py-4 flex-row items-center justify-between border-b border-gray-200 dark:border-slate-800">
                        <Text className="text-xl font-bold text-slate-900 dark:text-white">Link Transaction</Text>
                        <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-gray-200 dark:bg-gray-800 p-2 rounded-full">
                            <FontAwesome name="close" size={16} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
                        <View className="flex-row items-center bg-gray-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            <FontAwesome name="search" size={16} color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} />
                            <TextInput
                                className="flex-1 ml-3 text-slate-900 dark:text-white text-[16px]"
                                placeholder="Search by name or amount..."
                                placeholderTextColor={colorScheme === 'dark' ? '#cbd5e1' : '#94a3b8'}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCorrect={false}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                                    <FontAwesome name="times-circle" size={16} color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {matchesLoading ? (
                        <ActivityIndicator size="large" className="mt-10" color="#3b82f6" />
                    ) : (
                        <FlatList
                            data={filteredMatches}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 24 }}
                            ListHeaderComponent={
                                <Text className="text-slate-500 mb-4">
                                    Select a transaction to link as repayment for this debt.
                                    Only showing {debt.type === 'LIABILITY' ? 'Sent' : 'Received'} transactions not yet linked.
                                </Text>
                            }
                            ListEmptyComponent={
                                <View className="items-center py-10">
                                    <Text className="text-slate-400">No matching transactions found.</Text>
                                    <Text className="text-slate-400 text-xs mt-2">Try refreshing M-PESA SMS.</Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-3 shadow-sm border border-slate-100 dark:border-slate-800"
                                    onPress={() => handleLink(item.id)}
                                >
                                    <View className="flex-row justify-between items-center mb-1">
                                        <Text className="font-bold text-slate-900 dark:text-white flex-1">{item.recipient_name || 'Unknown'}</Text>
                                        <Text className={`font-bold ${item.type === 'SENT' ? 'text-red-500' : 'text-green-500'}`}>
                                            {item.type === 'SENT' ? '-' : '+'} KES {item.amount.toLocaleString()}
                                        </Text>
                                    </View>
                                    <Text className="text-slate-400 text-xs">{new Date(item.date).toLocaleDateString()} • {item.rawSms?.substring(0, 40)}...</Text>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}
