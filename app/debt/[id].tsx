import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageSheetSearchModal from '../../components/modals/PageSheetSearchModal';
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
    const [openingLinkModal, setOpeningLinkModal] = useState(false);
    const openingLinkModalRef = useRef(false);
    const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [unlinkingTxId, setUnlinkingTxId] = useState<string | null>(null);

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

    const loadData = useCallback(async () => {
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
    }, [id]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const openLinkModal = async () => {
        if (!debt || modalVisible || openingLinkModal || openingLinkModalRef.current) return;
        openingLinkModalRef.current = true;
        setOpeningLinkModal(true);
        setModalVisible(true);
        setMatchesLoading(true);
        try {
            const matches = await debtService.getPotentialMatches(debt.id);
            setPotentialMatches(matches);
        } catch (error) {
            console.error(error);
        } finally {
            setMatchesLoading(false);
            openingLinkModalRef.current = false;
            setOpeningLinkModal(false);
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
            `Are you sure you want to mark "${(debt.name || '').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}" as fully paid? This is usually for payments made in cash.`,
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
                        } catch {
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

    const handleUnlinkPayment = (transactionId: string) => {
        Alert.alert(
            'Unlink Payment',
            'Remove this linked SMS/payment from this debt?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unlink',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setUnlinkingTxId(transactionId);
                            await debtService.unlinkTransaction(transactionId);
                            await loadData();
                            Alert.alert('Success', 'Payment unlinked successfully.');
                        } catch (error: any) {
                            Alert.alert('Error', error?.message || 'Failed to unlink payment.');
                        } finally {
                            setUnlinkingTxId(null);
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

    const originalAmount = debt.isReducingBalance
        ? debt.principalAmount
        : debt.principalAmount + (debt.principalAmount * (debt.interestRate || 0) / 100);
    const balanceWithFees = debt.currentBalance + (debt.accruedFees || 0);
    const projectedTotal = balanceWithFees + (debt.projectedInterest || 0);
    const linkedPaymentCount = Number(debt.linkedPaymentCount || 0);
    const linkedPaymentAmount = Number(debt.linkedPaymentAmount || 0);
    const mergedFromCount = Number(debt.mergedFromCount || 0);
    const paidFromLinks = linkedPaymentCount > 0 ? linkedPaymentAmount : 0;
    const currentBalanceDisplay = balanceWithFees;
    const outstandingDisplay = balanceWithFees;
    const progress = linkedPaymentCount > 0
        ? Math.max(0, Math.min((paidFromLinks / originalAmount) * 100, 100))
        : 0;

    return (
        <View className="flex-1 app-screen">
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
                    <Text className="text-xl font-bold text-slate-900 dark:text-white">
                        {(() => {
                            const formattedName = (debt.name || '')
                                .toLowerCase()
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ');
                            return formattedName.length > 15 ? `${formattedName.slice(0, 27)}...` : formattedName;
                        })()}
                    </Text>
                    <TouchableOpacity onPress={handleDeleteDebt} className="p-2 -mr-2">
                        <FontAwesome name="trash-o" size={22} color="#ef4444"/>
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
                    <View className="bg-white dark:bg-[#0f172a] p-6 rounded-[12px] mb-6 relative overflow-hidden border border-slate-100 dark:border-slate-800">
                        <View className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full opacity-10 ${debt.type === 'LIABILITY' ? 'bg-red-500' : 'bg-green-500'}`} />

                        <View className="flex-row justify-between items-start">
                            <View>
                                <Text className="text-slate-500 text-sm mb-1">
                                    {mergedFromCount > 0
                                        ? 'Merged Balance'
                                        : linkedPaymentCount > 0
                                        ? (debt.type === 'RECEIVABLE' ? 'Owed to You' : 'You Owe')
                                        : 'Current Balance'}
                                </Text>
                                <Text className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
                                    KES {currentBalanceDisplay.toLocaleString()}
                                </Text>
                                {(debt.projectedInterest || 0) > 0 && (
                                    <View className="mb-4">
                                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-1">
                                            Estimated Total
                                        </Text>
                                        <Text className="text-blue-500 font-bold text-lg">
                                            KES {projectedTotal.toLocaleString()}
                                        </Text>
                                        <Text className="text-slate-400 text-[10px] uppercase font-bold">
                                            Projected by {debt.dueDate?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                        </Text>
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
                                    <View
                                        className={`h-full ${debt.type === 'LIABILITY' ? 'bg-red-500' : 'bg-green-500'}`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </View>
                                <View className="flex-row justify-between mb-4">
                                    <View>
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                                            {mergedFromCount > 0
                                                ? 'Merged Debts'
                                                : linkedPaymentCount > 0
                                                    ? 'Total Paid'
                                                    : 'Linked Payments'}
                                        </Text>
                                        <Text className="text-slate-900 dark:text-white font-bold">
                                            {mergedFromCount > 0
                                                ? `${mergedFromCount} debt${mergedFromCount > 1 ? 's' : ''}`
                                                : linkedPaymentCount > 0
                                                    ? `KES ${paidFromLinks.toLocaleString()}`
                                                    : 'KES 0'}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                                            {mergedFromCount > 0
                                                ? 'Merged Total'
                                                : linkedPaymentCount > 0
                                                    ? `Total ${debt.type === 'LIABILITY' ? 'Debt' : 'Loan'}`
                                                    : 'Current Amount'}
                                        </Text>
                                        <Text className="text-slate-900 dark:text-white font-bold">KES {outstandingDisplay.toLocaleString()}</Text>
                                    </View>
                                </View>
                            </>
                        )}

                        <View className="flex-row gap-3 mt-2">
                            <TouchableOpacity
                                onPress={() => router.push({ pathname: '/debt/merge', params: { sourceId: debt.id } })}
                                className="flex-1 bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-full items-center"
                            >
                                <Text className="text-slate-700 dark:text-slate-200 font-semibold">Merge with another debt</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="mt-2 pt-4 border-t border-slate-50 dark:border-slate-800 flex-row justify-between items-center">
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
                                className="bg-blue-600 flex-1 p-3 rounded-[12px] items-center flex-row justify-center gap-2"
                                onPress={openLinkModal}
                                disabled={openingLinkModal || modalVisible}
                            >
                                <FontAwesome name="link" size={16} color="white" />
                                <Text className="text-white font-bold text-lg">Link</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="bg-white dark:bg-slate-800 flex-1 p-3 rounded-[12px] items-center border border-slate-200 dark:border-slate-700 flex-row justify-center gap-2"
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

                    {/* Debt History */}
                    <Text className="text-lg font-bold text-slate-900 dark:text-white mb-4">Debt History</Text>
                    {paymentHistory.length > 0 ? (
                        <View className="space-y-3">
                            {paymentHistory.map((payment) => (
                                <View
                                    key={payment.payment_id || payment.transaction_id}
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-[12px] border border-slate-100 dark:border-slate-800"
                                >
                                    {(() => {
                                        const isPrincipalEvent = payment.transaction_kind === 'DEBT_PRINCIPAL';
                                        const eventDate = payment.payment_date || payment.transaction_date;
                                        const displayAmount = Number(payment.payment_amount ?? payment.transaction_amount ?? 0);
                                        const isIncoming = payment.transaction_type === 'RECEIVED';
                                        const amountPrefix = isIncoming ? '+' : '-';
                                        const amountClass = isIncoming
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400';
                                        const title = isPrincipalEvent
                                            ? (debt.type === 'RECEIVABLE' ? 'Debt Created' : 'Loan Received')
                                            : (debt.type === 'RECEIVABLE' ? 'Repayment Received' : 'Debt Payment');

                                        return (
                                            <>
                                    <View className="flex-row justify-between items-start ">
                                        <View className="flex-1">
                                            <Text className="font-bold text-slate-900 dark:text-white">
                                                {payment.recipient_name || title}
                                            </Text>
                                            <Text className="text-slate-400 text-xs mt-1">
                                                {title} • {new Date(eventDate).toLocaleDateString()}
                                            </Text>
                                        </View>
                                        <View className="items-end mt-[-5px]">
                                            {payment.payment_id && payment.transaction_id && (
                                            <TouchableOpacity
                                                onPress={() => handleUnlinkPayment(payment.transaction_id)}
                                                disabled={unlinkingTxId === payment.transaction_id}
                                                className="py-1"
                                            >
                                                {unlinkingTxId === payment.transaction_id ? (
                                                    <ActivityIndicator size="small" color="#ef4444" />
                                                ) : (
                                                    <Text className="text-red-600 dark:text-red-400 font-semibold text-xs">Unlink</Text>
                                                )}
                                            </TouchableOpacity>
                                            )}
                                            <Text className={`${amountClass} font-bold text-lg`}>
                                                {amountPrefix}KES {displayAmount.toLocaleString()}
                                            </Text>
                                        </View>
                                    </View>
                                            </>
                                        );
                                    })()}
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View className="bg-white dark:bg-[#0f172a] p-4 rounded-[12px] border border-slate-100 dark:border-slate-800">
                            <Text className="text-slate-400 text-center py-4">No history linked yet.</Text>
                        </View>
                    )}
                </View>
            </Animated.ScrollView>

            <PageSheetSearchModal
                visible={modalVisible}
                title="Link Transaction"
                colorScheme={colorScheme}
                searchQuery={searchQuery}
                onChangeSearch={setSearchQuery}
                onClearSearch={() => setSearchQuery('')}
                onClose={() => setModalVisible(false)}
            >
                {matchesLoading ? (
                    <ActivityIndicator size="large" className="mt-10" color="#3b82f6" />
                ) : (
                    <FlatList
                        data={filteredMatches}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ padding: 24 }}
                        ListHeaderComponent={
                            <Text className="text-slate-500 mb-2 text-[12px]">
                                Select a transaction to link as repayment for this debt.
                                Only showing {debt?.type === 'LIABILITY' ? 'Sent' : 'Received'} transactions not yet linked.
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
                                className="bg-white dark:bg-[#0f172a] p-4 rounded-[12px] mb-3 border border-slate-100 dark:border-slate-800"
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
            </PageSheetSearchModal>
        </View>
    );
}
