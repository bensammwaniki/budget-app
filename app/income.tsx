import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase } from '../services/database';
import { IncomeLog, IncomeSource, incomeService } from '../services/incomeService';

export default function IncomeScreen() {
    const [sources, setSources] = useState<IncomeSource[]>([]);
    const [logs, setLogs] = useState<IncomeLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const loadData = async () => {
        try {
            await initDatabase();
            const [fetchedSources, fetchedLogs] = await Promise.all([
                incomeService.getSources(),
                incomeService.getLogs(),
            ]);
            setSources(fetchedSources);
            setLogs(fetchedLogs);
        } catch (e) {
            console.error('Failed to load income data:', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const thisMonthTotal = logs.filter(l => new Date(l.receivedAt) >= startOfThisMonth)
        .reduce((sum, l) => sum + l.amount, 0);
    const lastMonthTotal = logs.filter(l => {
        const d = new Date(l.receivedAt);
        return d >= startOfLastMonth && d <= endOfLastMonth;
    }).reduce((sum, l) => sum + l.amount, 0);

    const trend = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
    const trendUp = trend >= 0;

    const FREQ_LABELS: Record<string, string> = {
        MONTHLY: 'Monthly', WEEKLY: 'Weekly', BI_WEEKLY: 'Bi-weekly', IRREGULAR: 'Irregular'
    };

    const renderSource = ({ item }: { item: IncomeSource }) => {
        const sourceLogs = logs.filter(l => l.sourceId === item.id);
        const totalReceived = sourceLogs.reduce((sum, l) => sum + l.amount, 0);
        const lastLog = sourceLogs.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
        const themeColor = item.color || '#10b981';

        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => router.push(`/income/${item.id}`)}
                className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl mb-4 border border-slate-100 dark:border-slate-800 overflow-hidden relative"
            >
                <View className="absolute top-0 right-0 w-28 h-28 rounded-bl-full opacity-10" style={{ backgroundColor: themeColor }} />

                <View className="flex-row items-center mb-3">
                    <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}20` }}>
                        <Image
                            source={require('../assets/svg/income.svg')}
                            style={{ width: 18, height: 18 }}
                            tintColor={themeColor}
                            contentFit="contain"
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-slate-900 dark:text-white font-bold text-base" numberOfLines={1}>{item.name}</Text>
                        <Text className="text-slate-400 text-xs mt-0.5">{FREQ_LABELS[item.frequency]} • {sourceLogs.length} entries</Text>
                    </View>
                    {item.status === 'INACTIVE' && (
                        <View className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                            <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">Inactive</Text>
                        </View>
                    )}
                </View>

                <View className="flex-row justify-between items-end">
                    <View>
                        <Text className="text-slate-400 text-xs mb-1">Total Received</Text>
                        <Text className="text-2xl font-bold text-slate-900 dark:text-white">KES {totalReceived.toLocaleString()}</Text>
                    </View>
                    <View className="items-end">
                        {item.expectedAmount && (
                            <>
                                <Text className="text-slate-400 text-xs mb-1">Expected</Text>
                                <Text className="text-slate-600 dark:text-slate-300 font-semibold">KES {item.expectedAmount.toLocaleString()}</Text>
                            </>
                        )}
                        {lastLog && (
                            <Text className="text-slate-400 text-[10px] mt-1">
                                Last: {new Date(lastLog.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </Text>
                        )}
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
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />

            {/* Header */}
            <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
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
                        className="w-10 h-10 bg-emerald-600 rounded-full items-center justify-center shadow-lg shadow-emerald-500/30"
                    >
                        <Image
                            source={require('../assets/svg/plus.svg')}
                            style={{ width: 18, height: 18 }}
                            tintColor={"white"}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Summary Card */}
            <View className="mx-6 mt-4 mb-6 bg-emerald-600 rounded-3xl p-6 shadow-xl shadow-emerald-500/20 overflow-hidden relative">
                <View className="absolute right-[-20] top-[-20] opacity-10">
                    <FontAwesome name="line-chart" size={150} color="white" />
                </View>
                <Text className="text-emerald-100 text-sm font-medium mb-1">This Month's Income</Text>
                <Text className="text-white text-4xl font-bold mb-3">KES {thisMonthTotal.toLocaleString()}</Text>
                <View className="flex-row items-center gap-2">
                    <View className={`flex-row items-center px-3 py-1 rounded-full gap-1 ${trendUp ? 'bg-white/20' : 'bg-red-400/30'}`}>
                        {trendUp ?
                            <Image
                                source={require(`../assets/svg/trend-up.svg`)}
                                style={{ width: 18, height: 18 }}
                                tintColor={"white"}
                                contentFit="contain"
                            />
                            :
                            <Image
                                source={require(`../assets/svg/trend-down.svg`)}
                                style={{ width: 18, height: 18 }}
                                tintColor={"white"}
                                contentFit="contain"
                            />
                        }

                        <Text className="text-white text-xs font-bold">{Math.abs(trend).toFixed(1)}%</Text>
                    </View>
                    <Text className="text-emerald-200 text-xs">vs last month (KES {lastMonthTotal.toLocaleString()})</Text>
                </View>
            </View>

            {sources.length === 0 ? (
                                <View className="mx-6 mt-2 items-center justify-center py-8 px-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800">
                                    <Image
                                        source={require('../assets/svg/income.svg')}
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
                                            source={require('../assets/svg/plus.svg')}
                                            style={{ width: 12, height: 12 }}
                                            tintColor={'#fff'}
                                            contentFit="contain"
                                        />
                                        <Text className="text-white font-bold text-sm">Add Income Source</Text>
                                    </TouchableOpacity>
                                </View>
            ) : (
                <FlatList
                    data={sources}
                    keyExtractor={item => item.id}
                    renderItem={renderSource}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">
                            {sources.length} Active Source{sources.length !== 1 ? 's' : ''}
                        </Text>
                    }
                />
            )}
        </View>
    );
}
