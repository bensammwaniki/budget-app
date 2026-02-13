import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountService } from '../../services/accountService';
import { debtService } from '../../services/debtService';
import { Account } from '../../types/account';

export default function AddDebtScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [type, setType] = useState<'LIABILITY' | 'RECEIVABLE'>('LIABILITY');
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [interestRate, setInterestRate] = useState('');
    const [selectedAccount, setSelectedAccount] = useState<string | undefined>(undefined);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            accountService.getAccounts().then(setAccounts);
        }, [])
    );

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
                dueDate: undefined // Optional for now
            });
            router.back();
        } catch (error) {
            Alert.alert('Error', 'Failed to create debt.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <View className="px-6 py-4 flex-row items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f172a]">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <FontAwesome name="arrow-left" size={20} color="#64748b" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-slate-900 dark:text-white">Add New {type === 'LIABILITY' ? 'Debt' : 'Loan'}</Text>
            </View>

            <View className="p-6">
                {/* Type Selection */}
                <View className="flex-row bg-slate-200 dark:bg-slate-800 p-1 rounded-xl mb-6">
                    <TouchableOpacity
                        className={`flex-1 py-3 rounded-lg ${type === 'LIABILITY' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
                        onPress={() => setType('LIABILITY')}
                    >
                        <Text className={`text-center font-bold ${type === 'LIABILITY' ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>I Owe (Liability)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={`flex-1 py-3 rounded-lg ${type === 'RECEIVABLE' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
                        onPress={() => setType('RECEIVABLE')}
                    >
                        <Text className={`text-center font-bold ${type === 'RECEIVABLE' ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>Owed to Me</Text>
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
        </View>
    );
}
