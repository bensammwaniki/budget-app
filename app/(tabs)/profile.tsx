import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, RefreshControl, Switch, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import AddCategoryModal from '../../components/AddCategoryModal';
import ExportPeriodModal from '../../components/modals/ExportPeriodModal';
import FinancialSettingsModal from '../../components/modals/FinancialSettingsModal';
import ProfileEditModal from '../../components/modals/ProfileEditModal';
import { useAppLock } from '../../context/AppLockContext';
import { useAuth } from '../../services/AuthContext';
import { deleteCategory, getCategories, initDatabase } from '../../services/database';
import { resetFinancialDataThroughDate } from '../../services/financialDataResetService';
import { exportFinancialSpreadsheet, ExportPeriod } from '../../services/exportService';
import {
    buildFreshStartConfig,
    clearFreshStartConfig,
    FreshStartConfig,
    getFinancialMonthRange,
    getFinancialSettings,
    saveFinancialMonthStart,
    saveFreshStartConfig,
    saveHideInternalTransfers,
} from '../../services/financialSettingsService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { Category } from '../../types/transaction';

const EXPORT_PERIOD_OPTIONS: { key: ExportPeriod; label: string; description: string }[] = [
    { key: 'THIS_MONTH', label: 'This Month', description: 'Current month only' },
    { key: 'LAST_MONTH', label: 'Last Month', description: 'Previous full month' },
    { key: 'LAST_3_MONTHS', label: 'Last 3 Months', description: 'Current month + previous 2' },
    { key: 'CURRENT_YEAR', label: 'Current Year', description: 'From January to today' },
    { key: 'ALL_TIME', label: 'All Time', description: 'Everything in the app' },
];

const LOCK_TIMEOUT_OPTIONS = [
    { value: 30 * 1000, label: '30 sec' },
    { value: 60 * 1000, label: '1 min' },
    { value: 3 * 60 * 1000, label: '3 min' },
    { value: 5 * 60 * 1000, label: '5 min' },
    { value: 10 * 60 * 1000, label: '10 min' },
];

const periodLabel = (period: ExportPeriod): string =>
    EXPORT_PERIOD_OPTIONS.find((p) => p.key === period)?.label || 'All Time';

const DEFAULT_FRESH_START_OPTIONS = {
    resetBroughtForward: false,
    resetDebts: false,
    resetSavings: false,
    resetIncome: false,
    resetBudgets: false,
};

export default function ProfileScreen() {
    const { signOut, user, phoneNumber, updateUserProfile } = useAuth();
    const {
        changePin,
        biometricsEnabled,
        biometricsSupported,
        biometricLabel,
        lockTimeoutMs,
        setBiometricsEnabled,
        setLockTimeout,
    } = useAppLock();
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
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [isSecurityUpdating, setIsSecurityUpdating] = useState(false);

    // Settings State
    const [financialMonthStart, setFinancialMonthStart] = useState(1);
    const [financialMonthDraft, setFinancialMonthDraft] = useState(1);
    const [hideInternalTransfers, setHideInternalTransfers] = useState(false);
    const [hideInternalTransfersDraft, setHideInternalTransfersDraft] = useState(false);
    const [freshStartConfig, setFreshStartConfig] = useState<FreshStartConfig | null>(null);
    const [freshStartOptions, setFreshStartOptions] = useState(DEFAULT_FRESH_START_OPTIONS);
    const [dayPickerVisible, setDayPickerVisible] = useState(false);
    const [isFinancialSettingsSaving, setIsFinancialSettingsSaving] = useState(false);
    const [resetFromDate, setResetFromDate] = useState(new Date());
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
        const financialSettings = await getFinancialSettings();
        setFinancialMonthStart(financialSettings.monthStartDay);
        setFinancialMonthDraft(financialSettings.monthStartDay);
        setHideInternalTransfers(financialSettings.hideInternalTransfers);
        setHideInternalTransfersDraft(financialSettings.hideInternalTransfers);
        setFreshStartConfig(financialSettings.freshStart);
    };

    // Initialize edit form when opening modal
    useEffect(() => {
        if (editProfileVisible) {
            setEditName(user?.displayName || '');
            setEditPhone(phoneNumber || '');
            setEditImage(user?.photoURL || null);
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
        }
    }, [editProfileVisible, user, phoneNumber]);

    useEffect(() => {
        if (!dayPickerVisible) return;

        setFinancialMonthDraft(financialMonthStart);
        setHideInternalTransfersDraft(hideInternalTransfers);
        setFreshStartOptions(DEFAULT_FRESH_START_OPTIONS);
    }, [dayPickerVisible, financialMonthStart, hideInternalTransfers]);

    const loadCategories = async () => {
        await initDatabase();
        const cats = await getCategories();
        setCategories(cats);
    };

    const handleCategoryAdded = async (_newCategory: Category) => {
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

        const wantsToUpdatePin = !!(currentPin.trim() || newPin.trim() || confirmPin.trim());
        if (wantsToUpdatePin) {
            if (!currentPin.trim() || !newPin.trim() || !confirmPin.trim()) {
                Alert.alert('Missing PIN', 'Fill in your current PIN, new PIN, and confirmation.');
                return;
            }

            if (!/^\d{4}$/.test(newPin.trim())) {
                Alert.alert('Invalid PIN', 'Your new PIN must be exactly 4 digits.');
                return;
            }

            if (newPin.trim() !== confirmPin.trim()) {
                Alert.alert('PIN Mismatch', 'The new PIN and confirmation PIN do not match.');
                return;
            }
        }

        try {
            setIsUpdating(true);
            await updateUserProfile({
                displayName: editName.trim(),
                phoneNumber: editPhone.trim(),
                photoURL: editImage || undefined
            });

            if (wantsToUpdatePin) {
                const success = await changePin(currentPin.trim(), newPin.trim());
                if (!success) {
                    Alert.alert('Incorrect PIN', 'Your current PIN is not correct.');
                    return;
                }

                setCurrentPin('');
                setNewPin('');
                setConfirmPin('');
            }

            setEditProfileVisible(false);
            Alert.alert('Success', wantsToUpdatePin ? 'Profile and PIN updated successfully' : 'Profile updated successfully');
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleBiometricsToggle = async (enabled: boolean) => {
        if (!biometricsSupported) return;

        try {
            setIsSecurityUpdating(true);
            await setBiometricsEnabled(enabled);
        } catch (error) {
            console.error('Error updating biometric preference:', error);
            Alert.alert('Error', 'Failed to update biometric preference.');
        } finally {
            setIsSecurityUpdating(false);
        }
    };

    const handleSelectLockTimeout = async (timeoutMs: number) => {
        try {
            setIsSecurityUpdating(true);
            await setLockTimeout(timeoutMs);
        } catch (error) {
            console.error('Error updating lock timeout:', error);
            Alert.alert('Error', 'Failed to update lock timeout.');
        } finally {
            setIsSecurityUpdating(false);
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

    const handleCloseFinancialMonthModal = async () => {
        try {
            setIsFinancialSettingsSaving(true);
            await applyFinancialSettings();
            setDayPickerVisible(false);
        } catch (error) {
            console.error('Failed to save financial month settings:', error);
            Alert.alert('Error', 'Failed to save financial month settings.');
        } finally {
            setIsFinancialSettingsSaving(false);
        }
    };

    const applyFinancialSettings = async () => {
        await Promise.all([
            saveFinancialMonthStart(financialMonthDraft),
            saveHideInternalTransfers(hideInternalTransfersDraft),
        ]);
        setFinancialMonthStart(financialMonthDraft);
        setHideInternalTransfers(hideInternalTransfersDraft);
    };

    const handleStartFreshFromCurrentMonth = async () => {
        const enabledResets = Object.entries(freshStartOptions).filter(([, value]) => value);
        if (enabledResets.length === 0) {
            try {
                setIsFinancialSettingsSaving(true);
                await applyFinancialSettings();
                await clearFreshStartConfig();
                setFreshStartConfig(null);
                setDayPickerVisible(false);
                Alert.alert(
                    'Recalculated',
                    'The app has been recalculated using your current financial month settings, with no fresh-start reset applied.'
                );
            } catch (error) {
                console.error('Failed to recalculate financial month settings:', error);
                Alert.alert('Error', 'Failed to recalculate financial month settings.');
            } finally {
                setIsFinancialSettingsSaving(false);
            }
            return;
        }

        const effectiveRange = getFinancialMonthRange(new Date(), financialMonthDraft);
        const effectiveLabel = effectiveRange.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const resetLines = [
            freshStartOptions.resetBroughtForward && '• Balance brought forward before this month becomes 0.',
            freshStartOptions.resetDebts && '• Pre-existing debt carry state will be excluded from the new cycle.',
            freshStartOptions.resetSavings && '• Savings progress before this month will be treated as pre-baseline.',
            freshStartOptions.resetIncome && '• Income progress before this month will be treated as pre-baseline.',
            freshStartOptions.resetBudgets && '• Monthly summaries and budget carry state will restart from this month.',
            '• Raw transactions and transaction dates will stay unchanged.',
        ].filter(Boolean).join('\n');

        Alert.alert(
            'Start Fresh From This Month',
            `This will create a new baseline from ${effectiveLabel}.\n\n${resetLines}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Start Fresh',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsFinancialSettingsSaving(true);
                            await applyFinancialSettings();
                            const config = buildFreshStartConfig(financialMonthDraft, freshStartOptions);
                            await saveFreshStartConfig(config);
                            setFreshStartConfig(config);
                            setDayPickerVisible(false);
                            Alert.alert('Fresh Start Applied', `A new baseline now starts from ${effectiveLabel}.`);
                        } catch (error) {
                            console.error('Failed to apply fresh start:', error);
                            Alert.alert('Error', 'Failed to apply fresh-start settings.');
                        } finally {
                            setIsFinancialSettingsSaving(false);
                        }
                    },
                },
            ]
        );
    };

    const handleResetFinancialData = () => {
        const label = resetFromDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        Alert.alert(
            'Reset financial data?',
            `This permanently removes financial history on ${label} and all dates before it, including parsed SMS transactions. Categories, learned categorization, and automation rules stay for future use. This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset data',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsFinancialSettingsSaving(true);
                            const result = await resetFinancialDataThroughDate(resetFromDate);
                            await loadSettings();
                            Alert.alert('Financial history reset', `${result.transactionsRemoved} transaction${result.transactionsRemoved === 1 ? '' : 's'} removed through ${label}.`);
                        } catch (error) {
                            console.error('Failed to reset financial data:', error);
                            Alert.alert('Reset failed', 'Your data was not fully reset. Please try again.');
                        } finally {
                            setIsFinancialSettingsSaving(false);
                        }
                    },
                },
            ]
        );
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
                <View className="relative mb-4">
                    <View className="w-24 h-24 bg-gray-50 dark:bg-[#1e293b] rounded-full items-center justify-center border border-gray-200 dark:border-slate-700 overflow-hidden">
                        {user?.photoURL ? (
                            <Image source={{ uri: user.photoURL }} className="w-full h-full" style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                            <Text className="text-4xl text-slate-800 dark:text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                        )}
                    </View>
                    <TouchableOpacity
                        onPress={() => setEditProfileVisible(true)}
                        className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full items-center justify-center bg-blue-600 border-2 border-white dark:border-[#0f172a]"
                    >
                        <FontAwesome name="pencil" size={13} color="#ffffff" />
                    </TouchableOpacity>
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
                                {
                                    icon: require('../../assets/svg/privacy.svg'), label: 'Financial Settings', color: '#f59e0b', action: () => setDayPickerVisible(true),
                                    value: freshStartConfig
                                        ? `Day ${financialMonthStart} • Fresh start active`
                                        : `Day ${financialMonthStart}`
                                },
                                {
                                    icon: require('../../assets/svg/graph.svg'),
                                    label: 'Export Excel',
                                    color: '#0ea5e9',
                                    action: handleOpenExportModal,
                                    value: isExportingExcel ? 'Generating export...' : `Period: ${periodLabel(selectedExportPeriod)}`,
                                    disabled: isExportingExcel,
                                },
                                { icon: require('../../assets/svg/automation.svg'), label: 'Automation Rules', color: '#8b5cf6', action: () => router.push('/automation') },
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

                <ProfileEditModal
                    visible={editProfileVisible}
                    colorScheme={colorScheme}
                    editImage={editImage}
                    displayName={user?.displayName}
                    editName={editName}
                    onChangeName={setEditName}
                    editPhone={editPhone}
                    onChangePhone={setEditPhone}
                    currentPin={currentPin}
                    onChangeCurrentPin={setCurrentPin}
                    newPin={newPin}
                    onChangeNewPin={setNewPin}
                    confirmPin={confirmPin}
                    onChangeConfirmPin={setConfirmPin}
                    biometricLabel={biometricLabel}
                    biometricsSupported={biometricsSupported}
                    biometricsEnabled={biometricsEnabled}
                    onToggleBiometrics={handleBiometricsToggle}
                    isSecurityUpdating={isSecurityUpdating}
                    lockTimeoutMs={lockTimeoutMs}
                    lockTimeoutOptions={LOCK_TIMEOUT_OPTIONS}
                    onSelectLockTimeout={handleSelectLockTimeout}
                    isUpdating={isUpdating}
                    onSave={handleUpdateProfile}
                    onClose={() => setEditProfileVisible(false)}
                    onTakePhoto={handleTakePhoto}
                    onPickImage={handlePickImage}
                />

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

            <FinancialSettingsModal
                visible={dayPickerVisible}
                colorScheme={colorScheme}
                financialMonthDraft={financialMonthDraft}
                onSelectDay={setFinancialMonthDraft}
                hideInternalTransfersDraft={hideInternalTransfersDraft}
                onToggleHideInternalTransfers={setHideInternalTransfersDraft}
                freshStartOptions={freshStartOptions}
                onToggleFreshStartOption={(key, value) => setFreshStartOptions((current) => ({ ...current, [key]: value }))}
                freshStartConfig={freshStartConfig}
                isSaving={isFinancialSettingsSaving}
                primaryLabel={Object.values(freshStartOptions).some(Boolean) ? 'Start Fresh From This Month' : 'Recalculate'}
                onPrimaryAction={handleStartFreshFromCurrentMonth}
                resetFromDate={resetFromDate}
                onChangeResetFromDate={setResetFromDate}
                onResetFinancialData={handleResetFinancialData}
                onClose={handleCloseFinancialMonthModal}
            />

            <ExportPeriodModal
                visible={exportPeriodModalVisible}
                colorScheme={colorScheme}
                options={EXPORT_PERIOD_OPTIONS}
                selectedPeriod={selectedExportPeriod}
                isExporting={isExportingExcel}
                onSelectPeriod={setSelectedExportPeriod}
                onClose={() => setExportPeriodModalVisible(false)}
                onConfirm={handleConfirmExport}
            />

        </Animated.ScrollView>
    );
}
