import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { savingsService } from '../../services/savingsService';

const COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
];

export default function AddGoalScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colorScheme } = useColorScheme();

    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [targetDate, setTargetDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [loading, setLoading] = useState(false);

    const formatWithCommas = (value: string) => {
        const numeric = value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if (!numeric) return '';
        return parseInt(numeric, 10).toLocaleString();
    };

    const handleAmountChange = (text: string) => {
        setTargetAmount(formatWithCommas(text));
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a goal name.');
            return;
        }

        const amount = parseFloat(targetAmount.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Please enter a valid target amount.');
            return;
        }

        setLoading(true);
        try {
            await savingsService.createGoal({
                name: name.trim(),
                targetAmount: amount,
                targetDate: targetDate ? targetDate.toISOString() : undefined,
                color: selectedColor
            });
            router.back();
        } catch (error) {
            console.error('Failed to create goal:', error);
            Alert.alert('Error', 'Failed to create goal. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (event: any, selected: Date | undefined) => {
        setShowDatePicker(false);
        if (selected) {
            setTargetDate(selected);
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]" style={{ paddingTop: insets.top }}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <View className="px-6 py-4 flex-row items-center border-b border-gray-200 dark:border-slate-800">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <Image
                        source={require('../../assets/svg/back.svg')}
                        style={{ width: 24, height: 24 }}
                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                        contentFit="contain"
                    />
                </TouchableOpacity>
                <Text className="text-l font-bold text-slate-900 dark:text-white ml-2 uppercase">Add a New Savings Goal</Text>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                >
                    {/* Form Wrapper */}
                    <View className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">

                    {/* Goal Name */}
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">What are you saving for ?</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-1">GOAL  </Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                            placeholder="Vacation, Emergency Fund"
                            placeholderTextColor="#94a3b8"
                            value={name}
                            onChangeText={setName}
                            style={{ color: selectedColor }}
                            autoFocus
                        />
                    </View>

                    {/* Target Amount */}
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Target Amount (KES)</Text>
                    <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
                        <Text className="text-slate-400 font-bold mr-2">KES    </Text>
                        <TextInput
                            className="flex-1 text-slate-900 dark:text-white font-semibold text-[16px]"
                            placeholder="0"
                            placeholderTextColor="#94a3b8"
                            value={targetAmount}
                            onChangeText={handleAmountChange}
                            keyboardType="numeric"
                            style={{ color: selectedColor }}
                        />
                    </View>

                    {/* Target Date */}
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">Target Date (Optional)</Text>
                    <TouchableOpacity
                        className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-200 dark:border-slate-700"
                        onPress={() => setShowDatePicker(true)}
                    >
                        <FontAwesome name="calendar" size={16} color="#94a3b8" />
                        <Text className={`flex-1 ml-6 font-semibold text-[14px] ${targetDate ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} style={{ color: targetDate ? selectedColor : '#94a3b8' }}>
                            {targetDate ? targetDate.toLocaleDateString() : '  Set a deadline'}
                        </Text>
                        {targetDate && (
                            <TouchableOpacity onPress={() => setTargetDate(null)}>
                                <FontAwesome name="times-circle" size={16} color="#94a3b8" />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>

                    {/* Color Picker */}
                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-3 uppercase tracking-wider">Theme Color</Text>
                    <View className="flex-row flex-wrap gap-3 mb-8">
                        {COLORS.map((color) => (
                            <TouchableOpacity
                                key={color}
                                onPress={() => setSelectedColor(color)}
                                className="w-8 h-8 rounded-full items-center justify-center border-2"
                                style={{
                                    backgroundColor: color,
                                    borderColor: selectedColor === color ? (colorScheme === 'dark' ? 'white' : 'black') : 'transparent'
                                }}
                            >
                                {selectedColor === color && (
                                    <FontAwesome name="check" size={12} color="white" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                        className="bg-blue-600 p-4 rounded-xl flex-row justify-center items-center shadow-lg shadow-blue-500/30"
                        onPress={handleSave}
                        disabled={loading}
                        style={{ backgroundColor: selectedColor }} // Match the theme color
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Image
                                    source={require('../../assets/svg/confirm.svg')}
                                    style={{ width: 20, height: 20 }}
                                    tintColor={"white"}
                                    contentFit="contain"
                                />
                                <Text className="text-white font-bold text-[12px] uppercase tracking-wider ml-2">Create a Savings Goal</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Date Picker using React Native Community to resolve errors and provide native feel */}
            {showDatePicker && (
                <DateTimePicker
                    value={targetDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                />
            )}
        </View>
    );
}
