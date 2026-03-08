import { FontAwesome } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCategories } from '../services/database';
import { Category, Transaction } from '../types/transaction';
import AddCategoryModal from './AddCategoryModal';

interface CategorizationModalProps {
    visible: boolean;
    transaction: Transaction | null;
    onCategorySelect: (category: Category) => void;
    onDateChange?: (newDate: Date) => void;
    onDelete?: (transaction: Transaction) => void;
    onLinkToGoal?: (transaction: Transaction) => void;
    onLinkToIncome?: (transaction: Transaction) => void;
    onClose: () => void;
}

export default function CategorizationModal({ visible, transaction, onCategorySelect, onDateChange, onDelete, onLinkToGoal, onLinkToIncome, onClose }: CategorizationModalProps) {
    const { colorScheme } = useColorScheme();
    const [categories, setCategories] = useState<Category[]>([]);
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
    const insets = useSafeAreaInsets();
    const [showAddCategory, setShowAddCategory] = useState(false);

    useEffect(() => {
        if (visible) {
            loadCategories();
            if (transaction) {
                const txDate = new Date(transaction.date);
                setCurrentDate(txDate);
                setCalendarMonth(new Date(txDate.getFullYear(), txDate.getMonth(), 1));
            }
        }
    }, [visible, transaction]);

    const loadCategories = async () => {
        try {
            const cats = await getCategories();
            setCategories(cats);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const today = useMemo(() => new Date(), []);
    const todayStart = useMemo(
        () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        [today]
    );

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const isFutureDay = (date: Date) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() > todayStart.getTime();

    const applyDate = (selectedDate: Date) => {
        if (isFutureDay(selectedDate)) return;

        // Keep current time, only replace calendar date.
        const updatedDate = new Date(currentDate);
        updatedDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        setCurrentDate(updatedDate);
        setCalendarMonth(new Date(updatedDate.getFullYear(), updatedDate.getMonth(), 1));
        onDateChange?.(updatedDate);
    };

    const goToMonth = (offset: number) => {
        setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const quickDateOptions = useMemo(() => {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const daysInLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
        lastMonth.setDate(Math.min(today.getDate(), daysInLastMonth));
        return [
            { key: 'yesterday', label: 'Yesterday', date: yesterday },
            { key: 'lastweek', label: 'Last Week', date: lastWeek },
            { key: 'lastmonth', label: 'Last Month', date: lastMonth },
        ];
    }, [today]);

    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        const mondayBasedOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0

        const startDate = new Date(year, month, 1 - mondayBasedOffset);
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            return {
                key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
                date: d,
                inCurrentMonth: d.getMonth() === month,
            };
        });
    }, [calendarMonth]);

    const currentMonthStart = useMemo(
        () => new Date(todayStart.getFullYear(), todayStart.getMonth(), 1),
        [todayStart]
    );
    const canGoToNextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getTime() < currentMonthStart.getTime();

    const handleCategoryAdded = (newCategory: Category) => {
        setCategories(prev => [...prev, newCategory]);
        onCategorySelect(newCategory);
    };

    const handleDeletePress = () => {
        if (onDelete && transaction) {
            onDelete(transaction);
        }
    };

    if (!transaction) return null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <BlurView intensity={20} className="flex-1 justify-end">
                <View
                    className="bg-white dark:bg-[#0f172a] rounded-t-[32px] h-[90%] border-t border-gray-200 dark:border-slate-700 shadow-2xl overflow-hidden"
                    style={{ paddingBottom: insets.bottom }}
                >
                    <View className="p-6 border-b border-gray-200 dark:border-slate-800 flex-row justify-between items-center">
                        <View className="flex-1 pr-4">
                            <Text className="text-slate-500 color-[#1e293b] dark:text-slate-300 font-bold text-[14px] mt-3 text-center">
                                {transaction.recipientName} • KES {transaction.amount.toLocaleString()}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="p-2 -mr-2 mt-[-10px] bg-gray-100 dark:bg-slate-800 rounded-full">
                            <Image
                                source={require('../assets/svg/close.svg')}
                                style={{ width: 14, height: 14 }}
                                contentFit="contain"
                                tintColor={colorScheme === 'dark' ? '#ffffffff' : '#1e293b'}
                            />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="flex-1 p-6">
                        {/* Date Editor */}
                        <View className="mb-8 bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                            <View className="flex-row items-center justify-between">
                                <Text className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">Change Transaction Date</Text>
                                <Text className="text-slate-400 text-xs">
                                    {currentDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowDatePicker(prev => !prev)}
                                className="bg-white dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-4 py-3 flex-row items-center justify-between"
                            >
                                <View className="flex-row items-center">
                                    <FontAwesome name="calendar" size={14} color="#64748b" />
                                    <Text className="text-slate-900 dark:text-white font-bold text-base ml-2">
                                        {currentDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                </View>
                                <FontAwesome name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={12} color="#64748b" />
                            </TouchableOpacity>
                            {showDatePicker && (
                                <View className="mt-1 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                                    <View className="flex-row gap-2 mb-3">
                                        {quickDateOptions.map(option => {
                                            const active = sameDay(currentDate, option.date);
                                            return (
                                                <TouchableOpacity
                                                    key={option.key}
                                                    onPress={() => applyDate(option.date)}
                                                    className={`flex-1 px-2 py-2 rounded-xl border ${active
                                                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                                                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                                        }`}
                                                >
                                                    <Text className={`text-center text-[11px] font-bold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-300'}`}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <View className="flex-row items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-xl px-2 py-2 mb-3">
                                        <TouchableOpacity
                                            onPress={() => goToMonth(-1)}
                                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 items-center justify-center"
                                        >
                                            <FontAwesome name="chevron-left" size={12} color="#64748b" />
                                        </TouchableOpacity>
                                        <Text className="font-black text-slate-800 dark:text-white">
                                            {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => goToMonth(1)}
                                            disabled={!canGoToNextMonth}
                                            className={`w-8 h-8 rounded-lg border items-center justify-center ${canGoToNextMonth
                                                ? 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'
                                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-40'
                                                }`}
                                        >
                                            <FontAwesome name="chevron-right" size={12} color="#64748b" />
                                        </TouchableOpacity>
                                    </View>

                                    <View className="flex-row mb-1">
                                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
                                            <Text key={label} className="flex-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                                                {label}
                                            </Text>
                                        ))}
                                    </View>

                                    <View className="flex-row flex-wrap">
                                        {calendarDays.map((day) => {
                                            const isSelected = sameDay(day.date, currentDate);
                                            const isToday = sameDay(day.date, todayStart);
                                            const isFuture = isFutureDay(day.date);
                                            return (
                                                <View key={day.key} className="w-[14.285%] items-center py-1">
                                                    <TouchableOpacity
                                                        disabled={isFuture}
                                                        onPress={() => applyDate(day.date)}
                                                        className={`w-8 h-8 rounded-[10px] items-center justify-center ${isSelected
                                                            ? 'bg-blue-600'
                                                            : isToday
                                                                ? 'border border-blue-300 dark:border-blue-700'
                                                                : ''
                                                            }`}
                                                    >
                                                        <Text className={`font-bold text-[12px] ${isSelected
                                                            ? 'text-white'
                                                            : isFuture
                                                                ? 'text-slate-300 dark:text-slate-600'
                                                            : day.inCurrentMonth
                                                                ? 'text-slate-600 dark:text-slate-300'
                                                                : 'text-slate-300 dark:text-slate-600'
                                                            }`}>
                                                            {day.date.getDate()}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}
                        </View>
                        <Text className="text-slate-500 dark:text-slate-300 font-medium text-[14px] mb-4">
                            {transaction.type === 'RECEIVED' ? 'What type of income is this?' : 'What type of expense is this?'}
                        </Text>

                        <View className="flex-row flex-wrap justify-between gap-y-3">
                            {categories
                                .filter(c => c.id !== 12 && (transaction.type === 'RECEIVED' ? c.type === 'INCOME' : c.type === 'EXPENSE'))
                                .map(category => (
                                    <TouchableOpacity
                                        key={category.id}
                                        onPress={() => onCategorySelect(category)}
                                        className="w-[48%] px-4 py-2 rounded-[12px] border bg-gray-50 dark:bg-[#1e293b] border-gray-200 dark:border-slate-700 flex-row items-center active:bg-blue-50 dark:active:bg-blue-600/10 active:border-blue-500"
                                    >
                                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${category.color}20` }}>
                                            <FontAwesome name={category.icon as any} size={16} color={category.color} />
                                        </View>
                                        <Text className="text-slate-900 dark:text-white font-medium flex-1" numberOfLines={1}>{category.name}</Text>
                                    </TouchableOpacity>
                                ))}

                            {/* Add New Category Button */}
                            <TouchableOpacity
                                onPress={() => setShowAddCategory(true)}
                                className="w-[48%] px-4 py-2 rounded-[12px] border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 flex-row items-center active:bg-blue-100 dark:active:bg-blue-900/40"
                            >
                                <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-blue-100 dark:bg-blue-800">
                                    <Image
                                        source={require('../assets/svg/plus.svg')}
                                        style={{ width: 14, height: 14 }}
                                        contentFit="contain"
                                        tintColor={colorScheme === 'dark' ? '#ffffffff' : '#002db6ff'}
                                    />
                                </View>
                                <Text className="text-blue-700 dark:text-blue-300 font-medium flex-1">Add Category</Text>
                            </TouchableOpacity>
                            {/* End Add New Category Button */}
                        </View>

                        <View className="flex-row gap-x-3 mt-8 mb-4">
                            {/* Link to Savings Button (expenses only) */}
                            {transaction.type === 'SENT' && (
                                <TouchableOpacity
                                    onPress={() => onLinkToGoal?.(transaction)}
                                    className="flex-1 bg-purple-50 dark:bg-purple-900/20 py-2 px-4 rounded-xl items-center border border-purple-100 dark:border-purple-900/50 flex-row justify-center gap-2"
                                >
                                    <Image
                                        source={require('../assets/svg/savings-piggy.svg')}
                                        style={{ width: 22, height: 22 }}
                                        tintColor={'#8b5cf6'}
                                        contentFit="contain"
                                    />
                                    <Text className="text-purple-600 dark:text-purple-400 font-semibold text-xs text-center">Move to Savings</Text>
                                </TouchableOpacity>
                            )}

                            {/* Link to Income Source (income only) */}
                            {transaction.type === 'RECEIVED' && (
                                <TouchableOpacity
                                    onPress={() => onLinkToIncome?.(transaction)}
                                    className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 py-2 px-4 rounded-xl items-center border border-emerald-100 dark:border-emerald-900/50 flex-row justify-center gap-2"
                                >
                                    <Image
                                        source={require('../assets/svg/income.svg')}
                                        style={{ width: 20, height: 20 }}
                                        tintColor={'#10b981'}
                                        contentFit="contain"
                                    />
                                    <Text className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs text-center">Link Income</Text>
                                </TouchableOpacity>
                            )}

                            {/* Delete Button */}
                            <TouchableOpacity
                                onPress={handleDeletePress}
                                className="flex-1 bg-red-50 dark:bg-red-900/20 py-2 px-4 rounded-xl items-center border border-red-100 dark:border-red-900/50 justify-center"
                            >
                                <Text className="text-red-600 dark:text-red-400 font-semibold text-xs">Delete</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="h-10" />
                    </ScrollView>
                </View>
            </BlurView>

            <AddCategoryModal
                visible={showAddCategory}
                onClose={() => setShowAddCategory(false)}
                onCategoryAdded={handleCategoryAdded}
                defaultType={transaction.type === 'RECEIVED' ? 'INCOME' : 'EXPENSE'}
            />
        </Modal>
    );
}
