import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase } from '../../services/database';
import {
    getFinancialMonthRange,
    getFinancialSettings,
    getPreviousFinancialMonthRange,
    getFreshStartEffectiveDate,
} from '../../services/financialSettingsService';
import { IncomeLog, IncomeSource, incomeService } from '../../services/incomeService';

export default function IncomeScreen() {
    const [sources, setSources] = useState<IncomeSource[]>([]);
    const [logs, setLogs] = useState<IncomeLog[]>([]);
    const [financialMonthStart, setFinancialMonthStart] = useState(1);
    const [freshStartIncomeDate, setFreshStartIncomeDate] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const loadData = async () => {
        try {
            await initDatabase();
            const [fetchedSources, fetchedLogs, financialSettings] = await Promise.all([
                incomeService.getSources(),
                incomeService.getLogs(),
                getFinancialSettings(),
            ]);
            setSources(fetchedSources);
            setLogs(fetchedLogs);
            setFinancialMonthStart(financialSettings.monthStartDay);
            setFreshStartIncomeDate(
                financialSettings.freshStart?.resetIncome
                    ? getFreshStartEffectiveDate(financialSettings.freshStart)
                    : null
            );
        } catch (e) {
            console.error('Failed to load income data:', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const thisMonthRange = useMemo(() => getFinancialMonthRange(new Date(), financialMonthStart), [financialMonthStart]);
    const lastMonthRange = useMemo(() => getPreviousFinancialMonthRange(new Date(), financialMonthStart), [financialMonthStart]);
    const effectiveLogs = useMemo(() => {
        if (!freshStartIncomeDate) return logs;
        return logs.filter(log => new Date(log.receivedAt) >= freshStartIncomeDate);
    }, [freshStartIncomeDate, logs]);

    const thisMonthTotal = effectiveLogs.filter(l => {
        const receivedAt = new Date(l.receivedAt);
        return receivedAt >= thisMonthRange.start && receivedAt <= thisMonthRange.end;
    })
        .reduce((sum, l) => sum + l.amount, 0);
    const lastMonthTotal = effectiveLogs.filter(l => {
        const d = new Date(l.receivedAt);
        return d >= lastMonthRange.start && d <= lastMonthRange.end;
    }).reduce((sum, l) => sum + l.amount, 0);

    const trend = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
    const trendUp = trend >= 0;

    const FREQ_LABELS: Record<string, string> = {
        MONTHLY: 'Monthly', WEEKLY: 'Weekly', BI_WEEKLY: 'Bi-weekly', IRREGULAR: 'Irregular'
    };

    const parseAmountValue = (value: unknown): number => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const parsed = parseFloat(value.replace(/,/g, '').trim());
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    };

    const sourceSummaries = useMemo(() => {
        const grouped = new Map<string, { totalReceived: number; entryCount: number; lastReceivedAt: string | null }>();

        for (const log of effectiveLogs) {
            const current = grouped.get(log.sourceId);
            const receivedAtTime = new Date(log.receivedAt).getTime();

            if (!current) {
                grouped.set(log.sourceId, {
                    totalReceived: log.amount,
                    entryCount: 1,
                    lastReceivedAt: log.receivedAt,
                });
                continue;
            }

            const currentLastTime = current.lastReceivedAt ? new Date(current.lastReceivedAt).getTime() : 0;
            current.totalReceived += log.amount;
            current.entryCount += 1;
            if (receivedAtTime > currentLastTime) {
                current.lastReceivedAt = log.receivedAt;
            }
        }

        return grouped;
    }, [effectiveLogs]);

    const renderSource = ({ item }: { item: IncomeSource }) => {
        const summary = sourceSummaries.get(item.id);
        const totalReceived = summary?.totalReceived ?? 0;
        const entryCount = summary?.entryCount ?? 0;
        const lastReceivedAt = summary?.lastReceivedAt ?? null;
        const expectedAmountValue = parseAmountValue(item.expectedAmount);
        const hasExpectedAmount = expectedAmountValue > 0;
        const isPaidOff = (item.status || '').toUpperCase() === 'INACTIVE';
        const displayTotalReceived = isPaidOff && hasExpectedAmount
            ? Math.max(totalReceived, expectedAmountValue)
            : totalReceived;
        const themeColor = item.color || '#10b981';
        const progress = hasExpectedAmount
            ? Math.min((displayTotalReceived / expectedAmountValue) * 100, 100)
            : (isPaidOff ? 100 : 0);
        const remainingAmount = hasExpectedAmount
            ? Math.max(0, expectedAmountValue - displayTotalReceived)
            : 0;
        const frequencyLabel = item.isRecurring ? FREQ_LABELS[item.frequency] : 'One-time';

        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => router.push(`/income/${item.id}`)}
                className="app-card p-4 mb-3 mx-4"
            >
                <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                        <Text className="text-slate-900 dark:text-white font-bold text-[15px]" numberOfLines={1}>
                            {item.name}
                        </Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">
                            Income Source • {frequencyLabel}
                        </Text>
                        {hasExpectedAmount && (
                            <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                                Target KES {expectedAmountValue.toLocaleString()} • {progress.toFixed(1)}%
                            </Text>
                        )}
                        {!hasExpectedAmount && (
                            <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                                {entryCount} entr{entryCount === 1 ? 'y' : 'ies'} logged
                            </Text>
                        )}
                        <View className="flex-row items-center flex-wrap gap-1 mt-1">
                            {lastReceivedAt && (
                                <>
                                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                        Last:
                                    </Text>
                                    <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                        {new Date(lastReceivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                    </Text>
                                    <Text className="text-[10px] text-slate-400 dark:text-slate-500">•</Text>
                                </>
                            )}
                            <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                Entries:
                            </Text>
                            <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                {entryCount}
                            </Text>
                        </View>
                    </View>

                    <View className="items-end">
                        {isPaidOff && (
                            <View className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-2">
                                <Text className="text-[9px] font-bold uppercase tracking-[0.8px] text-emerald-700 dark:text-emerald-300">
                                    Paid Off
                                </Text>
                            </View>
                        )}
                        <Text className="font-black text-[15px]" style={{ color: themeColor }}>
                            KES {displayTotalReceived.toLocaleString()}
                        </Text>
                        <Text className="text-slate-400 text-[10px] text-right mt-0.5">
                            Collected
                        </Text>
                        {hasExpectedAmount && !isPaidOff && (
                            <Text className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">
                                Remaining KES {remainingAmount.toLocaleString()}
                            </Text>
                        )}
                    </View>
                </View>

                {hasExpectedAmount && !isPaidOff && (
                    <View className="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <View
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(0, Math.min(progress, 100))}%`, backgroundColor: themeColor }}
                        />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#10b981" />
            </View>
        );
    }

    return (
        <View className="flex-1 app-screen" style={{ paddingTop: insets.top }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />

            {/* Header */}
            <View className="px-4 pt-6 pb-2 flex-row justify-between items-center">
                <Text className="text-3xl font-bold text-slate-900 dark:text-white">Income</Text>
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        onPress={() => router.push('/income/detect')}
                        className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full items-center justify-center"
                    >
                        <FontAwesome name="magic" size={14} color="#10b981" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => router.push('/income/add')}
                        className="w-10 h-10 bg-emerald-600 rounded-full items-center justify-center"
                    >
                        <Image
                            source={require('../../assets/svg/plus.svg')}
                            style={{ width: 18, height: 18 }}
                            tintColor={"white"}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Summary Card */}
            <View className="mx-4 mt-4 mb-6 bg-emerald-600 rounded-[16px] p-5 overflow-hidden relative">
                <View className="absolute right-[-18] top-[-18] opacity-10">
                    <FontAwesome name="line-chart" size={132} color="white" />
                </View>
                <Text className="text-emerald-100 text-[11px] font-bold uppercase tracking-[1px] mb-1">Income Overview</Text>
                <Text className="text-white text-[30px] font-black mb-4">KES {thisMonthTotal.toLocaleString()}</Text>

                <View className="flex-row justify-between items-end">
                    <View>
                        <Text className="text-emerald-100 text-[10px] font-medium uppercase tracking-[1px]">This Month</Text>
                        <Text className="text-white font-bold text-sm mt-1">KES {thisMonthTotal.toLocaleString()}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-emerald-100 text-[10px] font-medium uppercase tracking-[1px]">Last Month</Text>
                        <Text className="text-white font-bold text-sm mt-1">KES {lastMonthTotal.toLocaleString()}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-emerald-100 text-[10px] font-medium uppercase tracking-[1px]">Trend</Text>
                        <View className="flex-row items-center gap-1 mt-1">
                            <FontAwesome
                                name={trendUp ? 'arrow-up' : 'arrow-down'}
                                size={10}
                                color="white"
                            />
                            <Text className="text-white font-bold text-sm">{Math.abs(trend).toFixed(1)}%</Text>
                        </View>
                    </View>
                </View>
            </View>

            {sources.length === 0 ? (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={isDark ? '#fff' : '#000'}
                        />
                    }
                >
                    <View className="app-card-muted mx-4 mt-2 items-center justify-center py-8 px-4">
                        <Image
                            source={require('../../assets/svg/income.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                        <Text className="text-slate-700 dark:text-white font-bold text-base mt-4 text-center">
                            No income sources yet
                        </Text>
                        <Text className="text-slate-400 text-sm mt-1 text-center">
                            Track your salary, freelance, or any recurring payments. Tap the wand icon to auto-detect patterns! or tap the plus icon to add an income source manually
                        </Text>
                        <TouchableOpacity
                            onPress={() => router.push('/income/add')}
                            className="mt-5 bg-emerald-600 px-6 py-3 rounded-xl flex-row items-center gap-2"
                        >
                            <Image
                                source={require('../../assets/svg/plus.svg')}
                                style={{ width: 12, height: 12 }}
                                tintColor={'#fff'}
                                contentFit="contain"
                            />
                            <Text className="text-white font-bold text-sm">Add Income Source</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            ) : (
                <FlatList
                    data={sources}
                    keyExtractor={item => item.id}
                    renderItem={renderSource}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={isDark ? '#fff' : '#000'}
                        />
                    }
                    ListHeaderComponent={
                        <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 px-4">
                            {sources.length} Active Source{sources.length !== 1 ? 's' : ''}
                        </Text>
                    }
                />
            )}
        </View>
    );
}
