import * as LocalAuthentication from 'expo-local-authentication';
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

const DEFAULT_LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const BIOMETRICS_ENABLED_KEY = 'app_lock_biometrics_enabled';
const LOCK_TIMEOUT_KEY = 'app_lock_timeout_ms';

type BiometricLabel = 'Face ID' | 'Fingerprint' | 'Biometrics';

interface AppLockContextType {
    isSecurityReady: boolean;
    isLocked: boolean;
    requiresPinSetup: boolean;
    biometricsAvailable: boolean;
    biometricsEnabled: boolean;
    biometricsSupported: boolean;
    biometricLabel: BiometricLabel;
    lockTimeoutMs: number;
    recordActivity: () => void;
    unlockWithPin: (pin: string) => Promise<boolean>;
    savePin: (pin: string) => Promise<void>;
    changePin: (currentPin: string, nextPin: string) => Promise<boolean>;
    setBiometricsEnabled: (enabled: boolean) => Promise<void>;
    setLockTimeout: (timeoutMs: number) => Promise<void>;
    unlockWithBiometrics: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

const getPinKey = (uid: string) => {
    const safeUid = uid.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `app_lock_pin.${safeUid}`;
};

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
    const [biometricsEnabled, setBiometricsEnabledState] = useState(true);
    const [biometricsSupported, setBiometricsSupported] = useState(false);
    const [biometricLabel, setBiometricLabel] = useState<BiometricLabel>('Biometrics');
    const [lockTimeoutMs, setLockTimeoutMs] = useState(DEFAULT_LOCK_TIMEOUT_MS);
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
        }, lockTimeoutMs);
    }, [authLoading, clearLockTimer, isAuthRoute, isLocked, isSecurityReady, lockTimeoutMs, requiresPinSetup, user]);

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

    const changePin = useCallback(async (currentPin: string, nextPin: string) => {
        if (!user) return false;

        const existingPin = await SecureStore.getItemAsync(getPinKey(user.uid));
        if (existingPin && existingPin !== currentPin) {
            return false;
        }

        await SecureStore.setItemAsync(getPinKey(user.uid), nextPin, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });

        setRequiresPinSetup(false);
        scheduleLock();
        return true;
    }, [scheduleLock, user]);

    const setBiometricsEnabled = useCallback(async (enabled: boolean) => {
        await saveUserSettings(BIOMETRICS_ENABLED_KEY, enabled ? '1' : '0');
        setBiometricsEnabledState(enabled);
        setBiometricsAvailable(biometricsSupported && enabled);
    }, [biometricsSupported]);

    const setLockTimeout = useCallback(async (timeoutMs: number) => {
        await saveUserSettings(LOCK_TIMEOUT_KEY, String(timeoutMs));
        setLockTimeoutMs(timeoutMs);
        clearLockTimer();
    }, [clearLockTimer]);

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
                    setBiometricsEnabledState(true);
                    setBiometricsSupported(false);
                    setBiometricLabel('Biometrics');
                    setLockTimeoutMs(DEFAULT_LOCK_TIMEOUT_MS);
                }
                return;
            }

            if (!cancelled) {
                setIsSecurityReady(false);
            }

            try {
                const [storedPin, biometricsFlag, storedTimeout, hasHardware, isEnrolled, supportedTypes] = await Promise.all([
                    SecureStore.getItemAsync(getPinKey(user.uid)),
                    getUserSettings(BIOMETRICS_ENABLED_KEY),
                    getUserSettings(LOCK_TIMEOUT_KEY),
                    LocalAuthentication.hasHardwareAsync(),
                    LocalAuthentication.isEnrolledAsync(),
                    LocalAuthentication.supportedAuthenticationTypesAsync(),
                ]);

                if (cancelled) return;

                const biometricSupport = hasHardware && isEnrolled;
                const biometricsPreferenceEnabled = biometricsFlag !== '0';
                const parsedTimeout = Number.parseInt(storedTimeout || '', 10);
                const resolvedTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0
                    ? parsedTimeout
                    : DEFAULT_LOCK_TIMEOUT_MS;
                const canUseBiometrics = biometricSupport && biometricsPreferenceEnabled;

                setBiometricsAvailable(canUseBiometrics);
                setBiometricsEnabledState(biometricsPreferenceEnabled);
                setBiometricsSupported(biometricSupport);
                setBiometricLabel(resolveBiometricLabel(supportedTypes));
                setLockTimeoutMs(resolvedTimeout);
                setRequiresPinSetup(!storedPin);
                setIsLocked(true);
                setIsSecurityReady(true);
            } catch (error) {
                console.error('Failed to initialize app lock:', error);

                if (cancelled) return;

                setBiometricsAvailable(false);
                setBiometricsEnabledState(false);
                setBiometricsSupported(false);
                setBiometricLabel('Biometrics');
                setLockTimeoutMs(DEFAULT_LOCK_TIMEOUT_MS);
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
                const elapsed = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : lockTimeoutMs;
                backgroundedAtRef.current = null;

                if (elapsed >= lockTimeoutMs) {
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
    }, [authLoading, clearLockTimer, isAuthRoute, isLocked, isSecurityReady, lockTimeoutMs, requiresPinSetup, scheduleLock, user]);

    const contextValue = useMemo(() => ({
        isSecurityReady,
        isLocked,
        requiresPinSetup,
        biometricsAvailable,
        biometricsEnabled,
        biometricsSupported,
        biometricLabel,
        lockTimeoutMs,
        recordActivity,
        unlockWithPin,
        savePin,
        changePin,
        setBiometricsEnabled,
        setLockTimeout,
        unlockWithBiometrics,
    }), [
        biometricLabel,
        biometricsAvailable,
        biometricsEnabled,
        biometricsSupported,
        changePin,
        isLocked,
        isSecurityReady,
        lockTimeoutMs,
        recordActivity,
        requiresPinSetup,
        savePin,
        setBiometricsEnabled,
        setLockTimeout,
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
