import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image as ExpoImage, Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import AddCategoryModal from '../../components/AddCategoryModal';
import { useAuth } from '../../services/AuthContext';
import { deleteCategory, getCategories, getUserSettings, initDatabase, saveUserSettings } from '../../services/database';
import { exportFinancialSpreadsheet, ExportPeriod } from '../../services/exportService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { Category } from '../../types/transaction';

const EXPORT_PERIOD_OPTIONS: { key: ExportPeriod; label: string; description: string }[] = [
    { key: 'THIS_MONTH', label: 'This Month', description: 'Current month only' },
    { key: 'LAST_MONTH', label: 'Last Month', description: 'Previous full month' },
    { key: 'LAST_3_MONTHS', label: 'Last 3 Months', description: 'Current month + previous 2' },
    { key: 'CURRENT_YEAR', label: 'Current Year', description: 'From January to today' },
    { key: 'ALL_TIME', label: 'All Time', description: 'Everything in the app' },
];

const periodLabel = (period: ExportPeriod): string =>
    EXPORT_PERIOD_OPTIONS.find((p) => p.key === period)?.label || 'All Time';

export default function ProfileScreen() {
    const { signOut, user, phoneNumber, updateUserProfile } = useAuth();
    const { colorScheme, toggleColorScheme } = useColorScheme();
    const router = useRouter();

    const { showTabBar, hideTabBar } = useScrollVisibility();
    const lastScrollY = useSharedValue(0);

    const handleScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            const currentY = event.contentOffset.y;
            const diff = currentY - lastScrollY.value;

            if (currentY <= 0) {
                hideTabBar();
            } else if (diff > 5) {
                showTabBar();
            }
            lastScrollY.value = currentY;
        },
    });

    const [categories, setCategories] = useState<Category[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Profile Edit State
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editImage, setEditImage] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Settings State
    const [financialMonthStart, setFinancialMonthStart] = useState(1);
    const [smsParseStartDate, setSmsParseStartDate] = useState<Date | null>(null);
    const [dayPickerVisible, setDayPickerVisible] = useState(false);
    const [showSmsDatePicker, setShowSmsDatePicker] = useState(false);
    const [isThemeSwitching, setIsThemeSwitching] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [exportPeriodModalVisible, setExportPeriodModalVisible] = useState(false);
    const [selectedExportPeriod, setSelectedExportPeriod] = useState<ExportPeriod>('THIS_MONTH');
    const themeToggleLockRef = useRef(false);

    const handleToggleTheme = useCallback(() => {
        if (themeToggleLockRef.current || isThemeSwitching) return;
        themeToggleLockRef.current = true;
        setIsThemeSwitching(true);
        toggleColorScheme();
        setTimeout(() => {
            themeToggleLockRef.current = false;
            setIsThemeSwitching(false);
        }, 250);
    }, [isThemeSwitching, toggleColorScheme]);

    // Load categories when screen is focused
    useFocusEffect(
        React.useCallback(() => {
            const task = InteractionManager.runAfterInteractions(() => {
                loadCategories();
                loadSettings();
            });
            return () => task.cancel();
        }, [])
    );

    const loadSettings = async () => {
        const startDay = await getUserSettings('financial_month_start_day');
        if (startDay) setFinancialMonthStart(parseInt(startDay, 10));

        const smsDate = await getUserSettings('sms_parse_start_date');
        if (smsDate) setSmsParseStartDate(new Date(smsDate));
    };

    // Initialize edit form when opening modal
    useEffect(() => {
        if (editProfileVisible) {
            setEditName(user?.displayName || '');
            setEditPhone(phoneNumber || '');
            setEditImage(user?.photoURL || null);
        }
    }, [editProfileVisible, user, phoneNumber]);

    const loadCategories = async () => {
        await initDatabase();
        const cats = await getCategories();
        setCategories(cats);
    };

    const handleCategoryAdded = async (newCategory: Category) => {
        await loadCategories();
        Alert.alert('Success', 'Category added successfully');
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadCategories();
            // Could add other reloads here if user data refreshes manually
        } finally {
            setRefreshing(false);
        }
    }, []);

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
            setIsUpdating(true);
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
        } finally {
            setIsUpdating(false);
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

    const handleExportExcel = async () => {
        if (isExportingExcel) return;
        try {
            setIsExportingExcel(true);
            const fileUri = await exportFinancialSpreadsheet(selectedExportPeriod);

            Alert.alert(
                'Export Complete',
                `Excel (.xlsx) export completed.\n\nPeriod: ${periodLabel(selectedExportPeriod)}\nFile:\n${fileUri}`
            );
        } catch (error: any) {
            console.error('Export failed:', error);
            Alert.alert('Export Failed', error?.message || 'Could not export Excel file.');
        } finally {
            setIsExportingExcel(false);
        }
    };

    const handleOpenExportModal = () => {
        if (isExportingExcel) return;
        setExportPeriodModalVisible(true);
    };

    const handleConfirmExport = async () => {
        setExportPeriodModalVisible(false);
        await handleExportExcel();
    };

    return (
        <Animated.ScrollView
            className="flex-1 app-screen"
            contentContainerStyle={{ paddingBottom: 120 }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
        >
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            {/* Header with user info */}
            <View className="px-4 pt-16 pb-12 items-center bg-white dark:bg-[#0f172a] rounded-b-[16px] border-b border-gray-200 dark:border-slate-800">
                <View className="w-24 h-24 bg-gray-50 dark:bg-[#1e293b] rounded-full items-center justify-center mb-4 border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {user?.photoURL ? (
                        <Image source={{ uri: user.photoURL }} className="w-full h-full" style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                        <Text className="text-4xl text-slate-800 dark:text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                    )}
                </View>
                <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{user?.displayName || 'User'}</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-sm mb-1">{user?.email}</Text>
                {phoneNumber && <Text className="text-slate-400 dark:text-slate-500 text-xs">{phoneNumber}</Text>}
            </View>

            {/* Profile Options List */}
            <View className="mx-4 mt-8">
                <View className="app-card overflow-hidden">
                    {/* Dark Mode Toggle */}
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
                        <TouchableOpacity
                            onPress={handleToggleTheme}
                            disabled={isThemeSwitching}
                            activeOpacity={0.8}
                            className="flex-row items-center flex-1"
                        >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700">
                                <FontAwesome name={colorScheme === 'dark' ? 'moon-o' : 'sun-o'} size={18} color={colorScheme === 'dark' ? '#8b5cf6' : '#f59e0b'} />
                            </View>
                            <Text className="text-slate-800 dark:text-white font-semibold text-base">Dark Mode</Text>
                        </TouchableOpacity>
                        <Switch
                            value={colorScheme === 'dark'}
                            onValueChange={handleToggleTheme}
                            disabled={isThemeSwitching}
                            trackColor={{ false: '#e2e8f0', true: '#8b5cf6' }}
                            thumbColor={'#ffffff'}
                        />
                    </View>

                    <View className="p-3">
                        <View className="flex-row flex-wrap justify-between">
                            {[
                                { icon: require('../../assets/svg/income.svg'), label: 'Manage My Income', color: '#10b981', action: () => router.push('/(tabs)/income') },
                                { icon: require('../../assets/svg/budget.svg'), label: 'Monthly Budget', color: '#10b981', action: () => router.push('/budget') },
                                { icon: require('../../assets/svg/bank.svg'), label: 'Manage My Banks', color: '#2563eb', action: () => router.push('/banks') },
                                { icon: require('../../assets/svg/automation.svg'), label: 'Automation Rules', color: '#8b5cf6', action: () => router.push('/automation') },
                                {
                                    icon: require('../../assets/svg/privacy.svg'), label: 'Financial Month Start', color: '#f59e0b', action: () => setDayPickerVisible(true),
                                    value: `Day ${financialMonthStart}`
                                },
                                {
                                    icon: require('../../assets/svg/privacy.svg'), label: 'SMS Parse From', color: '#ec4899', action: () => setShowSmsDatePicker(true),
                                    value: smsParseStartDate ? smsParseStartDate.toLocaleDateString() : 'All Time'
                                },
                                {
                                    icon: require('../../assets/svg/graph.svg'),
                                    label: 'Export Excel',
                                    color: '#0ea5e9',
                                    action: handleOpenExportModal,
                                    value: isExportingExcel ? 'Generating export...' : `Period: ${periodLabel(selectedExportPeriod)}`,
                                    disabled: isExportingExcel,
                                },
                                { icon: require('../../assets/svg/my-profile.svg'), label: 'Edit Profile', color: '#3b82f6', action: () => setEditProfileVisible(true) },
                                { icon: require('../../assets/svg/privacy.svg'), label: 'Privacy & Security', color: '#64748b', action: () => router.push('/privacy-policy') },
                            ].map((item, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={item.action ? item.action : undefined}
                                    disabled={!!item.disabled}
                                    className="w-full flex-row items-center p-3 mb-2 rounded-[12px] bg-gray-50 dark:bg-[#0f172a] border border-gray-100/50 dark:border-slate-800/50"
                                >
                                    <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-slate-800">
                                        <Image
                                            source={item.icon as any}
                                            style={{ width: 18, height: 18 }}
                                            tintColor={item.color}
                                            contentFit="contain"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-slate-800 dark:text-white font-bold text-sm leading-4">{item.label}</Text>
                                        {item.value && <Text className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">{item.value}</Text>}
                                    </View>
                                    <FontAwesome name="angle-right" size={14} color="#94a3b8" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Manage Categories Section */}
                <View className="mt-8">
                    <View className="app-card p-4">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-slate-900 dark:text-white text-base font-bold">Custom Categories</Text>
                            <TouchableOpacity
                                onPress={() => setModalVisible(true)}
                                className="bg-blue-500 px-3 py-1.5 rounded-full"
                            >
                                <Text className="text-white text-xs font-bold">+ Add New</Text>
                            </TouchableOpacity>
                        </View>
                        {categories.filter(c => !!c.isCustom).length === 0 ? (
                            <Text className="text-slate-500 dark:text-slate-400 text-center py-4">No custom categories yet</Text>
                        ) : (
                            <View className="gap-3">
                                {categories.filter(c => !!c.isCustom).map((cat) => (
                                    <View key={cat.id} className="flex-row items-center justify-between bg-gray-50 dark:bg-[#0f172a] p-3 rounded-[12px] border border-gray-100/50 dark:border-slate-800/50">
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
                <AddCategoryModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    onCategoryAdded={handleCategoryAdded}
                />

                {/* Edit Profile Modal */}
                <Modal
                    visible={editProfileVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setEditProfileVisible(false)}
                >
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                    >
                        <View className="flex-1 justify-end bg-black/50">
                            <View className="bg-white dark:bg-[#1e293b] rounded-t-[16px] p-6 h-[85%]">
                                <View className="flex-row justify-between items-center mb-6">
                                    <Text className="text-slate-900 dark:text-white text-xl font-bold">Edit Profile</Text>
                                    <TouchableOpacity onPress={() => setEditProfileVisible(false)} className="p-2 -mr-2">
                                        <ExpoImage
                                            source={require('../../assets/svg/close.svg')}
                                            style={{ width: 20, height: 20 }}
                                            contentFit="contain"
                                            tintColor={colorScheme === 'dark' ? '#fff' : '#64748b'}
                                        />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView
                                    className="flex-1"
                                    showsVerticalScrollIndicator={false}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                                >
                                    {/* Profile Image */}
                                    <View className="items-center mb-8">
                                        <View className="w-32 h-32 bg-gray-100 dark:bg-[#0f172a] rounded-full items-center justify-center mb-4 border border-gray-200 dark:border-slate-700 overflow-hidden">
                                            {editImage ? (
                                                <Image source={{ uri: editImage }} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
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
                                            className="bg-gray-50 dark:bg-slate-800 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
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
                                            className="bg-gray-50 dark:bg-slate-800 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                                        />
                                    </View>

                                    {/* Save Button */}
                                    <TouchableOpacity
                                        onPress={handleUpdateProfile}
                                        disabled={isUpdating}
                                        className={`bg-blue-600 p-4 rounded-[12px] mb-8 ${isUpdating ? 'opacity-50' : ''}`}
                                    >
                                        {isUpdating ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text className="text-white text-center font-bold text-lg">Save Changes</Text>
                                        )}
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* Sign Out Button */}
                <TouchableOpacity
                    onPress={handleSignOut}
                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-[16px] p-4 mt-8 mb-8 flex-row items-center justify-center"
                >
                    <FontAwesome name="sign-out" size={20} color="#ef4444" />
                    <Text className="text-red-500 font-bold text-base ml-2">Sign Out</Text>
                </TouchableOpacity>

                <Text className="text-center text-slate-400 dark:text-slate-600 text-xs mb-8">Version 1.0.0</Text>
            </View>

            {/* Financial Month Day Picker Modal */}
            <Modal visible={dayPickerVisible} transparent animationType="fade">
                <View className="flex-1 justify-center items-center bg-black/60 px-6">
                    <View className="bg-white dark:bg-slate-900 w-full rounded-[16px] overflow-hidden">
                        <View className="p-6 border-b border-gray-100 dark:border-slate-800">
                            <Text className="text-xl font-bold text-slate-900 dark:text-white">Month Start Day</Text>
                            <Text className="text-slate-500 dark:text-slate-400 text-sm mt-1">Select the day your financial month begins.</Text>
                        </View>
                        <View className="flex-row flex-wrap p-4 justify-between">
                            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                <TouchableOpacity
                                    key={day}
                                    onPress={async () => {
                                        setFinancialMonthStart(day);
                                        await saveUserSettings('financial_month_start_day', day.toString());
                                        setDayPickerVisible(false);
                                    }}
                                    className={`w-[22%] mb-3 aspect-square items-center justify-center rounded-[12px] border ${financialMonthStart === day ? 'bg-blue-500 border-blue-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700'
                                        }`}
                                >
                                    <Text className={`font-bold ${financialMonthStart === day ? 'text-white' : 'text-slate-800 dark:text-white'}`}>{day}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            onPress={() => setDayPickerVisible(false)}
                            className="bg-gray-100 dark:bg-slate-800 p-4 items-center"
                        >
                            <Text className="text-slate-600 dark:text-slate-300 font-bold">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Excel Export Period Picker */}
            <Modal
                visible={exportPeriodModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setExportPeriodModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50 p-6">
                    <View className="bg-white dark:bg-slate-900 rounded-[16px] border border-gray-200 dark:border-slate-700 p-5">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-slate-900 dark:text-white text-lg font-bold">Export Excel (.xlsx)</Text>
                            <TouchableOpacity onPress={() => setExportPeriodModalVisible(false)} className="p-1">
                                <ExpoImage
                                    source={require('../../assets/svg/close.svg')}
                                    style={{ width: 14, height: 14 }}
                                    contentFit="contain"
                                    tintColor={colorScheme === 'dark' ? '#fff' : '#64748b'}
                                />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-slate-500 dark:text-slate-400 text-xs mb-3">
                            Choose a period. Export creates one Excel workbook with multiple sheets.
                        </Text>

                        <View className="gap-2 mb-5">
                            {EXPORT_PERIOD_OPTIONS.map((option) => {
                                const selected = option.key === selectedExportPeriod;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        onPress={() => setSelectedExportPeriod(option.key)}
                                        className={`p-3 rounded-[12px] border ${selected
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                                            : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                                            }`}
                                    >
                                        <Text className={`font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-white'}`}>
                                            {option.label}
                                        </Text>
                                        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{option.description}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setExportPeriodModalVisible(false)}
                                className="flex-1 py-3 rounded-[12px] bg-gray-100 dark:bg-slate-800 items-center"
                            >
                                <Text className="text-slate-700 dark:text-slate-200 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleConfirmExport}
                                disabled={isExportingExcel}
                                className={`flex-1 py-3 rounded-[12px] items-center ${isExportingExcel ? 'bg-blue-400' : 'bg-blue-600'}`}
                            >
                                <Text className="text-white font-semibold">Export</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* SMS Parse Date Picker */}
            {showSmsDatePicker && (
                <DateTimePicker
                    value={smsParseStartDate || new Date()}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={async (event, selectedDate) => {
                        setShowSmsDatePicker(false);
                        if (selectedDate) {
                            setSmsParseStartDate(selectedDate);
                            await saveUserSettings('sms_parse_start_date', selectedDate.toISOString());
                            Alert.alert('Settings Saved', 'Sync will now start from the selected date.');
                        }
                    }}
                />
            )}
        </Animated.ScrollView>
    );
}
