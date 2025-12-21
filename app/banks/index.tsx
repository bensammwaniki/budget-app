import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, Switch, Text, TouchableOpacity, View } from 'react-native';
import { clearProcessedSms, getUserSettings, saveUserSettings } from '../../services/database';
import { syncMessages } from '../../services/smsService';

import { Image } from 'expo-image';

export default function MyBanksScreen() {
    const router = useRouter();
    const { colorScheme } = useColorScheme();
    const [imBankEnabled, setImBankEnabled] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const enabled = await getUserSettings('bank_im_enabled');
            setImBankEnabled(enabled === 'true');
        } catch (error) {
            console.error('Error loading bank settings:', error);
        }
    };

    const toggleImBank = async (value: boolean) => {
        setImBankEnabled(value);
        await saveUserSettings('bank_im_enabled', value.toString());

        // Auto-sync when enabling
        if (value) {
            setIsSyncing(true);
            try {
                // Clear cache to force fresh scan of bank transactions
                await clearProcessedSms();

                // Trigger background sync
                const result = await syncMessages(30);

                if (result.success) {
                    Alert.alert(
                        'Sync Complete',
                        `Successfully synced bank transactions! Check your Home screen.`,
                        [{ text: 'OK' }]
                    );
                } else {
                    const errorMessage = result.error
                        ? (typeof result.error === 'string' ? result.error : 'Sync failed')
                        : 'Could not sync transactions. Please try again.';
                    Alert.alert(
                        'Sync Failed',
                        errorMessage,
                        [{ text: 'OK' }]
                    );
                }
            } catch (error) {
                console.error('Error during auto-sync:', error);
                Alert.alert(
                    'Sync Error',
                    'An error occurred while syncing. Please try again.',
                    [{ text: 'OK' }]
                );
            } finally {
                setIsSyncing(false);
            }
        }
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

            {/* Header */}
            <View className="px-6 pt-16 pb-6 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image
                            source={require('../../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-slate-900 dark:text-white">My Banks</Text>
                </View>
                <Text className="mt-2 text-slate-500 dark:text-slate-400 text-[11px]">
                    Enable SMS parsing for your banks to automatically track transactions.
                </Text>
            </View>

            <ScrollView className="flex-1 px-6 pt-6">
                <Text className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Supported Banks</Text>

                {/* I&M Bank */}
                <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-4 mb-4 border border-gray-100 dark:border-slate-800 shadow-sm">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1 mr-4">
                            <View className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center mr-4">
                                
                                <Image
                                    source={require('../../assets/banks/iandm-logo.png')}
                                    style={{ width: 24, height: 24 }}
                                    contentFit="cover"
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-slate-900 dark:text-white">I&M Bank</Text>
                                <Text className="text-sm text-slate-500 dark:text-slate-400">
                                    {isSyncing ? 'Syncing transactions...' : 'Parses transfers & card purchases'}
                                </Text>
                            </View>
                        </View>
                        <View className="flex-row items-center gap-2">
                            {isSyncing && (
                                <ActivityIndicator size="small" color="#2563eb" />
                            )}
                            <Switch
                                value={imBankEnabled}
                                onValueChange={toggleImBank}
                                trackColor={{ false: '#e2e8f0', true: '#2563eb' }}
                                thumbColor={'#ffffff'}
                                disabled={isSyncing}
                            />
                        </View>
                    </View>
                </View>

                {/* Coming Soon Placeholder */}
                <View className="bg-gray-100 dark:bg-[#1e293b]/50 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 border-dashed">
                    <View className="flex-row items-center justify-center py-4">
                        <Text className="text-slate-400 dark:text-slate-500 font-medium">More banks coming soon</Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
