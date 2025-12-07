import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteAutomationRule, getAutomationRules, toggleAutomationRule } from '../../services/database';
import { AutomationRule } from '../../types/automation';

export default function AutomationListScreen() {
    const router = useRouter();
    const { colorScheme } = useColorScheme();
    const insets = useSafeAreaInsets();
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [loading, setLoading] = useState(true);

    const loadRules = useCallback(async () => {
        try {
            const data = await getAutomationRules();
            setRules(data);
        } catch (error) {
            console.error('Failed to load rules:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadRules();
        }, [loadRules])
    );

    const handleDelete = (id: number) => {
        Alert.alert(
            'Delete Rule',
            'Are you sure you want to delete this automation rule?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteAutomationRule(id);
                        loadRules();
                    }
                }
            ]
        );
    };

    const handleToggle = async (rule: AutomationRule) => {
        // Optimistic update
        const updatedRules = rules.map(r =>
            r.id === rule.id ? { ...r, isEnabled: !r.isEnabled } : r
        );
        setRules(updatedRules);

        try {
            await toggleAutomationRule(rule.id, !rule.isEnabled);
        } catch (error) {
            console.error('Failed to toggle rule:', error);
            loadRules(); // Revert on error
        }
    };

    const renderConditionSummary = (rule: AutomationRule) => {
        return rule.conditions.map((c, i) => {
            let text = '';
            if (c.field === 'TIME') text = `⏰ ${c.value.start}:00 - ${c.value.end}:00`;
            else if (c.field === 'AMOUNT') text = `💰 ${c.operator.replace('_', ' ')} ${c.value}`;
            else if (c.field === 'DESCRIPTION') text = `📝 ${c.operator} "${c.value}"`;
            return (
                <View key={i} className="bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-md mr-2 mb-1">
                    <Text className="text-xs text-slate-600 dark:text-slate-300">{text}</Text>
                </View>
            );
        });
    };

    if (loading) {
        return (
            <View className="flex-1 bg-gray-50 dark:bg-[#020617] items-center justify-center">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
            {/* Header */}
            <View
                className="px-6 pb-4 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800 shadow-sm z-10 flex-row justify-between items-center"
                style={{ paddingTop: insets.top > 0 ? insets.top : 20 }}
            >
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <FontAwesome name="arrow-left" size={20} color={colorScheme === 'dark' ? '#fff' : '#1e293b'} />
                </TouchableOpacity>
                <Text className="text-slate-900 dark:text-white text-xl font-bold">Automation Rules</Text>
                <View className="w-8" />
            </View>

            <ScrollView className="flex-1 px-4 pt-4">
                {rules.length === 0 ? (
                    <View className="items-center justify-center py-20">
                        <View className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full items-center justify-center mb-6">
                            <FontAwesome name="magic" size={32} color="#3b82f6" />
                        </View>
                        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-2">No Rules Yet</Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-center px-8 mb-8">
                            Create rules to automatically categorize your transactions based on time, amount, or keywords.
                        </Text>
                    </View>
                ) : (
                    <View className="pb-24">
                        {rules.map((rule) => (
                            <View key={rule.id} className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-4 border border-gray-200 dark:border-slate-700 shadow-sm">
                                <View className="flex-row justify-between items-start mb-2">
                                    <View className="flex-1 mr-4">
                                        <Text className="text-slate-900 dark:text-white font-bold text-lg mb-1">{rule.name}</Text>
                                        <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">{rule.type}</Text>
                                    </View>
                                    <Switch
                                        value={rule.isEnabled}
                                        onValueChange={() => handleToggle(rule)}
                                        trackColor={{ false: '#e2e8f0', true: '#3b82f6' }}
                                        thumbColor={'#ffffff'}
                                    />
                                </View>

                                <View className="flex-row flex-wrap mb-3">
                                    {renderConditionSummary(rule)}
                                </View>

                                <View className="flex-row justify-between items-center pt-3 border-t border-gray-100 dark:border-slate-800">
                                    <View className="flex-row items-center">
                                        <Text className="text-slate-500 dark:text-slate-400 text-xs mr-2">Action:</Text>
                                        <View className="flex-row items-center bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                                            <FontAwesome name="folder" size={12} color="#3b82f6" style={{ marginRight: 6 }} />
                                            <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold">Category Set</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => handleDelete(rule.id)} className="p-2">
                                        <FontAwesome name="trash" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* FAB */}
            <View
                className="absolute right-6"
                style={{ bottom: (insets.bottom > 0 ? insets.bottom : 20) + 20 }}
            >
                <TouchableOpacity
                    onPress={() => router.push('/automation/create')}
                    className="w-14 h-14 bg-blue-600 rounded-full items-center justify-center shadow-lg shadow-blue-600/30"
                >
                    <FontAwesome name="plus" size={24} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
}
