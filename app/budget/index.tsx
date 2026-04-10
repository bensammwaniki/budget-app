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
        <View className="px-6 py-4 flex-row items-center justify-between bg-white dark:bg-[#0f172a] rounded-b-[16px] mb-2 shadow-sm border border-slate-50 dark:border-slate-800/50">
            <TouchableOpacity onPress={handleSaveAndClose} className="p-2 -ml-2 flex-row items-center" disabled={saving}>
                {saving ? (
                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 8 }} />
                ) : (
                    <Image source={require('../../assets/svg/back.svg')} style={{ width: 20, height: 20, marginRight: 4 }} tintColor={isDark ? '#fff' : '#1e293b'} contentFit="contain" />
                )}
                <Text className="text-slate-900 dark:text-white font-bold ml-1">Back</Text>
            </TouchableOpacity>
            <Text className="text-lg font-bold text-slate-900 dark:text-white">
                Set Budgets
            </Text>
            <View className="w-16" />
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
                {activeCat && (
                    <View className="mx-4 mt-2 mb-4 pt-4 pb-4 px-4 items-center bg-white dark:bg-[#1e293b] rounded-[16px] border border-slate-100 dark:border-slate-700 shadow-sm">
                        <View className="w-full flex-row items-center gap-3 mb-6">
                            <View className="flex-1 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden h-[54px] justify-center">
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

                            <View className="bg-slate-50 dark:bg-[#0f172a] px-4 h-[54px] rounded-xl border border-slate-100 dark:border-slate-800 justify-center">
                                <Text className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Total Budget</Text>
                                <Text className="text-sm font-black text-blue-600 dark:text-blue-400">KES {totalAllocated.toLocaleString()}</Text>
                            </View>
                        </View>

                        <Text className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Budget Target</Text>
                        <View className="flex-row items-center justify-center mt-1">
                            <Text className="text-3xl text-slate-300 dark:text-slate-600 font-bold mr-2">KES</Text>
                            <TextInput
                                className="text-5xl font-black text-slate-900 dark:text-white min-w-[100px] text-center p-0"
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

                <View className="mx-4 bg-white dark:bg-[#1e293b] rounded-[16px] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
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
                                    {isActive && <Text className="text-[10px] text-blue-500 font-bold uppercase mt-0.5" tracking-widest>Currently Editing</Text>}
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
