import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, InteractionManager, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase, subscribeToDatabaseChanges } from '../../services/database';
import { SavingsGoal, savingsService } from '../../services/savingsService';

export default function SavingsScreen() {
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();

    const loadGoals = async () => {
        try {
            await initDatabase();
            const data = await savingsService.getGoals('local_user');
            setGoals(data);
        } catch (error) {
            console.error('Failed to load goals:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGoals();

        const unsubscribe = subscribeToDatabaseChanges((type) => {
            if (type === 'SAVINGS' || type === 'TRANSACTIONS') {
                InteractionManager.runAfterInteractions(() => {
                    loadGoals();
                });
            }
        });

        return unsubscribe;
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadGoals();
        setRefreshing(false);
    }, []);

    const totalSaved = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
    const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

    const renderGoal = ({ item }: { item: SavingsGoal }) => {
        const progress = Math.min((item.currentAmount / item.targetAmount) * 100, 100);
        const goalColor = item.color || '#3b82f6';
        const remaining = Math.max(0, item.targetAmount - item.currentAmount);
        const isCompleted = item.status === 'COMPLETED';

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push(`/savings/${item.id}`)}
                className="app-card p-4 mb-3 mx-4"
            >
                <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                        <Text className="text-slate-900 dark:text-white font-bold text-[15px] flex-1 pr-2" numberOfLines={1}>
                            {item.name}
                        </Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">
                            Savings Goal • Target KES {item.targetAmount.toLocaleString()}
                        </Text>
                        {item.targetDate && (
                            <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">
                                Goal Date {new Date(item.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                            </Text>
                        )}
                        <View className="flex-row items-center flex-wrap gap-1 mt-1">
                            <View className="flex-row items-center flex-wrap gap-1 pr-2">
                                <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                    Remaining:
                                </Text>
                                <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                    KES {remaining.toLocaleString()}
                                </Text>
                                <View className="mx-1 w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                    <View
                                        className="h-full rounded-full"
                                        style={{ width: `${Math.max(0, Math.min(progress, 100))}%`, backgroundColor: goalColor }}
                                    />
                                </View>
                                <Text style={{ color: goalColor }} className="text-[10px] font-semibold">
                                    {progress.toFixed(1)}%
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View className="items-end">
                        {isCompleted && (
                            <View className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-2">
                                <Text className="text-[9px] font-bold uppercase tracking-[0.8px] text-emerald-700 dark:text-emerald-300">
                                    Done
                                </Text>
                            </View>
                        )}
                        <Text className="font-black text-[15px] text-slate-900 dark:text-white">
                            KES {item.currentAmount.toLocaleString()}
                        </Text>
                        <Text className="text-slate-400 text-[10px] text-right mt-0.5">
                            Saved
                        </Text>
                        <TouchableOpacity
                            className="w-8 h-8 rounded-full items-center justify-center pt-3 mt-2 -mr-2"
                            hitSlop={{ top: 8, bottom: 6, left: 8, right: 8 }}
                            onPress={(event) => {
                                event.stopPropagation();
                                router.push({ pathname: '/savings/add', params: { editId: item.id } });
                            }}
                        >
                            <FontAwesome name="pencil" size={12} color={goalColor} />
                        </TouchableOpacity>
                    </View>
                </View>

            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <View className="flex-1 app-screen" style={{ paddingTop: insets.top }}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            <View className="px-4 pt-6 pb-2 flex-row justify-between items-center">
                <Text className="text-3xl font-bold text-slate-900 dark:text-white">Savings</Text>
                <TouchableOpacity
                    onPress={() => router.push('/savings/add')}
                    className="p-4 -ml-2 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center"
                >
                    <Image
                        source={require('../../assets/svg/plus.svg')}
                        style={{ width: 18, height: 18 }}
                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                        contentFit="contain"
                    />
                </TouchableOpacity>
            </View>

            {/* Overall Summary Card */}
            <View className="mx-4 mt-4 mb-6 bg-blue-600 rounded-[16px] p-5 overflow-hidden relative">
                <View className="absolute right-[-18] top-[-18] opacity-10">
                    <FontAwesome name="bank" size={132} color="white" />
                </View>

                <Text className="text-blue-100 text-[11px] font-bold uppercase tracking-[1px] mb-1">Savings Overview</Text>
                <Text className="text-white text-[30px] font-black mb-4">
                    KES {totalSaved.toLocaleString()}
                </Text>

                <View className="h-1.5 bg-white/20 rounded-full overflow-hidden mb-4">
                    <View
                        className="h-full bg-white rounded-full"
                        style={{ width: `${Math.min(overallProgress, 100)}%` }}
                    />
                </View>

                <View className="flex-row justify-between items-end">
                    <View>
                        <Text className="text-blue-100 text-[10px] font-medium uppercase tracking-[1px]">Target</Text>
                        <Text className="text-white font-bold text-sm mt-1">KES {totalTarget.toLocaleString()}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-blue-100 text-[10px] font-medium uppercase tracking-[1px]">Progress</Text>
                        <Text className="text-white font-bold text-sm mt-1">{overallProgress.toFixed(1)}%</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-blue-100 text-[10px] font-medium uppercase tracking-[1px]">Goals</Text>
                        <Text className="text-white font-bold text-sm mt-1">{goals.length}</Text>
                    </View>
                </View>
            </View>

            {goals.length === 0 ? (
                <View className="app-card-muted mx-4 mt-2 items-center justify-center py-8 px-4">
                    <Image
                        source={require('../../assets/svg/savings.svg')}
                        style={{ width: 18, height: 18 }}
                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                        contentFit="contain"
                    />
                    <Text className="text-slate-700 dark:text-white font-bold text-base mt-4 text-center">
                        No savings goals yet
                    </Text>
                    <Text className="text-slate-400 text-sm mt-1 text-center">
                        Start saving for a vacation, emergency fund, or anything you care about.
                    </Text>
                    <TouchableOpacity
                        onPress={() => router.push('/savings/add')}
                        className="mt-5 bg-blue-600 px-6 py-3 rounded-xl flex-row items-center gap-2"
                    >
                        <Image
                            source={require('../../assets/svg/plus.svg')}
                            style={{ width: 12, height: 12 }}
                            tintColor={'#fff'}
                            contentFit="contain"
                        />
                        <Text className="text-white font-bold text-sm">Create a Goal</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={goals}
                    keyExtractor={item => item.id}
                    renderItem={renderGoal}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />
                    }
                />
            )}
        </View>
    );
}
