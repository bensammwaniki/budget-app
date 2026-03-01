import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolate, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountService } from '../../services/accountService';
import { debtService } from '../../services/debtService';
import { Account } from '../../types/account';

function AddDebtScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();

    const [type, setType] = useState<'LIABILITY' | 'RECEIVABLE'>('LIABILITY');
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [interestRate, setInterestRate] = useState('');
    const [isReducingBalance, setIsReducingBalance] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<string | undefined>(undefined);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [expectedPayDate, setExpectedPayDate] = useState<Date | undefined>(undefined);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showDueDatePicker, setShowDueDatePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    const scrollY = useSharedValue(0);

    const formatWithCommas = (value: string) => {
        const numeric = value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if (!numeric) return '';
        return parseInt(numeric, 10).toLocaleString();
    };

    const handleAmountChange = (text: string) => {
        setAmount(formatWithCommas(text));
    };

    useFocusEffect(
        useCallback(() => {
            let active = true;
            accountService.getAccounts().then(accs => {
                if (active) setAccounts(accs);
            });
            return () => { active = false; };
        }, [])
    );

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    const headerStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scrollY.value, [0, 50], [0, 1], Extrapolate.CLAMP);
        const borderOpacity = interpolate(scrollY.value, [0, 50], [0, 0.1], Extrapolate.CLAMP);
        return {
            backgroundColor: colorScheme === 'dark' ? `rgba(15, 23, 42, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
            borderBottomColor: colorScheme === 'dark' ? `rgba(255, 255, 255, ${borderOpacity})` : `rgba(0, 0, 0, ${borderOpacity})`,
            borderBottomWidth: 1,
        };
    });

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setStartDate(selectedDate);
            // If the start date is moved past the month of due date, reset it
            if (expectedPayDate) {
                const startYear = selectedDate.getFullYear();
                const startMonth = selectedDate.getMonth();
                const dueYear = expectedPayDate.getFullYear();
                const dueMonth = expectedPayDate.getMonth();

                if (startYear > dueYear || (startYear === dueYear && startMonth > dueMonth)) {
                    setExpectedPayDate(undefined);
                }
            }
        }
    };

    const handleMonthYearSelect = (month: number, year: number) => {
        // Set date to the last day of that month
        const lastDay = new Date(year, month + 1, 0);
        setExpectedPayDate(lastDay);
    };

    const projectedInterestValue = useMemo(() => {
        const principal = parseFloat(amount.replace(/,/g, '')) || 0;
        const rate = parseFloat(interestRate) || 0;
        if (principal <= 0 || rate <= 0) return 0;

        if (!isReducingBalance) {
            return principal * (rate / 100);
        }

        if (expectedPayDate) {
            const diffTime = expectedPayDate.getTime() - startDate.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            return principal * (rate / 100 / 365) * diffDays;
        }

        return 0;
    }, [amount, interestRate, isReducingBalance, expectedPayDate, startDate]);

    const projectedTotal = useMemo(() => {
        return (parseFloat(amount.replace(/,/g, '')) || 0) + projectedInterestValue;
    }, [amount, projectedInterestValue]);

    const handleSave = async () => {
        if (!name || !amount) {
            Alert.alert('Missing Fields', 'Please enter a name and amount.');
            return;
        }

        setLoading(true);
        try {
            await debtService.createDebt({
                userId: 'local_user',
                type,
                name,
                amount: parseFloat(amount.replace(/,/g, '')),
                accountId: selectedAccount,
                interestRate: interestRate ? parseFloat(interestRate) : undefined,
                isReducingBalance,
                startDate: startDate,
                dueDate: expectedPayDate
            });
            router.back();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Error', `Failed to create debt: ${errorMessage}`);
            console.error('Debt creation error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
            {/* Header */}
            <Animated.View
                style={[
                    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top },
                    headerStyle
                ]}
            >
                <View className="px-6 py-4 flex-row items-center">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image
                            source={require('../../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-slate-900 dark:text-white ml-2">Add New {type === 'LIABILITY' ? 'Debt' : 'Loan'}</Text>
                </View>
            </Animated.View>

            <Animated.ScrollView
                className="flex-1"
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 100 }}
            >
                <View className="p-6">
                    {/* Type Selection */}
                    <View style={{ flexDirection: 'row', backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#e6edf3', padding: 4, borderRadius: 12, marginBottom: 24 }}>
                        <TouchableOpacity
                            onPress={() => setType('LIABILITY')}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: type === 'LIABILITY' ? (colorScheme === 'dark' ? '#334155' : '#ffffff') : 'transparent',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: type === 'LIABILITY' ? 1 : 0 },
                                shadowOpacity: type === 'LIABILITY' ? 0.08 : 0,
                                shadowRadius: type === 'LIABILITY' ? 4 : 0,
                                elevation: type === 'LIABILITY' ? 1 : 0,
                            }}
                        >
                            <Text style={{ textAlign: 'center', fontWeight: '700', color: type === 'LIABILITY' ? (colorScheme === 'dark' ? '#ffffff' : '#0f172a') : '#64748b' }}>I Owe (Liability)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setType('RECEIVABLE')}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: type === 'RECEIVABLE' ? (colorScheme === 'dark' ? '#334155' : '#ffffff') : 'transparent',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: type === 'RECEIVABLE' ? 1 : 0 },
                                shadowOpacity: type === 'RECEIVABLE' ? 0.08 : 0,
                                shadowRadius: type === 'RECEIVABLE' ? 4 : 0,
                                elevation: type === 'RECEIVABLE' ? 1 : 0,
                            }}
                        >
                            <Text style={{ textAlign: 'center', fontWeight: '700', color: type === 'RECEIVABLE' ? (colorScheme === 'dark' ? '#ffffff' : '#0f172a') : '#64748b' }}>Owed to Me</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-4">
                        <Text className="text-sm font-semibold text-slate-500 mb-1">{type === 'LIABILITY' ? 'Lender Name' : 'Borrower Name'}</Text>
                        <TextInput
                            className="text-slate-900 dark:text-white text-lg border-b border-gray-200 dark:border-gray-700 pb-2"
                            placeholder={type === 'LIABILITY' ? "e.g. Fuliza, Bank, John" : "e.g. John, Alice"}
                            placeholderTextColor="#94a3b8"
                            value={name}
                            onChangeText={setName}
                        />
                    </View>

                    <View className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-4">
                        <Text className="text-sm font-semibold text-slate-500 mb-1">Total Amount (Principal)</Text>
                        <TextInput
                            className="text-slate-900 dark:text-white text-lg border-b border-gray-200 dark:border-gray-700 pb-2"
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={handleAmountChange}
                        />
                    </View>

                    <View className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-4">
                        <Text className="text-sm font-semibold text-slate-500 mb-1">Interest Rate (%) (Optional)</Text>
                        <TextInput
                            className="text-slate-900 dark:text-white text-lg border-b border-gray-200 dark:border-gray-700 pb-2"
                            placeholder="e.g. 12.5"
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={interestRate}
                            onChangeText={setInterestRate}
                        />

                        {/* Reducing Balance Toggle */}
                        <View className="flex-row items-center justify-between mt-6 border-t border-gray-100 dark:border-gray-800 pt-4">
                            <View className="flex-1 pr-4">
                                <Text className="text-base font-semibold text-slate-800 dark:text-slate-200">Reducing Balance Rate</Text>
                                <Text className="text-xs text-slate-500 mt-1 leading-snug">
                                    Turn this on if repayments reduce the principal amount used to calculate future interest.
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setIsReducingBalance(!isReducingBalance)}
                                className={`w-12 h-6 rounded-full justify-center p-1 transition-colors duration-200 ease-in-out ${isReducingBalance ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                            >
                                <Animated.View
                                    className="w-4 h-4 rounded-full bg-white shadow-sm"
                                    style={{ transform: [{ translateX: isReducingBalance ? 24 : 0 }] }}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View className='flex-row'>
                        {/* Start Date Selector */}
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-2 border border-blue-50 dark:border-blue-900/20"
                        >
                            <Text className="text-sm font-semibold text-slate-500 mb-2">Loan/Debt Start</Text>
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <View className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full items-center justify-center">
                                        <FontAwesome name="calendar" size={16} color="#3b82f6" />
                                    </View>
                                    <View>
                                        <Text className="text-slate-900 dark:text-white font-bold text-lg">
                                            {startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </Text>
                                        <Text className="text-slate-400 text-xs">
                                            Tap to change
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Expected Pay Date Selector */}
                        <TouchableOpacity
                            onPress={() => setShowDueDatePicker(true)}
                            className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-2 border border-purple-50 dark:border-purple-900/20"
                        >
                            <Text className="text-sm font-semibold text-slate-500 mb-2">Expected Pay Date</Text>
                            <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-3">
                                    <View className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-full items-center justify-center">
                                        <FontAwesome name="calendar-check-o" size={16} color="#a855f7" />
                                    </View>
                                    <View>
                                        <Text className="text-slate-900 dark:text-white font-bold text-lg">
                                            {expectedPayDate
                                                ? expectedPayDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                                                : 'Select Month'}
                                        </Text>
                                        <Text className="text-slate-400 text-xs text-wrap">
                                            Target payoff month
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker
                            value={startDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={onDateChange}
                            maximumDate={new Date()}
                        />
                    )}

                    {showDueDatePicker && (
                        <Modal
                            transparent={true}
                            animationType="fade"
                            visible={showDueDatePicker}
                            onRequestClose={() => setShowDueDatePicker(false)}
                        >
                            <TouchableOpacity
                                className="flex-1 bg-black/50 justify-center items-center p-6"
                                activeOpacity={1}
                                onPress={() => setShowDueDatePicker(false)}
                            >
                                <View className="bg-white dark:bg-[#0f172a] w-full rounded-3xl p-6 shadow-2xl">
                                    <View className="flex-row justify-between items-center mb-6">
                                        <Text className="text-l uppercase font-bold text-slate-900 dark:text-white text-center flex-1 ml-6">Select Month</Text>
                                        <TouchableOpacity onPress={() => setShowDueDatePicker(false)}>
                                            <Image
                                                source={require('../../assets/svg/close.svg')}
                                                style={{ width: 10, height: 10 }}
                                                tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                                                contentFit="contain"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <View className="flex-row flex-wrap justify-between">
                                        {Array.from({ length: 12 }).map((_, i) => {
                                            const now = new Date();
                                            const currentMonth = expectedPayDate ? expectedPayDate.getMonth() : -1;
                                            const isPastMonth = i < now.getMonth() && (!expectedPayDate || expectedPayDate.getFullYear() <= now.getFullYear());

                                            return (
                                                <TouchableOpacity
                                                    key={i}
                                                    disabled={isPastMonth}
                                                    onPress={() => {
                                                        const year = expectedPayDate ? expectedPayDate.getFullYear() : now.getFullYear();
                                                        handleMonthYearSelect(i, year);
                                                    }}
                                                    className={`w-[30%] py-3 mb-2 rounded-xl items-center ${currentMonth === i ? 'bg-blue-600' : isPastMonth ? 'opacity-20' : 'bg-slate-50 dark:bg-slate-800'}`}
                                                >
                                                    <Text className={`font-bold ${currentMonth === i ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                                                        {new Date(0, i).toLocaleString('default', { month: 'short' })}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <View className="flex-row justify-center items-center gap-6 mt-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <TouchableOpacity
                                            onPress={() => {
                                                const currentYear = expectedPayDate ? expectedPayDate.getFullYear() : new Date().getFullYear();
                                                handleMonthYearSelect(expectedPayDate?.getMonth() || 0, currentYear - 1);
                                            }}
                                            className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
                                        >
                                            <FontAwesome name="minus" size={10} color="#3b82f6" />
                                        </TouchableOpacity>
                                        <Text className="text-xl font-black text-slate-900 dark:text-white">
                                            {expectedPayDate ? expectedPayDate.getFullYear() : new Date().getFullYear()}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const currentYear = expectedPayDate ? expectedPayDate.getFullYear() : new Date().getFullYear();
                                                handleMonthYearSelect(expectedPayDate?.getMonth() || 0, currentYear + 1);
                                            }}
                                            className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
                                        >
                                            <FontAwesome name="plus" size={10} color="#3b82f6" />
                                        </TouchableOpacity>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => setShowDueDatePicker(false)}
                                        className="bg-blue-600 mt-8 py-4 rounded-2xl items-center"
                                    >
                                        <Text className="text-white font-bold text-lg">Confirm</Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        </Modal>
                    )}

                    {/* Projection Summary */}
                    {(projectedInterestValue > 0) && (
                        <View className="bg-slate-900 dark:bg-white p-6 rounded-3xl mb-8 shadow-xl">
                            <Text className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Projected Total Owed</Text>
                            <View className="flex-row items-baseline gap-2">
                                <Text className="text-white dark:text-slate-900 text-3xl font-bold">KES {projectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                            </View>
                            <View className="mt-4 pt-4 border-t border-slate-800 dark:border-slate-100">
                                <View className="flex-row justify-between mb-1">
                                    <Text className="text-slate-400 dark:text-slate-500 text-xs">Initial Principal</Text>
                                    <Text className="text-slate-300 dark:text-slate-700 text-xs font-bold">KES {(parseFloat(amount) || 0).toLocaleString()}</Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-slate-400 dark:text-slate-500 text-xs">Estimated Interest</Text>
                                    <Text className="text-blue-400 dark:text-blue-600 text-xs font-bold">+KES {projectedInterestValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    <View className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-6">
                        <Text className="text-sm font-semibold text-slate-500 mb-2">
                            {type === 'LIABILITY' ? 'Money Received Into (Optional)' : 'Money Sent From (Optional)'}
                        </Text>
                        <View className="flex-row gap-2 flex-wrap">
                            {accounts.map(acc => (
                                <TouchableOpacity
                                    key={acc.id}
                                    onPress={() => setSelectedAccount(acc.id === selectedAccount ? undefined : acc.id)}
                                    className={`px-3 py-2 rounded-lg border ${selectedAccount === acc.id ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200'}`}
                                >
                                    <Text className={`${selectedAccount === acc.id ? 'text-blue-600 font-bold' : 'text-slate-600'}`}>{acc.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text className="text-xs text-slate-400 mt-2">
                            {type === 'LIABILITY'
                                ? 'Select an account if you received this loan into it (we create an Income transaction).'
                                : 'Select an account if you sent this money from it (we create an Expense transaction).'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-500/30"
                        onPress={handleSave}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Create {type === 'LIABILITY' ? 'Debt' : 'Loan'}</Text>}
                    </TouchableOpacity>
                </View>
            </Animated.ScrollView>
        </View>
    );
}

export default AddDebtScreen;
