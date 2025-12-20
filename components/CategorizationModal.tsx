import { FontAwesome } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
    onClose: () => void;
}

export default function CategorizationModal({ visible, transaction, onCategorySelect, onDateChange, onDelete, onClose }: CategorizationModalProps) {
    const { colorScheme } = useColorScheme();
    const [categories, setCategories] = useState<Category[]>([]);
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const insets = useSafeAreaInsets();
    const [showAddCategory, setShowAddCategory] = useState(false);

    useEffect(() => {
        if (visible) {
            loadCategories();
            if (transaction) {
                setCurrentDate(new Date(transaction.date));
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

    const handleDateChange = (days: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
    };

    const handleCategoryAdded = (newCategory: Category) => {
        setCategories(prev => [...prev, newCategory]);
        onCategorySelect(newCategory);
    };

    const handleDeletePress = () => {
        Alert.alert(
            "Delete Transaction",
            "Are you sure you want to delete this transaction? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => onDelete && onDelete(transaction!)
                }
            ]
        );
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
                                style={{ width: 16, height: 16 }}
                                contentFit="contain"
                                tintColor={colorScheme === 'dark' ? '#ffffffff' : '#1e293b'}
                            />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="flex-1 p-6">
                        {/* Date Editor */}
                        <View className="mb-8 bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                            <Text className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">Transaction Date</Text>
                            <View className="flex-row items-center justify-between">
                                <TouchableOpacity
                                    onPress={() => handleDateChange(-1)}
                                    className="w-10 h-10 bg-white dark:bg-slate-700 rounded-full items-center justify-center border border-gray-200 dark:border-slate-600 shadow-sm"
                                >
                                    <FontAwesome name="chevron-left" size={14} color="#64748b" />
                                </TouchableOpacity>

                                <View className="items-center">
                                    <Text className="text-slate-900 dark:text-white font-bold text-lg">
                                        {currentDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                    <Text className="text-slate-400 text-xs">
                                        {currentDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => handleDateChange(1)}
                                    className="w-10 h-10 bg-white dark:bg-slate-700 rounded-full items-center justify-center border border-gray-200 dark:border-slate-600 shadow-sm"
                                >
                                    <FontAwesome name="chevron-right" size={14} color="#64748b" />
                                </TouchableOpacity>
                            </View>

                            {/* Save Date Button - Only show if date changed */}
                            {transaction.date.toDateString() !== currentDate.toDateString() && (
                                <TouchableOpacity
                                    onPress={() => onDateChange && onDateChange(currentDate)}
                                    className="mt-4 bg-blue-600 py-3 rounded-xl items-center shadow-lg shadow-blue-500/30"
                                >
                                    <Text className="text-white font-bold">Update Date</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <Text className="text-slate-500 dark:text-slate-300 font-medium">
                            {transaction.type === 'RECEIVED' ? 'What type of income is this?' : 'What type of expense is this?'}
                        </Text>
                        <Text className="text-slate-500 color-[green] dark:text-slate-300 text-[11px] mb-4 text-left">
                            Categorize this transaction, you only need to do it once
                        </Text>

                        <View className="flex-row flex-wrap justify-between gap-y-3">
                            {/* Add New Category Button */}
                            <TouchableOpacity
                                onPress={() => setShowAddCategory(true)}
                                className="w-[48%] p-4 rounded-2xl border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 flex-row items-center active:bg-blue-100 dark:active:bg-blue-900/40"
                            >
                                <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-blue-100 dark:bg-blue-800">
                                    <FontAwesome name="plus" size={18} color="#3b82f6" />
                                </View>
                                <Text className="text-blue-700 dark:text-blue-300 font-medium flex-1">New Category</Text>
                            </TouchableOpacity>

                            {categories
                                .filter(c => transaction.type === 'RECEIVED' ? c.type === 'INCOME' : c.type === 'EXPENSE')
                                .map(category => (
                                    <TouchableOpacity
                                        key={category.id}
                                        onPress={() => onCategorySelect(category)}
                                        className="w-[48%] p-4 rounded-2xl border bg-gray-50 dark:bg-[#1e293b] border-gray-200 dark:border-slate-700 flex-row items-center active:bg-blue-50 dark:active:bg-blue-600/10 active:border-blue-500"
                                    >
                                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${category.color}20` }}>
                                            <FontAwesome name={category.icon as any} size={18} color={category.color} />
                                        </View>
                                        <Text className="text-slate-900 dark:text-white font-medium flex-1" numberOfLines={1}>{category.name}</Text>
                                    </TouchableOpacity>
                                ))}
                        </View>

                        {/* Delete Button */}
                        <TouchableOpacity
                            onPress={handleDeletePress}
                            className="mt-8 mb-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl items-center border border-red-100 dark:border-red-900/50"
                        >
                            <Text className="text-red-600 dark:text-red-400 font-semibold">Delete Transaction</Text>
                        </TouchableOpacity>

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
