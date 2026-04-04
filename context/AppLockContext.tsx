// eslint-disable-next-line import/no-unresolved
import * as LocalAuthentication from 'expo-local-authentication';
// eslint-disable-next-line import/no-unresolved
import * as SecureStore from 'expo-secure-store';
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AppLockScreen from '../components/AppLockScreen';
import { getUserSettings, saveUserSettings } from '../services/database';
import { useAuth } from '../services/AuthContext';

const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const BIOMETRICS_ENABLED_KEY = 'app_lock_biometrics_enabled';

type BiometricLabel = 'Face ID' | 'Fingerprint' | 'Biometrics';

interface AppLockContextType {
    isSecurityReady: boolean;
    isLocked: boolean;
    requiresPinSetup: boolean;
    biometricsAvailable: boolean;
    biometricLabel: BiometricLabel;
    recordActivity: () => void;
    unlockWithPin: (pin: string) => Promise<boolean>;
    savePin: (pin: string) => Promise<void>;
    unlockWithBiometrics: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

const getPinKey = (uid: string) => `app_lock_pin:${uid}`;

const resolveBiometricLabel = (types: LocalAuthentication.AuthenticationType[]): BiometricLabel => {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'Face ID';
    }

    if (
        types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ||
        types.includes(LocalAuthentication.AuthenticationType.IRIS)
    ) {
        return 'Fingerprint';
    }

    return 'Biometrics';
};

export function useAppLock() {
    const context = useContext(AppLockContext);
    if (!context) {
        throw new Error('useAppLock must be used within an AppLockProvider');
    }
    return context;
}

export function AppLockProvider({
    children,
    isAuthRoute,
}: {
    children: ReactNode;
    isAuthRoute: boolean;
}) {
    const { user, loading: authLoading } = useAuth();
    const [isSecurityReady, setIsSecurityReady] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [requiresPinSetup, setRequiresPinSetup] = useState(false);
    const [biometricsAvailable, setBiometricsAvailable] = useState(false);
    const [biometricLabel, setBiometricLabel] = useState<BiometricLabel>('Biometrics');
    const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const backgroundedAtRef = useRef<number | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const clearLockTimer = useCallback(() => {
        if (lockTimerRef.current) {
            clearTimeout(lockTimerRef.current);
            lockTimerRef.current = null;
        }
    }, []);

    const scheduleLock = useCallback(() => {
        clearLockTimer();

        if (!user || isAuthRoute || authLoading || isLocked || requiresPinSetup || !isSecurityReady) {
            return;
        }

        lockTimerRef.current = setTimeout(() => {
            setIsLocked(true);
        }, LOCK_TIMEOUT_MS);
    }, [authLoading, clearLockTimer, isAuthRoute, isLocked, isSecurityReady, requiresPinSetup, user]);

    const recordActivity = useCallback(() => {
        if (!user || isAuthRoute || authLoading || isLocked || requiresPinSetup || !isSecurityReady) {
            return;
        }
        scheduleLock();
    }, [authLoading, isAuthRoute, isLocked, isSecurityReady, requiresPinSetup, scheduleLock, user]);

    const unlockWithPin = useCallback(async (pin: string) => {
        if (!user) return false;

        const storedPin = await SecureStore.getItemAsync(getPinKey(user.uid));
        if (storedPin !== pin) {
            return false;
        }

        setIsLocked(false);
        setRequiresPinSetup(false);
        scheduleLock();
        return true;
    }, [scheduleLock, user]);

    const savePin = useCallback(async (pin: string) => {
        if (!user) return;

        await SecureStore.setItemAsync(getPinKey(user.uid), pin, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        await saveUserSettings(BIOMETRICS_ENABLED_KEY, '1');

        setRequiresPinSetup(false);
        setIsLocked(false);
        scheduleLock();
    }, [scheduleLock, user]);

    const unlockWithBiometrics = useCallback(async () => {
        if (!biometricsAvailable || !user) return false;

        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Fanga Budget',
            disableDeviceFallback: true,
            cancelLabel: 'Use PIN',
        });

        if (!result.success) {
            return false;
        }

        setIsLocked(false);
        scheduleLock();
        return true;
    }, [biometricsAvailable, scheduleLock, user]);

    useEffect(() => {
        let cancelled = false;

        const loadSecurityState = async () => {
            if (authLoading) return;

            clearLockTimer();

            if (!user || isAuthRoute) {
                if (!cancelled) {
                    setIsSecurityReady(true);
                    setIsLocked(false);
                    setRequiresPinSetup(false);
                    setBiometricsAvailable(false);
                    setBiometricLabel('Biometrics');
                }
                return;
            }

            if (!cancelled) {
                setIsSecurityReady(false);
            }

            try {
                const [storedPin, biometricsFlag, hasHardware, isEnrolled, supportedTypes] = await Promise.all([
                    SecureStore.getItemAsync(getPinKey(user.uid)),
                    getUserSettings(BIOMETRICS_ENABLED_KEY),
                    LocalAuthentication.hasHardwareAsync(),
                    LocalAuthentication.isEnrolledAsync(),
                    LocalAuthentication.supportedAuthenticationTypesAsync(),
                ]);

                if (cancelled) return;

                const canUseBiometrics = hasHardware && isEnrolled && biometricsFlag !== '0';

                setBiometricsAvailable(canUseBiometrics);
                setBiometricLabel(resolveBiometricLabel(supportedTypes));
                setRequiresPinSetup(!storedPin);
                setIsLocked(true);
                setIsSecurityReady(true);
            } catch (error) {
                console.error('Failed to initialize app lock:', error);

                if (cancelled) return;

                setBiometricsAvailable(false);
                setBiometricLabel('Biometrics');
                setRequiresPinSetup(false);
                setIsLocked(true);
                setIsSecurityReady(true);
            }
        };

        void loadSecurityState();

        return () => {
            cancelled = true;
        };
    }, [authLoading, clearLockTimer, isAuthRoute, user]);

    useEffect(() => {
        if (authLoading || !user || isAuthRoute || !isSecurityReady) {
            clearLockTimer();
            return;
        }

        if (isLocked || requiresPinSetup) {
            clearLockTimer();
            return;
        }

        scheduleLock();
        return clearLockTimer;
    }, [
        authLoading,
        clearLockTimer,
        isAuthRoute,
        isLocked,
        isSecurityReady,
        requiresPinSetup,
        scheduleLock,
        user,
    ]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextAppState;

            if (nextAppState === 'background' || nextAppState === 'inactive') {
                backgroundedAtRef.current = Date.now();
                clearLockTimer();
                return;
            }

            if (
                previousState.match(/inactive|background/) &&
                nextAppState === 'active' &&
                user &&
                !isAuthRoute &&
                !authLoading &&
                isSecurityReady
            ) {
                const elapsed = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : LOCK_TIMEOUT_MS;
                backgroundedAtRef.current = null;

                if (elapsed >= LOCK_TIMEOUT_MS) {
                    setIsLocked(true);
                    return;
                }

                if (!isLocked && !requiresPinSetup) {
                    scheduleLock();
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [authLoading, clearLockTimer, isAuthRoute, isLocked, isSecurityReady, requiresPinSetup, scheduleLock, user]);

    const contextValue = useMemo(() => ({
        isSecurityReady,
        isLocked,
        requiresPinSetup,
        biometricsAvailable,
        biometricLabel,
        recordActivity,
        unlockWithPin,
        savePin,
        unlockWithBiometrics,
    }), [
        biometricLabel,
        biometricsAvailable,
        isLocked,
        isSecurityReady,
        recordActivity,
        requiresPinSetup,
        savePin,
        unlockWithBiometrics,
        unlockWithPin,
    ]);

    return (
        <AppLockContext.Provider value={contextValue}>
            {children}
            <AppLockScreen />
        </AppLockContext.Provider>
    );
}
