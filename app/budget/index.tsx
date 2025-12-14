import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategories, getCategorySpending, getMonthlyBudget, saveMonthlyBudget } from '../../services/database';
import { Category } from '../../types/transaction';

export default function BudgetScreen() {
    const { colorScheme } = useColorScheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Date State
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Data State
    const [categories, setCategories] = useState<Category[]>([]);
    const [income, setIncome] = useState('');
    const [allocations, setAllocations] = useState<Record<number, string>>({});
    const [spending, setSpending] = useState<Record<number, number>>({});

    const monthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
    const monthName = selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    useFocusEffect(
        useCallback(() => {
            const task = InteractionManager.runAfterInteractions(() => {
                loadData();
            });
            return () => task.cancel();
        }, [monthKey])
    );

    const loadData = async () => {
        setLoading(true);
        try {
            const [cats, budget, spent] = await Promise.all([
                getCategories(),
                getMonthlyBudget(monthKey),
                getCategorySpending(monthKey)
            ]);

            // Filter out Income categories from allocation list
            setCategories(cats.filter(c => c.type === 'EXPENSE'));

            setIncome(budget.totalIncome > 0 ? budget.totalIncome.toString() : '');

            const allocs: Record<number, string> = {};
            budget.allocations.forEach(a => {
                allocs[a.categoryId] = a.budgetAmount.toString();
            });
            setAllocations(allocs);
            setSpending(spent);

        } catch (error) {
            console.error('Error loading budget data:', error);
            Alert.alert('Error', 'Failed to load budget data');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const numericIncome = parseFloat(income) || 0;
            const allocationList = Object.entries(allocations).map(([catId, amount]) => ({
                categoryId: parseInt(catId),
                budgetAmount: parseFloat(amount) || 0
            }));

            await saveMonthlyBudget(monthKey, numericIncome, allocationList);
            Alert.alert('Success', 'Budget saved successfully!');
        } catch (error) {
            console.error('Error saving budget:', error);
            Alert.alert('Error', 'Failed to save budget');
        } finally {
            setSaving(false);
        }
    };

    const handleAllocationChange = (categoryId: number, value: string) => {
        setAllocations(prev => ({
            ...prev,
            [categoryId]: value
        }));
    };

    const changeMonth = (direction: -1 | 1) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() + direction);
        setSelectedDate(newDate);
    };

    // Calculations
    const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const totalIncome = parseFloat(income) || 0;
    const remainingIncome = totalIncome - totalAllocated;

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-[#020617]" edges={['top']}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <View className="px-6 py-4 flex-row items-center justify-between bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image
                            source={require('../../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white">Monthly Budget</Text>
                    <TouchableOpacity onPress={handleSave} disabled={saving} className="bg-blue-600 px-4 py-2 rounded-full">
                        {saving ? <ActivityIndicator color="white" size="small" /> : <Text className="text-white font-bold">Save</Text>}
                    </TouchableOpacity>
                </View>

                <ScrollView className="flex-1 p-6">

                    {/* Month Selector */}
                    <View className="flex-row items-center justify-between mb-8 bg-white dark:bg-[#1e293b] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                        <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2">
                            <FontAwesome name="chevron-left" size={16} color="#64748b" />
                        </TouchableOpacity>
                        <Text className="text-lg font-bold text-slate-800 dark:text-white">{monthName}</Text>
                        <TouchableOpacity onPress={() => changeMonth(1)} className="p-2">
                            <FontAwesome name="chevron-right" size={16} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    {/* Income Input */}
                    <View className="mb-8">
                        <Text className="text-slate-500 dark:text-slate-400 font-bold mb-2 uppercase text-xs tracking-wider">Total Expected Income</Text>
                        <View className="flex-row items-center bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-4">
                            <Text className="text-slate-400 font-bold mr-2">KES</Text>
                            <TextInput
                                className="flex-1 text-2xl font-bold text-slate-900 dark:text-white"
                                placeholder="0.00"
                                placeholderTextColor="#94a3b8"
                                keyboardType="numeric"
                                value={income}
                                onChangeText={setIncome}
                            />
                        </View>
                    </View>

                    {/* Summary Cards */}
                    <View className="flex-row gap-4 mb-8">
                        <View className="flex-1 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                            <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase mb-1">Allocated</Text>
                            <Text className="text-blue-900 dark:text-blue-100 text-lg font-bold">
                                {totalAllocated.toLocaleString()}
                            </Text>
                        </View>
                        <View className={`flex-1 p-4 rounded-2xl border ${remainingIncome < 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800'}`}>
                            <Text className={`${remainingIncome < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'} text-xs font-bold uppercase mb-1`}>Remaining</Text>
                            <Text className={`${remainingIncome < 0 ? 'text-red-900 dark:text-red-100' : 'text-green-900 dark:text-green-100'} text-lg font-bold`}>
                                {remainingIncome.toLocaleString()}
                            </Text>
                        </View>
                    </View>

                    {/* Allocations & Progress */}
                    <Text className="text-slate-500 dark:text-slate-400 font-bold mb-4 uppercase text-xs tracking-wider">Category Limits & Progress</Text>

                    <View className="gap-4 mb-20">
                        {categories.map((cat) => {
                            const allocated = parseFloat(allocations[cat.id] || '0');
                            const spent = spending[cat.id] || 0;
                            const progress = allocated > 0 ? (spent / allocated) * 100 : 0;

                            let progressColor = 'bg-green-500';
                            if (progress > 100) progressColor = 'bg-red-500';
                            else if (progress > 80) progressColor = 'bg-yellow-500';

                            return (
                                <View key={cat.id} className="bg-white dark:bg-[#1e293b] p-3 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                                    <View className="flex-row items-center mb-2">
                                        <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${cat.color}20` }}>
                                            <FontAwesome name={cat.icon as any} size={14} color={cat.color} />
                                        </View>
                                        <Text className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-sm">{cat.name}</Text>
                                        <View className="flex-row items-center bg-gray-50 dark:bg-[#0f172a] rounded-lg px-2 py-1.5 border border-gray-100 dark:border-slate-800 w-28">
                                            <Text className="text-xs text-slate-400 mr-1">KES</Text>
                                            <TextInput
                                                className="flex-1 text-right font-bold text-slate-900 dark:text-white text-sm"
                                                placeholder="0"
                                                placeholderTextColor="#94a3b8"
                                                keyboardType="numeric"
                                                value={allocations[cat.id] || ''}
                                                onChangeText={(text) => handleAllocationChange(cat.id, text)}
                                            />
                                        </View>
                                    </View>

                                    {/* Progress Bar */}
                                    <View>
                                        <View className="flex-row justify-between mb-1">
                                            <Text className="text-[10px] text-slate-400 font-medium">
                                                Spent: {spent.toLocaleString()}
                                            </Text>
                                            <Text className="text-[10px] text-slate-400 font-medium">
                                                {progress.toFixed(0)}%
                                            </Text>
                                        </View>
                                        <View className="h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <View
                                                className={`h-full rounded-full ${progressColor}`}
                                                style={{ width: `${Math.min(progress, 100)}%` }}
                                            />
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
