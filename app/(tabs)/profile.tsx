import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../services/AuthContext';
import { addCategory, deleteCategory, getCategories } from '../../services/database';
import { Category } from '../../types/transaction';

// Available icons for selection
const AVAILABLE_ICONS = [
    'shopping-bag', 'cutlery', 'bus', 'film', 'bolt', 'heartbeat', 'graduation-cap', 'smile-o',
    'money', 'briefcase', 'gift', 'warning', 'home', 'tint', 'wifi', 'wrench', 'users',
    'car', 'shopping-basket', 'medkit', 'plane', 'bank', 'question', 'coffee', 'gamepad',
    'music', 'book', 'paw', 'tree', 'umbrella'
];

// Available colors
const AVAILABLE_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#64748b'
];

export default function ProfileScreen() {
    const { signOut, user, phoneNumber, updateUserProfile } = useAuth();
    const { colorScheme, toggleColorScheme } = useColorScheme();

    const [categories, setCategories] = useState<Category[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editProfileVisible, setEditProfileVisible] = useState(false);

    // Category Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [selectedIcon, setSelectedIcon] = useState('question');
    const [selectedColor, setSelectedColor] = useState('#94a3b8');

    // Profile Edit State
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editImage, setEditImage] = useState<string | null>(null);

    useEffect(() => {
        loadCategories();
    }, []);

    // Initialize edit form when opening modal
    useEffect(() => {
        if (editProfileVisible) {
            setEditName(user?.displayName || '');
            setEditPhone(phoneNumber || '');
            setEditImage(user?.photoURL || null);
        }
    }, [editProfileVisible, user, phoneNumber]);

    const loadCategories = async () => {
        const cats = await getCategories();
        setCategories(cats);
    };

    const handleAddCategory = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a category name');
            return;
        }

        try {
            await addCategory({
                name: name.trim(),
                type,
                icon: selectedIcon,
                color: selectedColor,
                description: description.trim(),
                isCustom: true
            });

            // Reset form
            setName('');
            setDescription('');
            setType('EXPENSE');
            setSelectedIcon('question');
            setSelectedColor('#94a3b8');
            setModalVisible(false);

            // Reload categories
            await loadCategories();
            Alert.alert('Success', 'Category added successfully');
        } catch (error) {
            console.error('Error adding category:', error);
            Alert.alert('Error', 'Failed to add category');
        }
    };

    const handleDeleteCategory = (id: number) => {
        Alert.alert(
            'Delete Category',
            'Are you sure you want to delete this category?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCategory(id);
                            await loadCategories();
                        } catch (error) {
                            console.error('Error deleting category:', error);
                            Alert.alert('Error', 'Failed to delete category');
                        }
                    }
                }
            ]
        );
    };

    const handleUpdateProfile = async () => {
        if (!editName.trim()) {
            Alert.alert('Error', 'Name cannot be empty');
            return;
        }

        try {
            await updateUserProfile({
                displayName: editName.trim(),
                phoneNumber: editPhone.trim(),
                photoURL: editImage || undefined
            });
            setEditProfileVisible(false);
            Alert.alert('Success', 'Profile updated successfully');
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile');
        }
    };

    const handlePickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission Required', 'Permission to access camera roll is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setEditImage(result.assets[0].uri);
        }
    };

    const handleTakePhoto = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission Required', 'Permission to access camera is required!');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setEditImage(result.assets[0].uri);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: signOut
                },
            ]
        );
    };

    return (
        <ScrollView className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            {/* Header with user info */}
            <View className="px-6 pt-16 pb-12 items-center bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg">
                <View className="w-24 h-24 bg-gray-100 dark:bg-[#1e293b] rounded-full items-center justify-center mb-4 shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {user?.photoURL ? (
                        <Image source={{ uri: user.photoURL }} className="w-full h-full" />
                    ) : (
                        <Text className="text-4xl text-slate-800 dark:text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                    )}
                </View>
                <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{user?.displayName || 'User'}</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-sm mb-1">{user?.email}</Text>
                {phoneNumber && <Text className="text-slate-400 dark:text-slate-500 text-xs">{phoneNumber}</Text>}
            </View>

            {/* Profile Options List */}
            <View className="px-6 mt-8">
                <View className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {/* Dark Mode Toggle */}
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700">
                                <FontAwesome name={colorScheme === 'dark' ? 'moon-o' : 'sun-o'} size={18} color={colorScheme === 'dark' ? '#8b5cf6' : '#f59e0b'} />
                            </View>
                            <Text className="text-slate-800 dark:text-white font-semibold text-base">Dark Mode</Text>
                        </View>
                        <Switch
                            value={colorScheme === 'dark'}
                            onValueChange={toggleColorScheme}
                            trackColor={{ false: '#e2e8f0', true: '#8b5cf6' }}
                            thumbColor={'#ffffff'}
                        />
                    </View>

                    {[
                        { icon: 'user', label: 'Edit Profile', color: '#3b82f6', action: () => setEditProfileVisible(true) },
                        { icon: 'bell', label: 'Notifications', color: '#8b5cf6' },
                        { icon: 'shield', label: 'Privacy & Security', color: '#10b981' },
                        { icon: 'question-circle', label: 'Help & Support', color: '#f59e0b' },
                    ].map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            onPress={item.action ? item.action : undefined}
                            className={`flex-row items-center p-4 ${index !== 3 ? 'border-b border-gray-100 dark:border-slate-700' : ''}`}
                        >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700">
                                <FontAwesome name={item.icon as any} size={18} color={item.color} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-slate-800 dark:text-white font-semibold text-base">{item.label}</Text>
                            </View>
                            <FontAwesome name={item.icon === 'question-circle' ? 'question-circle' : 'angle-right'} size={20} color="#94a3b8" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Manage Categories Section */}
                <View className="mt-8">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-slate-900 dark:text-white text-lg font-bold">Custom Categories</Text>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            className="bg-blue-500 px-3 py-1.5 rounded-full"
                        >
                            <Text className="text-white text-xs font-bold">+ Add New</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden p-4">
                        {categories.filter(c => c.isCustom).length === 0 ? (
                            <Text className="text-slate-500 dark:text-slate-400 text-center py-4">No custom categories yet</Text>
                        ) : (
                            <View className="gap-3">
                                {categories.filter(c => c.isCustom).map((cat) => (
                                    <View key={cat.id} className="flex-row items-center justify-between bg-gray-50 dark:bg-[#0f172a] p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                                        <View className="flex-row items-center flex-1">
                                            <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${cat.color}20` }}>
                                                <FontAwesome name={cat.icon as any} size={16} color={cat.color} />
                                            </View>
                                            <View className="flex-1">
                                                <Text className="text-slate-900 dark:text-white font-semibold">{cat.name}</Text>
                                                <Text className="text-slate-500 dark:text-slate-400 text-xs">{cat.type} • {cat.description || 'No description'}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => handleDeleteCategory(cat.id)}
                                            className="p-2"
                                        >
                                            <FontAwesome name="trash" size={16} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>

                {/* Add Category Modal */}
                <Modal
                    visible={modalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setModalVisible(false)}
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white dark:bg-[#1e293b] rounded-t-[32px] p-6 h-[85%]">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-slate-900 dark:text-white text-xl font-bold">New Category</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full">
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

                {/* Edit Profile Modal */}
                <Modal
                    visible={editProfileVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setEditProfileVisible(false)}
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white dark:bg-[#1e293b] rounded-t-[32px] p-6 h-[85%]">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-slate-900 dark:text-white text-xl font-bold">Edit Profile</Text>
                                <TouchableOpacity onPress={() => setEditProfileVisible(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full">
                                    <FontAwesome name="close" size={20} color="#64748b" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                                {/* Profile Image */}
                                <View className="items-center mb-8">
                                    <View className="w-32 h-32 bg-gray-100 dark:bg-[#0f172a] rounded-full items-center justify-center mb-4 shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                                        {editImage ? (
                                            <Image source={{ uri: editImage }} className="w-full h-full" />
                                        ) : (
                                            <Text className="text-5xl text-slate-800 dark:text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                                        )}
                                    </View>
                                    <View className="flex-row gap-4">
                                        <TouchableOpacity
                                            onPress={handleTakePhoto}
                                            className="bg-blue-500 px-4 py-2 rounded-full flex-row items-center"
                                        >
                                            <FontAwesome name="camera" size={14} color="white" />
                                            <Text className="text-white font-bold ml-2">Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handlePickImage}
                                            className="bg-purple-500 px-4 py-2 rounded-full flex-row items-center"
                                        >
                                            <FontAwesome name="image" size={14} color="white" />
                                            <Text className="text-white font-bold ml-2">Gallery</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Name Input */}
                                <View className="mb-6">
                                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Full Name</Text>
                                    <TextInput
                                        value={editName}
                                        onChangeText={setEditName}
                                        placeholder="Enter your name"
                                        placeholderTextColor="#94a3b8"
                                        className="bg-gray-50 dark:bg-slate-800 p-4 rounded-xl text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                                    />
                                </View>

                                {/* Phone Input */}
                                <View className="mb-6">
                                    <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Phone Number</Text>
                                    <TextInput
                                        value={editPhone}
                                        onChangeText={setEditPhone}
                                        placeholder="e.g., +254 712 345 678"
                                        placeholderTextColor="#94a3b8"
                                        keyboardType="phone-pad"
                                        className="bg-gray-50 dark:bg-slate-800 p-4 rounded-xl text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                                    />
                                </View>

                                {/* Save Button */}
                                <TouchableOpacity
                                    onPress={handleUpdateProfile}
                                    className="bg-blue-600 p-4 rounded-2xl mb-8 shadow-lg shadow-blue-500/30"
                                >
                                    <Text className="text-white text-center font-bold text-lg">Save Changes</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {/* Sign Out Button */}
                <TouchableOpacity
                    onPress={handleSignOut}
                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-2xl p-4 mt-8 mb-8 flex-row items-center justify-center"
                >
                    <FontAwesome name="sign-out" size={20} color="#ef4444" />
                    <Text className="text-red-500 font-bold text-base ml-2">Sign Out</Text>
                </TouchableOpacity>

                <Text className="text-center text-slate-400 dark:text-slate-600 text-xs mb-8">Version 1.0.0</Text>
            </View>
        </ScrollView>
    );
}
