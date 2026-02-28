import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IncomeFrequency, incomeService } from '../../services/incomeService';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4'];
const FREQUENCIES: { value: IncomeFrequency; label: string; icon: string }[] = [
    { value: 'MONTHLY', label: 'Monthly', icon: 'calendar' },
    // { value: 'BI_WEEKLY', label: 'Bi-weekly', icon: 'calendar-o' },
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
    const [incomeDate, setIncomeDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

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
                initialAmount: amount, // Use the expected amount as initial log if provided
                initialDate: incomeDate.toISOString(),
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
                <View className="bg-white dark:bg-[#0f172a] rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">

                    {/* Name */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Money from</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-2  mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-2">From</Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-semibold text-md"
                            placeholder="Salary, Freelance, Rental"
                            placeholderTextColor="#94a3b8"
                            value={name}
                            onChangeText={setName}
                            autoFocus
                        />
                    </View>

                    {/* Expected Amount */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Expected Amount</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-2 mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-2">KES </Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-bold text-md"
                            placeholder="30000"
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
                                className={`flex-row items-center px-4 py-1 rounded-full border gap-1 ${frequency === f.value
                                    ? 'border-emerald-600'
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                                    }`}
                                style={frequency === f.value ? { backgroundColor: `${selectedColor}20`, borderColor: selectedColor } : {}}
                            >
                                <FontAwesome name={f.icon as any} size={10} color={frequency === f.value ? selectedColor : '#94a3b8'} />
                                <Text className={`font-semibold text-[10px] ${frequency === f.value ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}
                                    style={frequency === f.value ? { color: selectedColor } : {}}
                                >{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Income Date */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Income Date</Text>
                    <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-3 mb-6 border border-slate-200 dark:border-slate-700"
                    >
                        <FontAwesome name="calendar" size={16} color={selectedColor} className="mr-3" />
                        <Text className="text-slate-900 dark:text-white font-semibold ml-2">
                            {incomeDate.toLocaleDateString(undefined, { dateStyle: 'long' })}
                        </Text>
                        <View className="flex-1" />
                        <FontAwesome name="chevron-down" size={12} color="#94a3b8" />
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={incomeDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(Platform.OS === 'ios');
                                if (selectedDate) {
                                    setIncomeDate(selectedDate);
                                }
                            }}
                            maximumDate={new Date()}
                        />
                    )}

                    {/* Recurring Toggle */}
                    <View className="flex-row items-center justify-between mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <View>
                            <Text className="font-bold text-slate-900 dark:text-white">Recurring Income</Text>
                            <Text className="text-slate-400 text-xs mt-0.5">Track this as a regular income stream</Text>
                        </View>
                        <Switch
                            value={isRecurring}
                            onValueChange={setIsRecurring}
                            trackColor={{
                                false: '#cbd5e1',
                                true: selectedColor,
                            }}
                            thumbColor="#ffffff"
                        />
                    </View>

                    {/* Color */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Theme Color</Text>
                    <View className="flex-row flex-wrap gap-3 mb-8">
                        {COLORS.map(color => (
                            <TouchableOpacity
                                key={color}
                                onPress={() => setSelectedColor(color)}
                                className="w-8 h-8 rounded-full items-center justify-center border-2"
                                style={{
                                    backgroundColor: color,
                                    borderColor: selectedColor === color ? (isDark ? 'white' : 'black') : 'transparent'
                                }}
                            >
                                {selectedColor === color && <FontAwesome name="check" size={10} color="white" />}
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
                                <Image
                                    source={require(`../../assets/svg/income.svg`)}
                                    style={{ width: 18, height: 18 }}
                                    tintColor={"white"}
                                    contentFit="contain"
                                />
                                <Text className="text-white font-bold text-sm uppercase">Add An Income Source</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}
