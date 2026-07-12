import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IncomeFrequency, incomeService } from '../../services/incomeService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/account';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4'];
const FREQUENCIES: { value: IncomeFrequency; label: string; icon: string }[] = [
    { value: 'MONTHLY', label: 'Monthly', icon: 'calendar' },
    // { value: 'BI_WEEKLY', label: 'Bi-weekly', icon: 'calendar-o' },
    { value: 'WEEKLY', label: 'Weekly', icon: 'refresh' },
    { value: 'IRREGULAR', label: 'Irregular', icon: 'random' },
];
const RECEIVE_ACCOUNTS = [
    { type: 'CASH', label: 'Cash', icon: 'money' },
    { type: 'M-PESA', label: 'M-PESA', icon: 'mobile' },
    { type: 'BANK', label: 'Bank', icon: 'university' },
] as const;

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
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [accountId, setAccountId] = useState('');

    useEffect(() => {
        accountService.getAccounts().then((items) => {
            setAccounts(items);
            const mpesa = items.find(item => item.type === 'M-PESA');
            if (mpesa) setAccountId(mpesa.id);
            else if (items.length > 0) setAccountId(items[0].id);
        }).catch((error) => console.error('Failed to load accounts:', error));
    }, []);

    const formatWithCommas = (value: string) => {
        const numeric = value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if (!numeric) return '';
        return parseInt(numeric, 10).toLocaleString();
    };

    const handleAmountChange = (text: string) => {
        setExpectedAmount(formatWithCommas(text));
    };

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
        if (!accountId) {
            Alert.alert('Account required', 'Choose the account where this income is received.');
            return;
        }

        setLoading(true);
        try {
            await incomeService.createSource({
                name: name.trim(),
                accountId,
                expectedAmount: amount,
                frequency: isRecurring ? frequency : 'IRREGULAR',
                scheduledDate: incomeDate.toISOString(),
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
        <View className="flex-1 app-screen" style={{ paddingTop: insets.top }}>
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
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Money from</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                            placeholder="Salary, Freelance, Rental"
                            placeholderTextColor="#94a3b8"
                            value={name}
                            onChangeText={setName}
                            autoFocus
                        />
                    </View>

                    {/* Expected Amount */}
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Expected Amount (KES)</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-2">KES</Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                            placeholder="30,000"
                            placeholderTextColor="#94a3b8"
                            value={expectedAmount}
                            onChangeText={handleAmountChange}
                            keyboardType="numeric"
                        />
                    </View>

                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Received Into</Text>
                    <View className="flex-row gap-3 mb-6">
                        {RECEIVE_ACCOUNTS.map(option => {
                            const account = accounts.find(item => item.type === option.type);
                            const selected = account?.id === accountId;
                            return (
                                <TouchableOpacity
                                    key={option.type}
                                    disabled={!account}
                                    onPress={() => account && setAccountId(account.id)}
                                    className={`flex-1 items-center py-3 rounded-xl border ${selected
                                        ? 'border-transparent'
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'} ${!account ? 'opacity-40' : ''}`}
                                    style={selected ? { backgroundColor: `${selectedColor}20`, borderColor: selectedColor } : {}}
                                >
                                    <FontAwesome name={option.icon as any} size={16} color={selected ? selectedColor : '#94a3b8'} />
                                    <Text
                                        className="mt-1 text-[10px] font-bold"
                                        style={{ color: selected ? selectedColor : (isDark ? '#cbd5e1' : '#475569') }}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
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
                            onChange={(_event, selectedDate) => {
                                setShowDatePicker(Platform.OS === 'ios');
                                if (selectedDate) {
                                    setIncomeDate(selectedDate);
                                }
                            }}
                            maximumDate={new Date()}
                        />
                    )}

                    {/* Recurring Toggle */}
                    <View className="mb-6 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/40">
                        <View className="px-4 py-3 flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1 pr-3">
                                <View className="flex-1">
                                    <Text className="font-bold text-slate-900 dark:text-white">Recurring Income</Text>
                                    <Text className="text-slate-400 text-xs mt-0.5">
                                        {isRecurring
                                            ? 'Track this as a repeating income stream.'
                                            : 'One-time source for the selected month.'}
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isRecurring}
                                onValueChange={setIsRecurring}
                                trackColor={{
                                    false: isDark ? '#334155' : '#cbd5e1',
                                    true: selectedColor,
                                }}
                                thumbColor="#ffffff"
                            />
                        </View>
                        <View className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20">
                            <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                                {isRecurring
                                    ? `Mode: Recurring (${FREQUENCIES.find(f => f.value === frequency)?.label || frequency})`
                                    : 'Mode: One-time (Selected month only)'}
                            </Text>
                        </View>
                    </View>

                    {/* Frequency */}
                    {isRecurring && (
                        <>
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
                        </>
                    )}

                    {/* Color */}
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Theme Color</Text>
                    <View className="flex-row flex-wrap gap-3 mb-8">
                        {COLORS.map(color => (
                            <TouchableOpacity
                                key={color}
                                onPress={() => setSelectedColor(color)}
                                className="w-8 h-8 rounded-full items-center justify-center border"
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
