import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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
        const ringSize = 44;
        const strokeWidth = 2.5;
        const radius = (ringSize - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (Math.max(0, Math.min(progress, 100)) / 100) * circumference;

        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => router.push(`/income/${item.id}`)}
                className="app-card p-3 mb-4 mx-4 overflow-hidden relative"
            >
                <View className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: themeColor }} />
                <View className="absolute top-0 right-0 w-28 h-28 rounded-bl-full opacity-10" style={{ backgroundColor: themeColor }} />

                <View className="flex-row justify-between items-start mb-1.5">
                    <View className="flex-row items-start gap-2.5 flex-1">
                        <View style={{ width: ringSize, height: ringSize }} className="items-center justify-center">
                            <Svg width={ringSize} height={ringSize} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
                                <Circle
                                    cx={ringSize / 2}
                                    cy={ringSize / 2}
                                    r={radius}
                                    stroke={isDark ? '#334155' : '#e2e8f0'}
                                    strokeWidth={strokeWidth}
                                    fill="none"
                                />
                                <Circle
                                    cx={ringSize / 2}
                                    cy={ringSize / 2}
                                    r={radius}
                                    stroke={themeColor}
                                    strokeWidth={strokeWidth}
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={`${circumference}, ${circumference}`}
                                    strokeDashoffset={strokeDashoffset}
                                />
                            </Svg>
                            <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                                <Image
                                    source={require('../../assets/svg/income.svg')}
                                    style={{ width: 18, height: 18 }}
                                    tintColor={themeColor}
                                    contentFit="contain"
                                />
                            </View>
                        </View>

                        <View className="flex-1">
                            <View className="flex-row items-center flex-wrap gap-1">
                                <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-[1px]">Income Source</Text>
                                {!hasExpectedAmount && item.isRecurring && (
                                    <Text className="text-slate-400 text-[10px] font-medium">
                                        {FREQ_LABELS[item.frequency]}
                                    </Text>
                                )}
                                {!hasExpectedAmount && !item.isRecurring && (
                                    <Text className="text-slate-400 text-[10px] font-medium">
                                        One-time
                                    </Text>
                                )}
                                {hasExpectedAmount && (
                                    <Text className="text-slate-400 text-[10px] font-medium">
                                        {item.isRecurring ? FREQ_LABELS[item.frequency] : 'One-time'}
                                    </Text>
                                )}
                            </View>
                            <View className="flex-row items-center flex-wrap gap-1 mt-0.5">
                                <Text className="text-slate-900 dark:text-white font-black text-[15px]" numberOfLines={1}>
                                    {item.name}
                                </Text>
                                {hasExpectedAmount && (
                                    <>
                                        <Text className="text-slate-300 dark:text-slate-600 text-[10px] mx-0.5">•</Text>
                                        <Text className="text-slate-400 text-[10px] font-medium">
                                            Target KES {expectedAmountValue.toLocaleString()}
                                        </Text>
                                    </>
                                )}
                            </View>
                        </View>
                    </View>

                    {isPaidOff && (
                        <View className="items-end">
                            <View className="app-pill-success">
                                <Text className="app-pill-success-text uppercase tracking-[1px]">Paid Off</Text>
                            </View>
                        </View>
                    )}
                </View>

                <View className="flex-row flex-wrap gap-1.5 mb-1">
                    {hasExpectedAmount && !isPaidOff && (
                        <View className="app-pill">
                            <Text className="app-pill-text">
                                Remaining KES {remainingAmount.toLocaleString()}
                            </Text>
                        </View>
                    )}
                </View>

                <View className="flex-row justify-between items-end gap-3">
                    <View className="flex-row items-center flex-wrap gap-1 ml-[5px] flex-1">
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
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500">•</Text>
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            Progress:
                        </Text>
                        <Text style={{ color: themeColor }} className="text-[10px] font-semibold">
                            {progress.toFixed(1)}%
                        </Text>
                    </View>
                    <View className="items-end">
                        <Text className="font-black text-base" style={{ color: themeColor }}>
                            KES {displayTotalReceived.toLocaleString()}
                        </Text>
                        <Text className="text-slate-400 text-[10px] text-right mt-0.5">
                            Collected so far
                        </Text>
                    </View>
                </View>
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
