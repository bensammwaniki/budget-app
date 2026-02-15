
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
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

// Note: `PermissionGuard` (below) is exported as default

export function PermissionGuard({ children }: { children: React.ReactNode }) {
    return <PermissionProvider>{children}</PermissionProvider>;

}

export default PermissionGuard;
