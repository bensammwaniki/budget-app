import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
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
                loadGoals();
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

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push(`/savings/${item.id}`)}
                className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl mb-4 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden"
            >
                <View className="absolute top-0 right-0 w-32 h-32 rounded-bl-full opacity-10" style={{ backgroundColor: item.color || '#3b82f6' }} />

                <View className="flex-row justify-between items-start mb-4">
                    <View className="flex-row items-center flex-1 pr-4">
                        <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${item.color || '#3b82f6'}20` }}>
                            <Image
                                source={require('../../assets/svg/savings-piggy.svg')}
                                style={{ width: 26, height: 26 }}
                                tintColor={item.color || '#3b82f6'}
                                contentFit="contain"
                            />
                        </View>
                        <Text className="text-lg font-bold text-slate-900 dark:text-white" numberOfLines={1}>{item.name}</Text>
                    </View>
                    {item.status === 'COMPLETED' && (
                        <View className="bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full border border-green-200 dark:border-green-800/50">
                            <Text className="text-green-600 dark:text-green-400 font-bold text-xs">DONE</Text>
                        </View>
                    )}
                </View>

                <View className="flex-row items-end justify-between mb-3">
                    <View>
                        <Text className="text-slate-500 dark:text-slate-400 text-xs mb-1">Saved</Text>
                        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
                            KES {item.currentAmount.toLocaleString()}
                        </Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-slate-400 dark:text-slate-500 text-xs mb-1">Target</Text>
                        <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            KES {item.targetAmount.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* Progress Bar */}
                <View className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <View
                        className="h-full rounded-full"
                        style={{ width: `${progress}%`, backgroundColor: item.color || '#3b82f6' }}
                    />
                </View>

                {item.targetDate && (
                    <View className="flex-row items-center mt-3 gap-1">
                        <FontAwesome name="calendar" size={12} color="#94a3b8" />
                        <Text className="text-slate-400 dark:text-slate-500 text-[10px]">
                            Goal Date: {new Date(item.targetDate).toLocaleDateString()}
                        </Text>
                    </View>
                )}
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
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
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
            <View className="mx-6 mt-4 mb-6 bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-500/20 overflow-hidden relative">
                <View className="absolute right-[-20] top-[-20] opacity-10">
                    <FontAwesome name="bank" size={150} color="white" />
                </View>

                <Text className="text-blue-100 text-sm font-medium mb-1">Total Savings</Text>
                <Text className="text-white text-4xl font-bold mb-6">
                    KES {totalSaved.toLocaleString()}
                </Text>

                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-blue-100 text-xs font-medium">Overall Progress</Text>
                    <Text className="text-white font-bold text-xs">{overallProgress.toFixed(1)}%</Text>
                </View>
                <View className="h-2 bg-blue-400/30 rounded-full overflow-hidden">
                    <View
                        className="h-full bg-white rounded-full"
                        style={{ width: `${Math.min(overallProgress, 100)}%` }}
                    />
                </View>

                <View className="flex-row justify-between mt-3">
                    <Text className="text-blue-200 text-xs">Target: KES {totalTarget.toLocaleString()}</Text>
                    <Text className="text-blue-200 text-xs">{goals.length} active goals</Text>
                </View>
            </View>

            {goals.length === 0 ? (
                <View className="mx-6 mt-2 items-center justify-center py-8 px-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800">
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
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />
                    }
                />
            )}
        </View>
    );
}
