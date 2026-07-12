import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageSheetModal from '../../components/modals/PageSheetModal';
import PageSheetSearchModal from '../../components/modals/PageSheetSearchModal';
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
    const [openingLinkModal, setOpeningLinkModal] = useState(false);
    const openingLinkModalRef = useRef(false);
    const [linkableTx, setLinkableTx] = useState<Transaction[]>([]);
    const [linking, setLinking] = useState<string | null>(null);
    const [unlinking, setUnlinking] = useState<string | null>(null);
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
    const [markingPaidOff, setMarkingPaidOff] = useState(false);

    const parseAmountValue = (value: unknown): number => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const parsed = parseFloat(value.replace(/,/g, '').trim());
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    };

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
            const src = await incomeService.getSourceById(id);
            if (src) await incomeService.populateScheduledIncome(src);
            const srcLogs = await incomeService.getLogs(id);
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
        if (showModal || openingLinkModal || openingLinkModalRef.current) return;
        openingLinkModalRef.current = true;
        setOpeningLinkModal(true);
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
        } catch {
            Alert.alert('Error', 'Failed to fetch transactions.');
        } finally {
            openingLinkModalRef.current = false;
            setOpeningLinkModal(false);
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

    const handleUnlink = (transactionId: string) => {
        Alert.alert('Unlink transaction', 'Remove this linked transaction from the income history?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Unlink',
                onPress: async () => {
                    setUnlinking(transactionId);
                    try {
                        await incomeService.unlinkTransaction(transactionId);
                        await loadData();
                    } catch (e: any) {
                        Alert.alert('Error', e.message || 'Failed to unlink transaction.');
                    } finally {
                        setUnlinking(null);
                    }
                },
            },
        ]);
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

    const handleMarkPaidOff = () => {
        const currentStatus = (source?.status || '').toUpperCase();
        if (!source || markingPaidOff || currentStatus === 'INACTIVE') return;
        Alert.alert(
            'Mark as Paid Off',
            'This will mark the source as fully paid off without deleting history. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Mark Paid Off',
                    onPress: async () => {
                        setMarkingPaidOff(true);
                        try {
                            const currentTotal = logs.reduce((sum, l) => sum + l.amount, 0);
                            const expectedTotal = parseAmountValue(source.expectedAmount);
                            const finalExpectedTotal = Number(Math.max(expectedTotal, currentTotal).toFixed(2));
                            const remainingToFull = Number((finalExpectedTotal - currentTotal).toFixed(2));

                            if (remainingToFull > 0) {
                                await incomeService.logIncome(
                                    source.id,
                                    remainingToFull,
                                    new Date().toISOString(),
                                    undefined,
                                    'Auto top-up: source marked as paid off'
                                );
                            }

                            await incomeService.updateSource(source.id, {
                                status: 'INACTIVE',
                                expectedAmount: finalExpectedTotal,
                            });
                            setShowManualModal(false);
                            setManualAmount('');
                            setManualChannel(null);
                            setManualNotes('');
                            await loadData();
                            if (remainingToFull > 0) {
                                Alert.alert('Updated', `Marked as paid off and added KES ${remainingToFull.toLocaleString()} to reach the full amount.`);
                            } else {
                                Alert.alert('Updated', 'Income source marked as paid off.');
                            }
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'Failed to update source status.');
                        } finally {
                            setMarkingPaidOff(false);
                        }
                    }
                }
            ]
        );
    };

    const openManualModal = () => {
        if (showManualModal || recordingManual || markingPaidOff) return;
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
    const expectedAmountValue = parseAmountValue(source.expectedAmount);
    const hasExpectedAmount = expectedAmountValue > 0;
    const isPaidOff = (source.status || '').toUpperCase() === 'INACTIVE';
    const FREQ_LABELS: Record<string, string> = {
        MONTHLY: 'Monthly', WEEKLY: 'Weekly', BI_WEEKLY: 'Bi-weekly', IRREGULAR: 'Irregular'
    };

    return (
        <View className="flex-1 app-screen">
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
                            <Text className="text-slate-400 text-sm mb-1">Income schedule</Text>
                            <Text className="text-2xl font-bold text-slate-900 dark:text-white">
                                {source.isRecurring ? FREQ_LABELS[source.frequency] : 'One-time'}
                            </Text>
                        </View>
                        <View className="px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}20` }}>
                            <Text className="text-xs font-bold" style={{ color: themeColor }}>
                                {isPaidOff ? 'PAID OFF' : 'ACTIVE'}
                            </Text>
                        </View>
                    </View>

                    <View className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl gap-2 border border-slate-100 dark:border-slate-700/50">
                        {source.isRecurring && (
                            <View className="flex-row justify-between">
                                <Text className="text-slate-500 text-xs">Frequency</Text>
                                <Text className="text-slate-900 dark:text-white font-bold text-xs">{FREQ_LABELS[source.frequency]}</Text>
                            </View>
                        )}
                        {hasExpectedAmount && (
                            <View className="flex-row justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                                <Text className="text-slate-500 text-xs">Expected per period</Text>
                                <Text className="text-slate-900 dark:text-white font-bold text-xs">KES {expectedAmountValue.toLocaleString()}</Text>
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
                    {!source.smsSenderId && (
                    <TouchableOpacity
                        onPress={fetchLinkable}
                        disabled={openingLinkModal || showModal}
                        className="flex-1 p-4 rounded-2xl flex-row justify-center items-center gap-2 border"
                        style={{ borderColor: themeColor, backgroundColor: `${themeColor}15` }}
                    >
                        <Image
                            source={require(`../../assets/svg/link-sms.svg`)}
                            style={{ width: 24, height: 24 }}
                            tintColor={themeColor}
                            contentFit="contain"
                        />
                        <Text className="font-bold text-sm" style={{ color: themeColor }}>Set up SMS match</Text>
                    </TouchableOpacity>
                    )}

                    {!source.isRecurring && <TouchableOpacity
                        onPress={openManualModal}
                        disabled={showManualModal || recordingManual}
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
                    }
                </View>

                {source.isRecurring && source.smsSenderId && (
                    <View className="mb-8 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-900/20">
                        <Text className="font-bold text-emerald-800 dark:text-emerald-300">SMS auto-recording is on</Text>
                        <Text className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">New incoming SMS messages from the linked sender are added here automatically.</Text>
                    </View>
                )}

                {/* History */}
                <Text className="text-slate-900 dark:text-white font-bold text-lg mb-4">Income History</Text>

                {logs.length === 0 ? (
                    <View className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-100 dark:border-slate-800 items-center">
                        <FontAwesome name="inbox" size={40} color="#cbd5e1" />
                        <Text className="text-slate-500 mt-4 text-center font-medium">No entries yet.</Text>
                        <Text className="text-slate-400 text-xs mt-1 text-center">Your scheduled income will appear here automatically.</Text>
                    </View>
                ) : (
                    <View className="space-y-3">
                        {logs.map(log => (
                            <View key={log.id} className="bg-white dark:bg-[#0f172a] p-4 rounded-[12px] border border-slate-100 dark:border-slate-800 mb-2">
                                <View className="flex-row justify-between items-start">
                                    <View className="flex-row items-center flex-1">
                                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}18` }}>
                                            <FontAwesome name={log.transactionId ? 'mobile-phone' : 'money'} size={13} color={themeColor} />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-slate-900 dark:text-white" numberOfLines={1}>
                                                {log.notes || 'Income Received'}
                                            </Text>
                                            <View className="flex-row items-center flex-wrap gap-1 mt-1">
                                                <Text className="text-slate-400 text-xs">
                                                    {new Date(log.receivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </Text>
                                                <Text className="text-slate-300 dark:text-slate-600 text-xs">•</Text>
                                                <Text className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                                                    {log.transactionId ? 'Confirmed SMS' : log.isScheduled ? 'Scheduled' : 'Manual entry'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View className="items-end mt-[-5px]">
                                        {log.transactionId && (
                                            <TouchableOpacity
                                                onPress={() => handleUnlink(log.transactionId!)}
                                                disabled={unlinking === log.transactionId}
                                                className="py-1"
                                            >
                                                {unlinking === log.transactionId ? (
                                                    <ActivityIndicator size="small" color="#ef4444" />
                                                ) : (
                                                    <Text className="text-red-600 dark:text-red-400 font-semibold text-xs">Unlink</Text>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        <Text className="font-bold text-lg" style={{ color: themeColor }}>
                                            KES {log.amount.toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </Animated.ScrollView>

            <PageSheetSearchModal
                visible={showModal}
                title="Link Income Transaction"
                colorScheme={colorScheme}
                searchQuery={searchQuery}
                onChangeSearch={setSearchQuery}
                onClearSearch={() => setSearchQuery('')}
                onClose={() => setShowModal(false)}
                useFontAwesomeSearch
                closeIconType="fontawesome"
            >
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
            </PageSheetSearchModal>

            <PageSheetModal
                visible={showManualModal}
                title="Record Income"
                colorScheme={colorScheme}
                onClose={() => setShowManualModal(false)}
                keyboardAvoiding
            >
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
                                disabled={recordingManual || markingPaidOff}
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

                            <TouchableOpacity
                                onPress={handleMarkPaidOff}
                                disabled={recordingManual || markingPaidOff || isPaidOff}
                                className="mt-3 p-4 rounded-xl flex-row justify-center items-center gap-2 border"
                                style={{
                                    borderColor: isPaidOff ? '#94a3b8' : '#0f766e',
                                    backgroundColor: isPaidOff
                                        ? (isDark ? 'rgba(51,65,85,0.4)' : '#f1f5f9')
                                        : (isDark ? 'rgba(15,118,110,0.2)' : '#f0fdfa')
                                }}
                            >
                                {markingPaidOff
                                    ? <ActivityIndicator color="#0f766e" />
                                    : <>
                                        <FontAwesome
                                            name={isPaidOff ? 'check-circle' : 'flag-checkered'}
                                            size={16}
                                            color={isPaidOff ? '#94a3b8' : '#0f766e'}
                                        />
                                        <Text
                                            className="font-bold text-base"
                                            style={{ color: isPaidOff ? '#94a3b8' : '#0f766e' }}
                                        >
                                            {isPaidOff ? 'Paid Off' : 'Mark as Paid Off'}
                                        </Text>
                                    </>
                                }
                            </TouchableOpacity>
                </ScrollView>
            </PageSheetModal>
        </View>
    );
}
