import { FontAwesome } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Text, TouchableOpacity, View } from 'react-native';
import { requestSMSPermission } from '../services/smsService';

interface PermissionGuardProps {
    children: React.ReactNode;
}

export default function PermissionGuard({ children }: PermissionGuardProps) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isRestricted, setIsRestricted] = useState(false);

    const checkPermission = async () => {
        if (Platform.OS !== 'android') {
            setHasPermission(true);
            return;
        }

        try {
            const granted = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.READ_SMS
            );
            setHasPermission(granted);

            // If not granted, we don't immediately know if it's "restricted"
            // but we can check if it was previously denied.
        } catch (err) {
            console.error('Error checking permission:', err);
        }
    };

    useEffect(() => {
        checkPermission();

        // Re-check when app comes to foreground
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                checkPermission();
            }
        });

        return () => subscription.remove();
    }, []);

    const handleRequestPermission = async () => {
        const granted = await requestSMSPermission();
        if (granted) {
            setHasPermission(true);
            setIsRestricted(false);
        } else {
            // If requesting fails or is denied, it might be restricted
            // On newer Android, if it fails multiple times, it becomes "restricted"
            setIsRestricted(true);
        }
    };

    const openSettings = () => {
        Linking.openSettings();
    };

    if (hasPermission === null) {
        return (
            <View className="flex-1 bg-white dark:bg-[#020617] items-center justify-center p-6">
                <Text className="text-slate-500 dark:text-slate-400">Loading permissions...</Text>
            </View>
        );
    }

    if (!hasPermission) {
        return (
            <View className="flex-1 bg-white dark:bg-[#020617] items-center justify-center p-8">
                <View className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center mb-8">
                    <FontAwesome name="envelope" size={40} color="#3b82f6" />
                </View>

                <Text className="text-slate-900 dark:text-white text-3xl font-bold text-center mb-4">
                    SMS Access Required
                </Text>

                <Text className="text-slate-500 dark:text-slate-400 text-center text-lg mb-10 leading-6">
                    Fanga Budget needs to read your M-PESA and Bank messages to automatically track your spending. Your data never leaves your phone.
                </Text>

                <TouchableOpacity
                    className="bg-blue-600 w-full py-4 rounded-2xl shadow-lg shadow-blue-500/30 items-center mb-4"
                    onPress={handleRequestPermission}
                >
                    <Text className="text-white text-lg font-bold">Grant Permission</Text>
                </TouchableOpacity>

                {isRestricted && (
                    <TouchableOpacity
                        className="w-full py-4 rounded-2xl border border-slate-200 dark:border-slate-800 items-center"
                        onPress={openSettings}
                    >
                        <Text className="text-slate-600 dark:text-slate-400 text-lg font-semibold">Open System Settings</Text>
                    </TouchableOpacity>
                )}

                <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mt-8 italic">
                    {isRestricted
                        ? "Android has restricted this permission. Please enable 'Allow' in the app settings under 'Permissions' > 'SMS'."
                        : "You will be prompted to allow SMS access."}
                </Text>
            </View>
        );
    }

    return <>{children}</>;
}
