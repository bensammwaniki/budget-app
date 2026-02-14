import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
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

    const progress = Math.min(((debt.principalAmount - debt.currentBalance) / debt.principalAmount) * 100, 100);

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            {/* Header */}
            <View className="px-6 py-4 flex-row items-center justify-between bg-white dark:bg-[#0f172a] shadow-sm">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <Image
                        source={require('../../assets/svg/back.svg')}
                        style={{ width: 24, height: 24 }}
                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                        contentFit="contain"
                    />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-slate-900 dark:text-white">{debt.name}</Text>
                <View style={{ width: 20 }} />
            </View>

            <View className="p-6">
                {/* Status Card */}
                <View className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl shadow-sm mb-6 relative overflow-hidden">
                    <View className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full opacity-10 ${debt.type === 'LIABILITY' ? 'bg-red-500' : 'bg-green-500'}`} />

                    <View className="flex-row justify-between items-start">
                        <View>
                            <Text className="text-slate-500 text-sm mb-1">{debt.type === 'RECEIVABLE' ? 'Owed to You' : 'You Owe'}</Text>
                            <Text className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
                                KES {(debt.currentBalance + (debt.accruedFees || 0)).toLocaleString()}
                            </Text>
                            {(debt.accruedFees || 0) > 0 && (
                                <Text className="text-slate-400 text-xs -mt-3 mb-4 italic">
                                    Includes KES {debt.accruedFees?.toLocaleString()} unbilled maintenance fees
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
                            <View className="flex-row justify-between">
                                <Text className="text-slate-400 text-xs">Paid: KES {(debt.principalAmount - debt.currentBalance).toLocaleString()}</Text>
                                <Text className="text-slate-400 text-xs">Total: KES {debt.principalAmount.toLocaleString()}</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Actions */}
                {debt.status === 'ACTIVE' && debt.type !== 'OVERDRAFT' && (
                    <TouchableOpacity
                        className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-500/30 mb-8 flex-row justify-center gap-2"
                        onPress={openLinkModal}
                    >
                        <FontAwesome name="link" size={16} color="white" />
                        <Text className="text-white font-bold text-lg">Link Repayment</Text>
                    </TouchableOpacity>
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
                                            {payment.recipientName || 'Payment'}
                                        </Text>
                                        <Text className="text-slate-400 text-xs mt-1">
                                            {new Date(payment.payment_date).toLocaleDateString()}
                                        </Text>
                                    </View>
                                    <Text className="text-green-600 dark:text-green-400 font-bold text-lg">
                                        -KES {Number(payment.payment_amount).toLocaleString()}
                                    </Text>
                                </View>
                                {payment.rawSms && (
                                    <Text className="text-slate-400 text-xs mt-1" numberOfLines={1}>
                                        {payment.rawSms}
                                    </Text>
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

            {/* Link Transaction Modal */}
            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
                <View className="flex-1 bg-gray-50 dark:bg-[#020617] pt-4">
                    <View className="px-6 py-4 flex-row items-center justify-between">
                        <Text className="text-xl font-bold text-slate-900 dark:text-white">Link Transaction</Text>
                        <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-gray-200 dark:bg-gray-800 p-2 rounded-full">
                            <FontAwesome name="close" size={16} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    {matchesLoading ? (
                        <ActivityIndicator size="large" className="mt-10" />
                    ) : (
                        <FlatList
                            data={potentialMatches}
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
                                        <Text className="font-bold text-slate-900 dark:text-white flex-1">{item.recipientName || 'Unknown'}</Text>
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
