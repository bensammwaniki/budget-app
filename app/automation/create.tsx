import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addAutomationRule, applyRuleToExistingTransactions, getCategories } from '../../services/database';
import { AutomationCondition, AutomationRule } from '../../types/automation';
import { Category } from '../../types/transaction';

export default function CreateAutomationRuleScreen() {
    const router = useRouter();
    const { colorScheme } = useColorScheme();
    const insets = useSafeAreaInsets();

    const [name, setName] = useState('');
    const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // Conditions State
    const [timeEnabled, setTimeEnabled] = useState(false);
    const [timeStart, setTimeStart] = useState('00');
    const [timeEnd, setTimeEnd] = useState('23');

    const [amountEnabled, setAmountEnabled] = useState(false);
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');

    const [keywordEnabled, setKeywordEnabled] = useState(false);
    const [keyword, setKeyword] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const cats = await getCategories();
            setCategories(cats);
        } catch (error) {
            console.error('Failed to load categories:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a rule name');
            return;
        }

        if (!selectedCategory) {
            Alert.alert('Error', 'Please select a target category');
            return;
        }

        const conditions: AutomationCondition[] = [];

        if (timeEnabled) {
            conditions.push({
                field: 'TIME',
                operator: 'BETWEEN',
                value: { start: parseInt(timeStart), end: parseInt(timeEnd) }
            });
        }

        if (amountEnabled) {
            const min = parseFloat(amountMin) || 0;
            const max = parseFloat(amountMax) || Number.MAX_SAFE_INTEGER;
            conditions.push({
                field: 'AMOUNT',
                operator: 'BETWEEN',
                value: { min, max }
            });
        }

        if (keywordEnabled && keyword.trim()) {
            conditions.push({
                field: 'DESCRIPTION',
                operator: 'CONTAINS',
                value: keyword.trim()
            });
        }

        if (conditions.length === 0) {
            Alert.alert('Error', 'Please enable at least one condition');
            return;
        }

        try {
            const rule: AutomationRule = {
                id: 0, // Placeholder
                name: name.trim(),
                type,
                conditions,
                action: { categoryId: selectedCategory.id },
                isEnabled: true
            };

            // 1. Add Rule to DB
            const newId = await addAutomationRule(rule);

            // 2. Apply to existing transactions
            setLoading(true); // Show spinner while processing
            const updatedCount = await applyRuleToExistingTransactions({ ...rule, id: newId });
            setLoading(false);

            Alert.alert(
                'Rule Created',
                `Rule saved successfully!\n\n${updatedCount} existing transaction${updatedCount !== 1 ? 's' : ''} were updated to match this rule.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (error) {
            console.error('Failed to save rule:', error);
            setLoading(false);
            Alert.alert('Error', 'Failed to save rule');
        }
    };

    if (loading) {
        return (
            <View className="flex-1 bg-gray-50 dark:bg-[#020617] items-center justify-center">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-gray-50 dark:bg-[#020617]"
        >
            {/* Header */}
            <View
                className="px-6 pb-4 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800 shadow-sm z-10 flex-row justify-between items-center"
                style={{ paddingTop: insets.top > 0 ? insets.top : 20 }}
            >
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <FontAwesome name="arrow-left" size={20} color={colorScheme === 'dark' ? '#fff' : '#1e293b'} />
                </TouchableOpacity>
                <Text className="text-slate-900 dark:text-white text-xl font-bold">New Automation Rule</Text>
                <TouchableOpacity onPress={handleSave} className="bg-blue-600 px-4 py-2 rounded-full">
                    <Text className="text-white font-bold text-sm">Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-6">
                {/* Basic Info */}
                <View className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-6 border border-gray-200 dark:border-slate-700">
                    <Text className="text-slate-900 dark:text-white font-bold mb-4">Rule Details</Text>

                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2 uppercase">Rule Name</Text>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Morning Coffee"
                        placeholderTextColor="#94a3b8"
                        className="bg-gray-50 dark:bg-slate-800 p-3 rounded-xl text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700 mb-4"
                    />

                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2 uppercase">Transaction Type</Text>
                    <View className="flex-row gap-4 mb-4">
                        <TouchableOpacity
                            onPress={() => setType('EXPENSE')}
                            className={`flex-1 p-3 rounded-xl border items-center ${type === 'EXPENSE' ? 'bg-red-50 dark:bg-red-900/20 border-red-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                        >
                            <Text className={`font-bold ${type === 'EXPENSE' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>Expense</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setType('INCOME')}
                            className={`flex-1 p-3 rounded-xl border items-center ${type === 'INCOME' ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                        >
                            <Text className={`font-bold ${type === 'INCOME' ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}`}>Income</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Conditions */}
                <Text className="text-slate-900 dark:text-white font-bold mb-4 px-1">Trigger Conditions</Text>

                {/* Time Condition */}
                <TouchableOpacity
                    onPress={() => setTimeEnabled(!timeEnabled)}
                    className={`p-4 rounded-2xl mb-4 border ${timeEnabled ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-500' : 'bg-white dark:bg-[#1e293b] border-gray-200 dark:border-slate-700'}`}
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center">
                            <FontAwesome name="clock-o" size={16} color={timeEnabled ? '#3b82f6' : '#94a3b8'} className="mr-3" />
                            <Text className={`font-bold ${timeEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Time Range</Text>
                        </View>
                        <FontAwesome name={timeEnabled ? 'check-circle' : 'circle-o'} size={20} color={timeEnabled ? '#3b82f6' : '#94a3b8'} />
                    </View>

                    {timeEnabled && (
                        <View className="flex-row items-center gap-4 mt-2">
                            <View className="flex-1">
                                <Text className="text-xs text-slate-500 mb-1">Start Hour (0-23)</Text>
                                <TextInput
                                    value={timeStart}
                                    onChangeText={setTimeStart}
                                    keyboardType="number-pad"
                                    className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white text-center font-bold"
                                />
                            </View>
                            <Text className="text-slate-400 font-bold">-</Text>
                            <View className="flex-1">
                                <Text className="text-xs text-slate-500 mb-1">End Hour (0-23)</Text>
                                <TextInput
                                    value={timeEnd}
                                    onChangeText={setTimeEnd}
                                    keyboardType="number-pad"
                                    className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white text-center font-bold"
                                />
                            </View>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Amount Condition */}
                <TouchableOpacity
                    onPress={() => setAmountEnabled(!amountEnabled)}
                    className={`p-4 rounded-2xl mb-4 border ${amountEnabled ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-500' : 'bg-white dark:bg-[#1e293b] border-gray-200 dark:border-slate-700'}`}
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center">
                            <FontAwesome name="money" size={16} color={amountEnabled ? '#3b82f6' : '#94a3b8'} className="mr-3" />
                            <Text className={`font-bold ${amountEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Amount Range</Text>
                        </View>
                        <FontAwesome name={amountEnabled ? 'check-circle' : 'circle-o'} size={20} color={amountEnabled ? '#3b82f6' : '#94a3b8'} />
                    </View>

                    {amountEnabled && (
                        <View className="flex-row items-center gap-4 mt-2">
                            <View className="flex-1">
                                <Text className="text-xs text-slate-500 mb-1">Min Amount</Text>
                                <TextInput
                                    value={amountMin}
                                    onChangeText={setAmountMin}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white text-center font-bold"
                                />
                            </View>
                            <Text className="text-slate-400 font-bold">-</Text>
                            <View className="flex-1">
                                <Text className="text-xs text-slate-500 mb-1">Max Amount</Text>
                                <TextInput
                                    value={amountMax}
                                    onChangeText={setAmountMax}
                                    keyboardType="numeric"
                                    placeholder="∞"
                                    className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white text-center font-bold"
                                />
                            </View>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Keyword Condition */}
                <TouchableOpacity
                    onPress={() => setKeywordEnabled(!keywordEnabled)}
                    className={`p-4 rounded-2xl mb-8 border ${keywordEnabled ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-500' : 'bg-white dark:bg-[#1e293b] border-gray-200 dark:border-slate-700'}`}
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center">
                            <FontAwesome name="tag" size={16} color={keywordEnabled ? '#3b82f6' : '#94a3b8'} className="mr-3" />
                            <Text className={`font-bold ${keywordEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Description Keyword</Text>
                        </View>
                        <FontAwesome name={keywordEnabled ? 'check-circle' : 'circle-o'} size={20} color={keywordEnabled ? '#3b82f6' : '#94a3b8'} />
                    </View>

                    {keywordEnabled && (
                        <View className="mt-2">
                            <TextInput
                                value={keyword}
                                onChangeText={setKeyword}
                                placeholder="e.g. Uber, Netflix, Salary"
                                className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white font-bold"
                            />
                        </View>
                    )}
                </TouchableOpacity>

                {/* Action - Select Category */}
                <Text className="text-slate-900 dark:text-white font-bold mb-4 px-1">Action: Set Category</Text>
                <View className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-700 mb-12">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3">
                        {categories.filter(c => c.type === type).map((cat) => (
                            <TouchableOpacity
                                key={cat.id}
                                onPress={() => setSelectedCategory(cat)}
                                className={`p-3 rounded-xl border items-center w-24 ${selectedCategory?.id === cat.id ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700'}`}
                            >
                                <View className={`w-8 h-8 rounded-full items-center justify-center mb-2`} style={{ backgroundColor: `${cat.color}20` }}>
                                    <FontAwesome name={cat.icon as any} size={14} color={cat.color} />
                                </View>
                                <Text numberOfLines={1} className={`text-xs font-semibold ${selectedCategory?.id === cat.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>{cat.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {!selectedCategory && (
                        <Text className="text-red-500 text-xs mt-2 text-center">Please select a category *</Text>
                    )}
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}
