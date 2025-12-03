import { FontAwesome } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addCategory } from '../services/database';
import { Category } from '../types/transaction';

// Available icons for selection
export const AVAILABLE_ICONS = [
    'shopping-bag', 'cutlery', 'bus', 'film', 'bolt', 'heartbeat', 'graduation-cap', 'smile-o',
    'money', 'briefcase', 'gift', 'warning', 'home', 'tint', 'wifi', 'wrench', 'users',
    'car', 'shopping-basket', 'medkit', 'plane', 'bank', 'question', 'coffee', 'gamepad',
    'music', 'book', 'paw', 'tree', 'umbrella'
];

// Available colors
export const AVAILABLE_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#64748b'
];

interface AddCategoryModalProps {
    visible: boolean;
    onClose: () => void;
    onCategoryAdded: (category: Category) => void;
    defaultType?: 'INCOME' | 'EXPENSE';
}

export default function AddCategoryModal({ visible, onClose, onCategoryAdded, defaultType = 'EXPENSE' }: AddCategoryModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'INCOME' | 'EXPENSE'>(defaultType);
    const [selectedIcon, setSelectedIcon] = useState('question');
    const [selectedColor, setSelectedColor] = useState('#94a3b8');

    // Reset form when opening/changing defaultType
    useEffect(() => {
        if (visible) {
            setType(defaultType);
            setName('');
            setDescription('');
            setSelectedIcon('question');
            setSelectedColor('#94a3b8');
        }
    }, [visible, defaultType]);

    const handleAddCategory = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a category name');
            return;
        }

        try {
            const categoryData = {
                name: name.trim(),
                type,
                icon: selectedIcon,
                color: selectedColor,
                description: description.trim(),
                isCustom: true
            };

            const id = await addCategory(categoryData);

            const newCategory: Category = {
                id: id,
                ...categoryData
            };

            onCategoryAdded(newCategory);
            onClose();
        } catch (error) {
            console.error('Error adding category:', error);
            Alert.alert('Error', 'Failed to add category');
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white dark:bg-[#1e293b] rounded-t-[32px] p-6 h-[85%]">
                    <View className="flex-row justify-between items-center mb-6">
                        <Text className="text-slate-900 dark:text-white text-xl font-bold">New Category</Text>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full">
                            <FontAwesome name="close" size={20} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                        {/* Type Selection */}
                        <View className="flex-row gap-4 mb-6">
                            <TouchableOpacity
                                onPress={() => setType('EXPENSE')}
                                className={`flex-1 p-4 rounded-xl border ${type === 'EXPENSE' ? 'bg-red-50 dark:bg-red-900/20 border-red-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                            >
                                <Text className={`text-center font-bold ${type === 'EXPENSE' ? 'text-red-500' : 'text-slate-500'}`}>Expense</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setType('INCOME')}
                                className={`flex-1 p-4 rounded-xl border ${type === 'INCOME' ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                            >
                                <Text className={`text-center font-bold ${type === 'INCOME' ? 'text-green-500' : 'text-slate-500'}`}>Income</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Name Input */}
                        <View className="mb-6">
                            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Category Name</Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g., Freelance, Gym, Netflix"
                                placeholderTextColor="#94a3b8"
                                className="bg-gray-50 dark:bg-slate-800 p-4 rounded-xl text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                            />
                        </View>

                        {/* Description Input */}
                        <View className="mb-6">
                            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Description (Optional)</Text>
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Short description..."
                                placeholderTextColor="#94a3b8"
                                className="bg-gray-50 dark:bg-slate-800 p-4 rounded-xl text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                            />
                        </View>

                        {/* Icon Selection */}
                        <View className="mb-6">
                            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Select Icon</Text>
                            <View className="flex-row flex-wrap gap-3">
                                {AVAILABLE_ICONS.map((icon) => (
                                    <TouchableOpacity
                                        key={icon}
                                        onPress={() => setSelectedIcon(icon)}
                                        className={`w-12 h-12 rounded-xl items-center justify-center border ${selectedIcon === icon ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                                    >
                                        <FontAwesome name={icon as any} size={20} color={selectedIcon === icon ? '#3b82f6' : '#94a3b8'} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Color Selection */}
                        <View className="mb-8">
                            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Select Color</Text>
                            <View className="flex-row flex-wrap gap-3">
                                {AVAILABLE_COLORS.map((color) => (
                                    <TouchableOpacity
                                        key={color}
                                        onPress={() => setSelectedColor(color)}
                                        className={`w-10 h-10 rounded-full border-2 ${selectedColor === color ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            onPress={handleAddCategory}
                            className="bg-blue-600 p-4 rounded-2xl mb-8 shadow-lg shadow-blue-500/30"
                        >
                            <Text className="text-white text-center font-bold text-lg">Create Category</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
