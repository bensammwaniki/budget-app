import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
    const [selectedAccount, setSelectedAccount] = useState<string | undefined>(undefined);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    const scrollY = useSharedValue(0);

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
        }
    };

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
                amount: parseFloat(amount),
                accountId: selectedAccount,
                interestRate: interestRate ? parseFloat(interestRate) : undefined,
                startDate: startDate,
                dueDate: undefined // Optional for now
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
                            onChangeText={setAmount}
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
                    </View>

                    {/* Start Date Selector */}
                    <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        className="bg-white dark:bg-[#0f172a] p-4 rounded-xl mb-4 border border-blue-50 dark:border-blue-900/20"
                    >
                        <Text className="text-sm font-semibold text-slate-500 mb-2">Loan/Debt Start Date</Text>
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
                            <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                        </View>
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={startDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={onDateChange}
                            maximumDate={new Date()}
                        />
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
