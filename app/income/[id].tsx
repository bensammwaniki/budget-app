import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTransactions } from '../../services/database';
import { IncomeLog, IncomeSource, incomeService } from '../../services/incomeService';
import { Transaction } from '../../types/transaction';

export default function IncomeDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [source, setSource] = useState<IncomeSource | null>(null);
    const [logs, setLogs] = useState<IncomeLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [linkableTx, setLinkableTx] = useState<Transaction[]>([]);
    const [linking, setLinking] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredLinkableTx = useMemo(() => {
        if (!searchQuery.trim()) return linkableTx;
        const q = searchQuery.toLowerCase();
        return linkableTx.filter(t =>
            (t.recipientName && t.recipientName.toLowerCase().includes(q)) ||
            t.amount.toString().includes(q)
        );
    }, [linkableTx, searchQuery]);

    // Manual income recording state
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualAmount, setManualAmount] = useState('');
    const [manualChannel, setManualChannel] = useState<string | null>(null);
    const [manualNotes, setManualNotes] = useState('');
    const [recordingManual, setRecordingManual] = useState(false);

    const formatWithCommas = (value: string) => {
        const numeric = value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if (!numeric) return '';
        return parseInt(numeric, 10).toLocaleString();
    };

    const handleManualAmountChange = (text: string) => {
        setManualAmount(formatWithCommas(text));
    };

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
    const headerStyle = useAnimatedStyle(() => ({
        backgroundColor: isDark
            ? `rgba(15,23,42,${interpolate(scrollY.value, [0, 60], [0, 1], Extrapolate.CLAMP)})`
            : `rgba(255,255,255,${interpolate(scrollY.value, [0, 60], [0, 1], Extrapolate.CLAMP)})`,
        borderBottomWidth: 1,
        borderBottomColor: isDark
            ? `rgba(255,255,255,${interpolate(scrollY.value, [0, 60], [0, 0.08], Extrapolate.CLAMP)})`
            : `rgba(0,0,0,${interpolate(scrollY.value, [0, 60], [0, 0.06], Extrapolate.CLAMP)})`,
    }));

    const loadData = useCallback(async () => {
        if (!id) return;
        try {
            const [src, srcLogs] = await Promise.all([
                incomeService.getSourceById(id),
                incomeService.getLogs(id),
            ]);
            setSource(src);
            setLogs(srcLogs.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()));
        } catch (e) {
            console.error('Failed to load source:', e);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const fetchLinkable = async () => {
        try {
            const all = await getTransactions();
            // Already linked transactions have an income log with their id
            const existingLogsTx = new Set(logs.filter(l => l.transactionId).map(l => l.transactionId!));
            const eligible = all.filter(t =>
                t.type === 'RECEIVED' &&
                !existingLogsTx.has(t.id)
            );
            setLinkableTx(eligible);
            setShowModal(true);
        } catch (e) {
            Alert.alert('Error', 'Failed to fetch transactions.');
        }
    };

    const handleLink = async (txId: string) => {
        if (!source) return;
        setLinking(txId);
        try {
            await incomeService.linkTransactionToSource(source.id, txId);
            setShowModal(false);
            Alert.alert('Linked!', 'Transaction has been linked to this income source.');
            loadData();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to link transaction.');
        } finally {
            setLinking(null);
        }
    };

    const handleDelete = () => {
        Alert.alert('Delete Source', 'Are you sure? All income logs for this source will also be deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    try {
                        await incomeService.deleteSource(source!.id);
                        router.back();
                    } catch {
                        Alert.alert('Error', 'Failed to delete source.');
                    }
                }
            }
        ]);
    };

    const CHANNELS = [
        { key: 'cash', label: 'Cash', icon: 'money' as const },
        { key: 'bank', label: 'Transfer', icon: 'university' as const },
        { key: 'cheque', label: 'Cheque', icon: 'pencil-square-o' as const },
        { key: 'mpesa', label: 'M-PESA', icon: 'mobile-phone' as const },
        { key: 'other', label: 'Other', icon: 'ellipsis-h' as const },
    ];

    const handleRecordManual = async () => {
        const amount = parseFloat(manualAmount.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
            return;
        }
        if (!manualChannel) {
            Alert.alert('Select Channel', 'Please select how the income was received.');
            return;
        }

        setRecordingManual(true);
        try {
            const channelLabel = CHANNELS.find(c => c.key === manualChannel)?.label || manualChannel;
            const notes = manualNotes.trim() ? `${channelLabel}: ${manualNotes.trim()}` : channelLabel;
            await incomeService.logIncome(source!.id, amount, new Date().toISOString(), undefined, notes);
            setShowManualModal(false);
            setManualAmount('');
            setManualChannel(null);
            setManualNotes('');
            loadData();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to record income.');
        } finally {
            setRecordingManual(false);
        }
    };

    const openManualModal = () => {
        setManualAmount('');
        setManualChannel(null);
        setManualNotes('');
        setShowManualModal(true);
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#10b981" />
            </View>
        );
    }

    if (!source) {
        return (
            <View className="flex-1 items-center justify-center">
                <Text className="text-slate-500">Source not found.</Text>
            </View>
        );
    }

    const themeColor = source.color || '#10b981';
    const totalReceived = logs.reduce((sum, l) => sum + l.amount, 0);
    const FREQ_LABELS: Record<string, string> = {
        MONTHLY: 'Monthly', WEEKLY: 'Weekly', BI_WEEKLY: 'Bi-weekly', IRREGULAR: 'Irregular'
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar style={isDark ? 'light' : 'dark'} />

            {/* Scroll-reactive header */}
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top }, headerStyle]}>
                <View className="px-6 py-4 flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image source={require('../../assets/svg/back.svg')} style={{ width: 24, height: 24 }} tintColor={isDark ? '#fff' : '#1e293b'} contentFit="contain" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white" numberOfLines={1}>{source.name}</Text>
                    <TouchableOpacity onPress={handleDelete} className="p-2 -mr-2">
                        <FontAwesome name="trash-o" size={22} color="#ef4444" />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 120, paddingHorizontal: 24 }}
            >
                {/* Stats card */}
                <View className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 mb-6 border border-slate-100 dark:border-slate-800 overflow-hidden relative">
                    <View className="absolute right-[-20] top-[-20] w-32 h-32 rounded-bl-full opacity-10" style={{ backgroundColor: themeColor }} />

                    <View className="flex-row justify-between items-start mb-4">
                        <View>
                            <Text className="text-slate-400 text-sm mb-1">Total Received</Text>
                            <Text className="text-4xl font-bold text-slate-900 dark:text-white">KES {totalReceived.toLocaleString()}</Text>
                        </View>
                        <View className="px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}20` }}>
                            <Text className="text-xs font-bold" style={{ color: themeColor }}>{source.status}</Text>
                        </View>
                    </View>

                    <View className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl gap-2 border border-slate-100 dark:border-slate-700/50">
                        <View className="flex-row justify-between">
                            <Text className="text-slate-500 text-xs">Frequency</Text>
                            <Text className="text-slate-900 dark:text-white font-bold text-xs">{FREQ_LABELS[source.frequency]}</Text>
                        </View>
                        {source.expectedAmount && (
                            <View className="flex-row justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                                <Text className="text-slate-500 text-xs">Expected per period</Text>
                                <Text className="text-slate-900 dark:text-white font-bold text-xs">KES {source.expectedAmount.toLocaleString()}</Text>
                            </View>
                        )}
                        <View className="flex-row justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                            <Text className="text-slate-500 text-xs">Total Entries</Text>
                            <Text className="text-slate-900 dark:text-white font-bold text-xs">{logs.length}</Text>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                <View className="flex-row gap-3 mb-8">
                    <TouchableOpacity
                        onPress={fetchLinkable}
                        className="flex-1 p-4 rounded-2xl flex-row justify-center items-center gap-2 border-2"
                        style={{ borderColor: themeColor, backgroundColor: `${themeColor}15` }}
                    >
                        <Image
                            source={require(`../../assets/svg/link-sms.svg`)}
                            style={{ width: 24, height: 24 }}
                            tintColor={themeColor}
                            contentFit="contain"
                        />
                        <Text className="font-bold text-sm" style={{ color: themeColor }}>Link SMS</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={openManualModal}
                        className="flex-1 p-4 rounded-2xl flex-row justify-center items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Image
                            source={require(`../../assets/svg/clear.svg`)}
                            style={{ width: 16, height: 16 }}
                            tintColor={"white"}
                            contentFit="contain"
                        />
                        <Text className="font-bold text-white text-sm">Record Income</Text>
                    </TouchableOpacity>
                </View>

                {/* History */}
                <Text className="text-slate-900 dark:text-white font-bold text-lg mb-4">Income History</Text>

                {logs.length === 0 ? (
                    <View className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-100 dark:border-slate-800 items-center">
                        <FontAwesome name="inbox" size={40} color="#cbd5e1" />
                        <Text className="text-slate-500 mt-4 text-center font-medium">No entries yet.</Text>
                        <Text className="text-slate-400 text-xs mt-1 text-center">Link income transactions to start tracking.</Text>
                    </View>
                ) : (
                    <View className="space-y-3">
                        {logs.map(log => (
                            <View key={log.id} className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex-row justify-between items-center mb-2">
                                <View className="flex-row items-center flex-1">
                                    <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}20` }}>
                                        <FontAwesome name={log.transactionId ? 'mobile-phone' : 'money'} size={14} color={themeColor} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-slate-900 dark:text-white" numberOfLines={1}>
                                            {log.notes || 'Income Received'}
                                        </Text>
                                        <Text className="text-slate-400 text-xs mt-0.5">
                                            {new Date(log.receivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </Text>
                                    </View>
                                </View>
                                <Text className="text-slate-900 dark:text-white font-bold text-lg">KES {log.amount.toLocaleString()}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </Animated.ScrollView>

            {/* Link Transaction Modal */}
            <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
                <View className="flex-1 bg-gray-50 dark:bg-[#020617] pt-6">
                    <View className="px-6 pb-4 flex-row justify-between items-center border-b border-gray-200 dark:border-slate-800">
                        <Text className="text-xl font-bold text-slate-900 dark:text-white">Link Income Transaction</Text>
                        <TouchableOpacity onPress={() => setShowModal(false)} className="p-2 -mr-2">
                            <FontAwesome name="times" size={20} color={isDark ? '#94a3b8' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
                        <View className="flex-row items-center bg-gray-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            <FontAwesome name="search" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                            <TextInput
                                className="flex-1 ml-3 text-slate-900 dark:text-white text-[16px]"
                                placeholder="Search by name or amount..."
                                placeholderTextColor={isDark ? '#cbd5e1' : '#94a3b8'}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCorrect={false}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                                    <FontAwesome name="times-circle" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {filteredLinkableTx.length === 0 ? (
                        <View className="flex-1 items-center justify-center p-6">
                            <Text className="text-slate-500 dark:text-slate-400 text-center">
                                {searchQuery ? 'No matching transactions found.' : 'No unlinked income transactions found.'}
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredLinkableTx}
                            keyExtractor={t => t.id}
                            contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                            renderItem={({ item: tx }) => (
                                <TouchableOpacity
                                    onPress={() => handleLink(tx.id)}
                                    disabled={linking === tx.id}
                                    className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl mb-3 flex-row justify-between items-center border border-slate-100 dark:border-slate-800"
                                >
                                    <View className="flex-row items-center flex-1 pr-4">
                                        <View className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 items-center justify-center mr-3">
                                            <FontAwesome name="arrow-down" size={12} color="#10b981" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-slate-900 dark:text-white font-semibold" numberOfLines={1}>{tx.recipientName || 'Received'}</Text>
                                            <Text className="text-slate-400 text-xs">{new Date(tx.date).toLocaleDateString()}</Text>
                                        </View>
                                    </View>
                                    <View className="flex-row items-center gap-3">
                                        <Text className="text-emerald-600 dark:text-emerald-400 font-bold">KES {tx.amount.toLocaleString()}</Text>
                                        {linking === tx.id
                                            ? <ActivityIndicator size="small" color={themeColor} />
                                            : <FontAwesome name="link" size={14} color={themeColor} />
                                        }
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </Modal>

            {/* Manual Income Recording Modal */}
            <Modal visible={showManualModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowManualModal(false)}>
                <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View className="flex-1 bg-gray-50 dark:bg-[#020617] pt-6 mt-6">
                        <View className="px-6 pb-4 flex-row justify-between items-center border-b border-gray-200 dark:border-slate-800">
                            <Text className="text-xl font-bold text-slate-900 dark:text-white">Record Income</Text>
                            <TouchableOpacity onPress={() => setShowManualModal(false)} className="p-2 -mr-2">
                                <Image
                                    source={require(`../../assets/svg/close.svg`)}
                                    style={{ width: 18, height: 18 }}
                                    tintColor={isDark ? '#94a3b8' : '#64748b'}
                                    contentFit="contain"
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
                            {/* Amount */}
                            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Amount (KES)</Text>
                            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
                                <Text className="text-slate-400 font-bold mr-2">KES</Text>
                                <TextInput
                                    className="flex-1 text-slate-900 dark:text-white font-semibold text-[16px]"
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    keyboardType="numeric"
                                    value={manualAmount}
                                    onChangeText={handleManualAmountChange}
                                    autoFocus
                                />
                            </View>

                            {/* Channel Picker */}
                            <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Received Via</Text>
                            <View className="flex-row flex-wrap gap-3 mb-6">
                                {CHANNELS.map(ch => (
                                    <TouchableOpacity
                                        key={ch.key}
                                        onPress={() => setManualChannel(ch.key)}
                                        className={`flex-row items-center px-3 py-1 rounded-2xl border gap-2 ${manualChannel === ch.key
                                            ? 'border-transparent'
                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b]'
                                            }`}
                                        style={manualChannel === ch.key ? { backgroundColor: `${themeColor}20`, borderColor: themeColor } : {}}
                                    >
                                        <Text
                                            className="font-semibold text-[10px] uppercase"
                                            style={{ color: manualChannel === ch.key ? themeColor : (isDark ? '#94a3b8' : '#64748b') }}
                                        >
                                            {ch.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Optional notes */}
                            <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Notes (optional)</Text>
                            <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-4 mb-8 border border-slate-200 dark:border-slate-700">
                                <TextInput
                                    className="text-slate-900 dark:text-white"
                                    placeholder="e.g. from client ABC, January salary..."
                                    placeholderTextColor="#94a3b8"
                                    multiline
                                    numberOfLines={3}
                                    value={manualNotes}
                                    onChangeText={setManualNotes}
                                />
                            </View>

                            {/* Confirm */}
                            <TouchableOpacity
                                onPress={handleRecordManual}
                                disabled={recordingManual}
                                className="p-4 rounded-xl flex-row justify-center items-center gap-2"
                                style={{ backgroundColor: themeColor }}
                            >
                                {recordingManual
                                    ? <ActivityIndicator color="white" />
                                    : <>
                                        <Image
                                            source={require(`../../assets/svg/confirm.svg`)}
                                            style={{ width: 18, height: 18 }}
                                            tintColor={"white"}
                                            contentFit="contain"
                                        />
                                        <Text className="text-white font-bold text-lg">Confirm</Text>
                                    </>
                                }
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
