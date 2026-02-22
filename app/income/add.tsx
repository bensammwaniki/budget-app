import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IncomeFrequency, incomeService } from '../../services/incomeService';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#06b6d4'];
const FREQUENCIES: { value: IncomeFrequency; label: string; icon: string }[] = [
    { value: 'MONTHLY', label: 'Monthly', icon: 'calendar' },
    { value: 'BI_WEEKLY', label: 'Bi-weekly', icon: 'calendar-o' },
    { value: 'WEEKLY', label: 'Weekly', icon: 'refresh' },
    { value: 'IRREGULAR', label: 'Irregular', icon: 'random' },
];

export default function AddIncomeSourceScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [name, setName] = useState('');
    const [expectedAmount, setExpectedAmount] = useState('');
    const [frequency, setFrequency] = useState<IncomeFrequency>('MONTHLY');
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [isRecurring, setIsRecurring] = useState(true);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Please enter a name for this income source.');
            return;
        }

        const amount = expectedAmount ? parseFloat(expectedAmount.replace(/,/g, '')) : undefined;
        if (expectedAmount && (isNaN(amount!) || amount! <= 0)) {
            Alert.alert('Invalid Amount', 'Please enter a valid expected amount.');
            return;
        }

        setLoading(true);
        try {
            await incomeService.createSource({
                name: name.trim(),
                expectedAmount: amount,
                frequency,
                color: selectedColor,
                isRecurring,
            });
            router.back();
        } catch (e) {
            console.error('Failed to create income source:', e);
            Alert.alert('Error', 'Failed to create income source. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />

            <View className="px-6 py-4 flex-row items-center border-b border-gray-200 dark:border-slate-800">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <Image
                        source={require('../../assets/svg/back.svg')}
                        style={{ width: 24, height: 24 }}
                        tintColor={isDark ? '#fff' : '#1e293b'}
                        contentFit="contain"
                    />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-slate-900 dark:text-white ml-2">New Income Source</Text>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
                <View className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">

                    {/* Name */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Source Name</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-200 dark:border-slate-700">
                        <FontAwesome name="tag" size={16} color="#94a3b8" />
                        <TextInput
                            className="flex-1 ml-3 text-slate-900 dark:text-white font-semibold text-lg"
                            placeholder="e.g. Salary, Freelance, Rental"
                            placeholderTextColor="#94a3b8"
                            value={name}
                            onChangeText={setName}
                            autoFocus
                        />
                    </View>

                    {/* Expected Amount */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Expected Amount (optional)</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-2">KES</Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-bold text-2xl"
                            placeholder="0"
                            placeholderTextColor="#94a3b8"
                            value={expectedAmount}
                            onChangeText={setExpectedAmount}
                            keyboardType="numeric"
                        />
                    </View>

                    {/* Frequency */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Frequency</Text>
                    <View className="flex-row flex-wrap gap-3 mb-6">
                        {FREQUENCIES.map(f => (
                            <TouchableOpacity
                                key={f.value}
                                onPress={() => setFrequency(f.value)}
                                className={`flex-row items-center px-4 py-2.5 rounded-full border gap-2 ${frequency === f.value
                                        ? 'border-emerald-600'
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                                    }`}
                                style={frequency === f.value ? { backgroundColor: `${selectedColor}20`, borderColor: selectedColor } : {}}
                            >
                                <FontAwesome name={f.icon as any} size={12} color={frequency === f.value ? selectedColor : '#94a3b8'} />
                                <Text className={`font-semibold text-sm ${frequency === f.value ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}
                                    style={frequency === f.value ? { color: selectedColor } : {}}
                                >{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Recurring Toggle */}
                    <View className="flex-row items-center justify-between mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <View>
                            <Text className="font-bold text-slate-900 dark:text-white">Recurring Income</Text>
                            <Text className="text-slate-400 text-xs mt-0.5">Track this as a regular income stream</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setIsRecurring(!isRecurring)}
                            className={`w-12 h-7 rounded-full px-0.5 items-center justify-center flex-row ${isRecurring ? 'justify-end' : 'justify-start'}`}
                            style={{ backgroundColor: isRecurring ? selectedColor : '#cbd5e1' }}
                        >
                            <View className="w-6 h-6 bg-white rounded-full shadow-sm" />
                        </TouchableOpacity>
                    </View>

                    {/* Color */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Theme Color</Text>
                    <View className="flex-row flex-wrap gap-3 mb-8">
                        {COLORS.map(color => (
                            <TouchableOpacity
                                key={color}
                                onPress={() => setSelectedColor(color)}
                                className="w-10 h-10 rounded-full items-center justify-center border-2"
                                style={{
                                    backgroundColor: color,
                                    borderColor: selectedColor === color ? (isDark ? 'white' : 'black') : 'transparent'
                                }}
                            >
                                {selectedColor === color && <FontAwesome name="check" size={12} color="white" />}
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Save */}
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={loading}
                        className="p-4 rounded-xl flex-row justify-center items-center gap-2"
                        style={{ backgroundColor: selectedColor }}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <FontAwesome name="check" size={16} color="white" />
                                <Text className="text-white font-bold text-lg">Create Source</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}
