import { FontAwesome } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getCategories } from '../services/database';
import { Category, Transaction } from '../types/transaction';

interface CategorizationModalProps {
    visible: boolean;
    transaction: Transaction | null;
    onCategorySelect: (categoryId: number) => void;
    onClose: () => void;
}

export default function CategorizationModal({ visible, transaction, onCategorySelect, onClose }: CategorizationModalProps) {
    const [categories, setCategories] = useState<Category[]>([]);

    useEffect(() => {
        if (visible) {
            loadCategories();
        }
    }, [visible]);

    const loadCategories = async () => {
        try {
            const cats = await getCategories();
            setCategories(cats);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    if (!transaction) return null;

    return (
        <Modal visible={visible} transparent animationType="slide">
            <BlurView intensity={20} className="flex-1 justify-end">
                <View className="bg-[#0f172a] rounded-t-[32px] h-[75%] border-t border-slate-700 shadow-2xl">
                    <View className="p-6 border-b border-slate-800 flex-row justify-between items-center">
                        <View>
                            <Text className="text-white text-xl font-bold text-center mb-2">
                                {transaction?.categoryId ? 'Edit Category' : 'What was this for?'}
                            </Text>
                            <Text className="text-slate-400 text-sm mt-1">
                                {transaction.recipientName} • KES {transaction.amount.toLocaleString()}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="w-10 h-10 bg-slate-800 rounded-full items-center justify-center">
                            <FontAwesome name="close" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="flex-1 p-6">
                        <Text className="text-slate-300 mb-4 font-medium">
                            {transaction.type === 'RECEIVED' ? 'What type of income?' : 'What was this for?'}
                        </Text>

                        <View className="flex-row flex-wrap justify-between gap-y-3">
                            {categories
                                .filter(c => transaction.type === 'RECEIVED' ? c.type === 'INCOME' : c.type === 'EXPENSE')
                                .map(category => (
                                    <TouchableOpacity
                                        key={category.id}
                                        onPress={() => onCategorySelect(category.id)}
                                        className="w-[48%] p-4 rounded-2xl border bg-[#1e293b] border-slate-700 flex-row items-center active:bg-blue-600/10 active:border-blue-500"
                                    >
                                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${category.color}20` }}>
                                            <FontAwesome name={category.icon as any} size={18} color={category.color} />
                                        </View>
                                        <Text className="text-white font-medium flex-1" numberOfLines={1}>{category.name}</Text>
                                    </TouchableOpacity>
                                ))}
                        </View>
                        <View className="h-10" />
                    </ScrollView>
                </View>
            </BlurView >
        </Modal >
    );
}
