import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetectedIncomePattern, incomeService } from '../../services/incomeService';

const FREQ_LABELS: Record<string, string> = {
    MONTHLY: 'Monthly', WEEKLY: 'Weekly', BI_WEEKLY: 'Bi-weekly', IRREGULAR: 'Irregular'
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#06b6d4'];

export default function DetectIncomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [patterns, setPatterns] = useState<DetectedIncomePattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState<string | null>(null);

    useEffect(() => {
        const detect = async () => {
            try {
                const detected = await incomeService.detectRecurringIncome();
                setPatterns(detected);
            } catch (e) {
                console.error('Detection failed:', e);
            } finally {
                setLoading(false);
            }
        };
        detect();
    }, []);

    const handleCreateFromPattern = async (pattern: DetectedIncomePattern, colorIdx: number) => {
        setCreating(pattern.name);
        try {
            await incomeService.createSource({
                name: pattern.name,
                expectedAmount: pattern.averageAmount,
                frequency: pattern.suggestedFrequency,
                color: COLORS[colorIdx % COLORS.length],
                isRecurring: pattern.suggestedFrequency !== 'IRREGULAR',
            });
            Alert.alert('Source Created!', `"${pattern.name}" has been added as an income source.`);
            // Remove from suggestions
            setPatterns(prev => prev.filter(p => p.name !== pattern.name));
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to create income source.');
        } finally {
            setCreating(null);
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />

            <View className="px-6 py-4 flex-row items-center border-b border-gray-200 dark:border-slate-800">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <Image source={require('../../assets/svg/back.svg')} style={{ width: 24, height: 24 }} tintColor={isDark ? '#fff' : '#1e293b'} contentFit="contain" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-slate-900 dark:text-white ml-2">Detected Patterns</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center gap-4">
                    <ActivityIndicator size="large" color="#10b981" />
                    <Text className="text-slate-500 dark:text-slate-400">Analysing your income history…</Text>
                </View>
            ) : patterns.length === 0 ? (
                <View className="flex-1 items-center justify-center p-8">
                    <View className="w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-full items-center justify-center mb-6">
                        <FontAwesome name="search" size={32} color="#10b981" />
                    </View>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">No Patterns Detected</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-center">
                        We need at least 2 income transactions from the same sender to suggest a recurring source.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={patterns}
                    keyExtractor={p => p.name}
                    contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                    ListHeaderComponent={
                        <Text className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-5">
                            We found <Text className="font-bold text-slate-900 dark:text-white">{patterns.length} recurring pattern{patterns.length !== 1 ? 's' : ''}</Text> in your income history. Tap &quot;Add&quot; to create a tracked source.
                        </Text>
                    }
                    renderItem={({ item: p, index }) => {
                        const color = COLORS[index % COLORS.length];
                        return (
                            <View className="bg-white dark:bg-[#0f172a] px-4 py-4 rounded-2xl mb-2 border border-slate-100 dark:border-slate-800">
                                <View className="flex-row justify-between items-start mb-3">
                                    <View className="flex-row items-center flex-1 pr-4">
                                        <View className="w-8 h-8 rounded-[10px] items-center justify-center mr-3" style={{ backgroundColor: `${color}20` }}>
                                            <Image
                                                source={require(`../../assets/svg/income.svg`)}
                                                style={{ width: 18, height: 18 }}
                                                tintColor={color}
                                                contentFit="contain"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-[14px] text-slate-900 dark:text-white font-bold" numberOfLines={1}>{p.name}</Text>
                                            <Text className="text-slate-400 text-xs mt-0.5">{FREQ_LABELS[p.suggestedFrequency]} • {p.occurrences} occurrences</Text>
                                        </View>
                                    </View>
                                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${color}20` }}>
                                        <Text className="text-xs" style={{ color }}>{FREQ_LABELS[p.suggestedFrequency]}</Text>
                                    </View>
                                </View>

                                <View className="flex-row justify-between items-end">
                                    <View>
                                        <Text className="text-slate-400 text-xs mb-1">Avg. Amount</Text>
                                        <Text className="text-[14px] font-bold text-slate-900 dark:text-white">KES {p.averageAmount.toLocaleString()}</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => handleCreateFromPattern(p, index)}
                                        disabled={creating === p.name}
                                        className="px-4 py-2 rounded-xl flex-row items-center gap-2"
                                        style={{ backgroundColor: color }}
                                    >
                                        {creating === p.name
                                            ? <ActivityIndicator size="small" color="white" />
                                            : <>
                                                <Image
                                                    source={require(`../../assets/svg/plus.svg`)}
                                                    style={{ width: 14, height: 14 }}
                                                    tintColor={'white'}
                                                    contentFit="contain"
                                                />
                                                <Text className="text-[12px] text-white font-bold">Add</Text>
                                            </>
                                        }
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                />
            )}
        </View>
    );
}
