import { FontAwesome } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategories, getMonthlyBudget, saveMonthlyBudget } from '../../services/database';
import { Category } from '../../types/transaction';

export default function BudgetScreen() {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Date State
    const [selectedDate] = useState(new Date());

    // Data State
    const [categories, setCategories] = useState<Category[]>([]);
    const [income, setIncome] = useState('');
    const [allocations, setAllocations] = useState<Record<number, string>>({});
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [isInputFocused, setIsInputFocused] = useState(false);

    const formatWithCommas = (value: string) => {
        const numeric = value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if (!numeric) return '';
        return parseInt(numeric, 10).toLocaleString();
    };

    const monthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cats, budget] = await Promise.all([
                getCategories(),
                getMonthlyBudget(monthKey),
            ]);

            setCategories(cats.filter(c => c.type === 'EXPENSE'));
            setIncome(budget.totalIncome > 0 ? budget.totalIncome.toLocaleString() : '');

            const allocs: Record<number, string> = {};
            budget.allocations.forEach(a => {
                allocs[a.categoryId] = a.budgetAmount > 0 ? a.budgetAmount.toLocaleString() : '';
            });
            setAllocations(allocs);

        } catch (error) {
            console.error('Error loading budget data:', error);
        } finally {
            setLoading(false);
        }
    }, [monthKey]);

    useFocusEffect(useCallback(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadData(); });
        return () => task.cancel();
    }, [loadData]));

    const numIncome = parseFloat(income.replace(/,/g, '')) || 0;
    const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val.replace(/,/g, '')) || 0), 0);

    const handleSaveAndClose = async () => {
        setSaving(true);
        try {
            const allocationList = Object.entries(allocations).map(([catId, amount]) => ({
                categoryId: parseInt(catId),
                budgetAmount: parseFloat(amount.replace(/,/g, '')) || 0
            }));
            await saveMonthlyBudget(monthKey, numIncome, allocationList);
            router.back();
        } catch (error) {
            console.error('Error saving budget:', error);
            Alert.alert('Error', 'Failed to save budget');
            router.back();
        }
    };

    const handleAllocationChange = (categoryId: number, value: string) => {
        setAllocations(prev => ({ ...prev, [categoryId]: formatWithCommas(value) }));
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-[#020617]">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    const renderHeader = () => (
        <View className="px-4 py-3 flex-row items-center justify-between bg-white dark:bg-[#0f172a] border-b border-slate-100 dark:border-slate-800">
            <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-full items-center justify-center bg-slate-50 dark:bg-slate-800">
                <Image source={require('../../assets/svg/back.svg')} style={{ width: 18, height: 18 }} tintColor={isDark ? '#fff' : '#1e293b'} contentFit="contain" />
            </TouchableOpacity>

            <View className="items-center">
                <Text className="text-base font-bold text-slate-900 dark:text-white">Set Budget</Text>
                <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </Text>
            </View>

            <TouchableOpacity
                onPress={handleSaveAndClose}
                disabled={saving}
                className={`px-3 h-9 rounded-full items-center justify-center ${saving ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'}`}
            >
                {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <Text className="text-white text-xs font-bold uppercase tracking-[0.6px]">Save</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    const activeCat = selectedCategory || (categories.length > 0 ? categories[0] : null);
    const activeAmount = activeCat ? (allocations[activeCat.id] || '') : '';

    const handleActiveAmountChange = (text: string) => {
        if (!activeCat) return;
        handleAllocationChange(activeCat.id, text);
    };

    const renderAllocation = () => (
        <View className="flex-1">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                <View className="mx-4 mt-3 mb-4 bg-white dark:bg-[#1e293b] rounded-[16px] border border-slate-100 dark:border-slate-700 p-4">
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.8px] mb-2">
                        Monthly Income
                    </Text>
                    <View className="h-12 rounded-xl px-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 justify-center">
                        <TextInput
                            value={income}
                            onChangeText={(text) => setIncome(formatWithCommas(text))}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
                            className="text-base font-bold text-slate-900 dark:text-white"
                        />
                    </View>

                    <View className="flex-row mt-3 gap-2">
                        <View className="flex-1 bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                            <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Allocated</Text>
                            <Text className="text-slate-900 dark:text-white font-black text-sm mt-1">KES {totalAllocated.toLocaleString()}</Text>
                        </View>
                        <View className="flex-1 bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                            <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Remaining</Text>
                            <Text className={`font-black text-sm mt-1 ${numIncome - totalAllocated >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                KES {Math.abs(numIncome - totalAllocated).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </View>

                {activeCat && (
                    <View className="mx-4 mb-4 bg-white dark:bg-[#1e293b] rounded-[16px] border border-slate-100 dark:border-slate-700 p-4">
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.8px] mb-2">
                            Edit Category Budget
                        </Text>
                        <View className="bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden h-[52px] justify-center mb-3">
                            <Picker
                                selectedValue={activeCat.id}
                                onValueChange={(itemValue) => {
                                    const cat = categories.find(c => c.id === itemValue);
                                    if (cat) setSelectedCategory(cat);
                                }}
                                style={{ width: '100%', color: isDark ? '#fff' : '#1e293b' }}
                                itemStyle={{ color: isDark ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 14 }}
                                dropdownIconColor="#3b82f6"
                            >
                                {categories.map(cat => (
                                    <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
                                ))}
                            </Picker>
                        </View>
                        <View className="h-14 rounded-xl px-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-100 dark:border-slate-800 justify-center">
                            <TextInput
                                className="text-2xl font-black text-slate-900 dark:text-white"
                                placeholder={isInputFocused ? '' : '0'}
                                placeholderTextColor="#cbd5e1"
                                keyboardType="numeric"
                                value={activeAmount}
                                onChangeText={handleActiveAmountChange}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                            />
                        </View>
                    </View>
                )}

                <View className="mx-4 bg-white dark:bg-[#1e293b] rounded-[16px] border border-slate-100 dark:border-slate-700 overflow-hidden mb-4">
                    <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.8px]">
                            Category Allocations
                        </Text>
                    </View>
                    {categories.filter(cat => {
                        const amount = parseFloat((allocations[cat.id] || '0').replace(/,/g, ''));
                        return amount > 0 || activeCat?.id === cat.id;
                    }).map((cat, index, arr) => {
                        const amount = allocations[cat.id] || '0';
                        const isActive = activeCat?.id === cat.id;
                        return (
                            <TouchableOpacity 
                                key={cat.id} 
                                onPress={() => setSelectedCategory(cat)}
                                className={`flex-row items-center p-4 ${index < arr.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/80' : ''} ${isActive ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                            >
                                <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: `${cat.color}20` }}>
                                    <FontAwesome name={cat.icon as any} size={16} color={cat.color} />
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-slate-900 dark:text-white">{cat.name}</Text>
                                    {isActive && <Text className="text-[10px] text-blue-500 font-bold uppercase mt-0.5">Editing</Text>}
                                </View>
                                <Text className={`font-bold ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'} mr-3`}>KES {amount}</Text>
                                <FontAwesome name="pencil" size={14} color={isActive ? '#3b82f6' : '#94a3b8'} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 app-screen" edges={['top']}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            {renderHeader()}
            
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                {renderAllocation()}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
