import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SavingsGoal, savingsService } from '../../services/savingsService';

export default function SavingsScreen() {
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();

    const loadGoals = async () => {
        try {
            const data = await savingsService.getGoals('local_user');
            setGoals(data);
        } catch (error) {
            console.error('Failed to load goals:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadGoals();
        }, [])
    );

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
                            <FontAwesome name="flag" size={16} color={item.color || '#3b82f6'} />
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
                <View className="flex-1 items-center justify-center p-6 mt-10">
                    <View className="w-24 h-24 bg-blue-100 dark:bg-blue-900/20 rounded-full items-center justify-center mb-6">
                        <FontAwesome name="flag-checkered" size={32} color="#3b82f6" />
                    </View>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">No Savings Goals Yet</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-center mb-8 px-4">
                        Set a goal to save for a vacation, emergency fund, or new gadget. Tracking it makes it happen!
                    </Text>
                    <TouchableOpacity
                        onPress={() => router.push('/savings/add')}
                        className="bg-blue-600 px-8 py-4 rounded-xl shadow-lg shadow-blue-500/30"
                    >
                        <Text className="text-white font-bold text-lg">Create First Goal</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={goals}
                    keyExtractor={item => item.id}
                    renderItem={renderGoal}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}
