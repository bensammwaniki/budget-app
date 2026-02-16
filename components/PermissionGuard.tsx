
import { FontAwesome } from '@expo/vector-icons';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, PermissionsAndroid, Platform, Text, TouchableOpacity, View } from 'react-native';
import { requestSMSPermission } from '../services/smsService';

interface PermissionContextType {
    hasPermission: boolean | null;
    isRestricted: boolean;
    loading: boolean;
    requestPermission: () => Promise<void>;
    openSettings: () => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function usePermission() {
    return useContext(PermissionContext)!;
}

export function PermissionProvider({ children }: { children: React.ReactNode }) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isRestricted, setIsRestricted] = useState(false);
    const [loading, setLoading] = useState(true);

    const checkPermission = async () => {
        if (Platform.OS !== 'android') {
            setHasPermission(true);
            setLoading(false);
            return;
        }
        try {
            const granted = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.READ_SMS
            );
            setHasPermission(granted);
        } catch (err) {
            console.error('Error checking permission:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkPermission();
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                checkPermission();
            }
        });
        return () => subscription.remove();
    }, []);

    const requestPermission = async () => {
        setLoading(true);
        const granted = await requestSMSPermission();
        if (granted) {
            setHasPermission(true);
            setIsRestricted(false);
        } else {
            setIsRestricted(true);
        }
        setLoading(false);
    };

    const openSettings = () => {
        import('expo-linking').then(Linking => Linking.openSettings());
    };

    return (
        <PermissionContext.Provider value={{ hasPermission, isRestricted, loading, requestPermission, openSettings }}>
            {children}
        </PermissionContext.Provider>
    );
}

function PermissionGate({ children }: { children: React.ReactNode }) {
    const { hasPermission, loading, requestPermission, openSettings, isRestricted } = usePermission();

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white dark:bg-[#0f172a]">
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    // On Android, strictly wait for permission to be TRUE
    if (Platform.OS === 'android' && hasPermission !== true) {
        return (
            <View className="flex-1 bg-white dark:bg-[#0f172a] px-8 justify-center items-center">
                <View className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full items-center justify-center mb-8">
                    <FontAwesome name="envelope-o" size={40} color="#3b82f6" />
                </View>

                <Text className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-4">
                    SMS Access Required
                </Text>

                <Text className="text-slate-500 dark:text-slate-400 text-center mb-10 leading-6">
                    This app needs access to your M-PESA SMS messages to automatically track your expenses, income, and debts.
                </Text>

                <TouchableOpacity
                    onPress={isRestricted ? openSettings : requestPermission}
                    activeOpacity={0.7}
                    style={{ backgroundColor: '#2563eb' }}
                    className="w-full py-4 rounded-2xl items-center justify-center mb-4"
                >
                    <Text className="text-white font-bold text-lg">
                        {isRestricted ? 'Open Settings' : 'Allow Access'}
                    </Text>
                </TouchableOpacity>

                {isRestricted && (
                    <Text className="text-slate-400 text-xs text-center">
                        Permission was denied. Please enable it in system settings to continue.
                    </Text>
                )}
            </View>
        );
    }

    return <>{children}</>;
}

export function PermissionGuard({ children }: { children: React.ReactNode }) {
    return (
        <PermissionProvider>
            <PermissionGate>{children}</PermissionGate>
        </PermissionProvider>
    );
}

export default PermissionGuard;
