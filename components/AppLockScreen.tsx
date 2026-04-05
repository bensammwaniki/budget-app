import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAppLock } from '../context/AppLockContext';
import { useAuth } from '../services/AuthContext';

const PIN_LENGTH = 4;
const KEYPAD_ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
];

const getInitials = (name: string | null | undefined) => {
    if (!name) return 'FB';

    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    if (parts.length === 0) return 'FB';
    return parts.map(part => part[0]?.toUpperCase() ?? '').join('');
};

export default function AppLockScreen() {
    const { user, phoneNumber } = useAuth();
    const {
        isSecurityReady,
        isLocked,
        requiresPinSetup,
        biometricsAvailable,
        biometricLabel,
        unlockWithPin,
        savePin,
        unlockWithBiometrics,
    } = useAppLock();
    const { colorScheme } = useColorScheme();
    const [pinInput, setPinInput] = useState('');
    const [firstPinEntry, setFirstPinEntry] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isBiometricLoading, setIsBiometricLoading] = useState(false);
    const autoBiometricAttemptedRef = useRef(false);

    const isDark = colorScheme === 'dark';
    const shouldShow = !!user && isSecurityReady && (isLocked || requiresPinSetup);
    const displayName = user?.displayName?.trim() || 'Fanga Budget';
    const subtitle = phoneNumber || user?.email || 'Secure finance access';
    const pinHint = useMemo(() => {
        if (requiresPinSetup && !firstPinEntry) {
            return 'Create a 4-digit security PIN';
        }

        if (requiresPinSetup && firstPinEntry) {
            return 'Confirm your security PIN';
        }

        return 'Enter your PIN to continue';
    }, [firstPinEntry, requiresPinSetup]);

    const handleBiometricUnlock = useCallback(async () => {
        if (!biometricsAvailable || isSubmitting || isBiometricLoading) return;

        try {
            setErrorMessage('');
            setIsBiometricLoading(true);
            const success = await unlockWithBiometrics();
            if (!success) {
                setErrorMessage(`Use your PIN or ${biometricLabel.toLowerCase()} to unlock.`);
            }
        } catch (error) {
            console.error('Biometric unlock failed:', error);
            setErrorMessage(`${biometricLabel} is not available right now.`);
        } finally {
            setIsBiometricLoading(false);
        }
    }, [biometricLabel, biometricsAvailable, isBiometricLoading, isSubmitting, unlockWithBiometrics]);

    useEffect(() => {
        if (!shouldShow) {
            setPinInput('');
            setFirstPinEntry('');
            setErrorMessage('');
            setIsSubmitting(false);
            setIsBiometricLoading(false);
            autoBiometricAttemptedRef.current = false;
            return;
        }

        if (requiresPinSetup) {
            autoBiometricAttemptedRef.current = true;
            return;
        }

        if (!biometricsAvailable || autoBiometricAttemptedRef.current) {
            return;
        }

        autoBiometricAttemptedRef.current = true;
        const timer = setTimeout(() => {
            void handleBiometricUnlock();
        }, 250);

        return () => clearTimeout(timer);
    }, [biometricsAvailable, handleBiometricUnlock, requiresPinSetup, shouldShow]);

    const handleCompletedPin = async (nextPin: string) => {
        if (isSubmitting) return;

        try {
            setIsSubmitting(true);
            setErrorMessage('');

            if (requiresPinSetup) {
                if (!firstPinEntry) {
                    setFirstPinEntry(nextPin);
                    setPinInput('');
                    return;
                }

                if (firstPinEntry !== nextPin) {
                    setFirstPinEntry('');
                    setPinInput('');
                    setErrorMessage('PINs did not match. Start again.');
                    return;
                }

                await savePin(nextPin);
                setFirstPinEntry('');
                setPinInput('');
                return;
            }

            const success = await unlockWithPin(nextPin);
            if (!success) {
                setPinInput('');
                setErrorMessage('That PIN is incorrect.');
            }
        } catch (error) {
            console.error('PIN unlock failed:', error);
            setErrorMessage('Unable to verify your PIN right now.');
            setPinInput('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDigitPress = (digit: string) => {
        if (isSubmitting || pinInput.length >= PIN_LENGTH) return;

        setErrorMessage('');

        const nextPin = `${pinInput}${digit}`;
        setPinInput(nextPin);

        if (nextPin.length === PIN_LENGTH) {
            void handleCompletedPin(nextPin);
        }
    };

    const handleDelete = () => {
        if (isSubmitting || pinInput.length === 0) return;
        setPinInput(current => current.slice(0, -1));
    };

    const biometricIcon = biometricLabel === 'Face ID' ? 'scan-circle-outline' : 'finger-print';

    if (!shouldShow) {
        return null;
    }

    return (
        <View className="absolute inset-0 z-[9998]">
            <LinearGradient
                colors={isDark ? ['#020617', '#0f172a', '#111827'] : ['#f8fbff', '#eef6ff', '#ffffff']}
                style={{ flex: 1 }}
            >
                <View
                    style={{
                        position: 'absolute',
                        top: 80,
                        left: -40,
                        width: 180,
                        height: 180,
                        borderRadius: 90,
                        backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(59,130,246,0.1)',
                    }}
                />
                <View
                    style={{
                        position: 'absolute',
                        top: 180,
                        right: -60,
                        width: 240,
                        height: 240,
                        borderRadius: 120,
                        backgroundColor: isDark ? 'rgba(14,165,233,0.12)' : 'rgba(14,165,233,0.08)',
                    }}
                />

                <SafeAreaView className="flex-1 px-7 py-6 justify-between">
                    <View className="items-center pt-6">
                        <View className="w-24 h-24 rounded-full bg-blue-50 dark:bg-blue-500/15 items-center justify-center border border-blue-100 dark:border-blue-500/20">
                            <Text className="text-[30px] font-black text-blue-600 dark:text-blue-300">
                                {getInitials(displayName)}
                            </Text>
                        </View>

                        <Text className="mt-5 text-slate-900 dark:text-white text-[22px] font-black tracking-tight text-center">
                            {displayName}
                        </Text>
                        <Text className="mt-1 text-slate-500 dark:text-slate-400 text-sm text-center">
                            {subtitle}
                        </Text>

                        <View className="mt-12 items-center">
                            <Text className="text-[11px] font-bold uppercase tracking-[2px] text-slate-400 dark:text-slate-500">
                                {requiresPinSetup ? 'Set App PIN' : 'Unlock App'}
                            </Text>
                            <Text className="mt-3 text-slate-700 dark:text-slate-200 text-base font-semibold">
                                {pinHint}
                            </Text>

                            <View className="flex-row gap-4 mt-7">
                                {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                                    const filled = index < pinInput.length;
                                    return (
                                        <View
                                            key={index}
                                            className={`w-14 h-14 rounded-full border items-center justify-center ${filled
                                                ? 'bg-blue-600 border-blue-600'
                                                : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                                                }`}
                                        >
                                            {filled && <View className="w-4 h-4 rounded-full bg-white" />}
                                        </View>
                                    );
                                })}
                            </View>

                            <View className="min-h-[22px] mt-5">
                                {isSubmitting || isBiometricLoading ? (
                                    <ActivityIndicator color={isDark ? '#93c5fd' : '#2563eb'} />
                                ) : errorMessage ? (
                                    <Text className="text-sm text-red-500 font-medium text-center">
                                        {errorMessage}
                                    </Text>
                                ) : firstPinEntry ? (
                                    <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                        Re-enter the same PIN to finish setup.
                                    </Text>
                                ) : (
                                    <Text className="text-sm text-slate-400 dark:text-slate-500 text-center">
                                        Your financial data stays hidden until you unlock.
                                    </Text>
                                )}
                            </View>
                        </View>
                    </View>

                    <View className="pb-10 mb-4">
                        {KEYPAD_ROWS.map(row => (
                            <View key={row.join('-')} className="flex-row justify-between mb-4">
                                {row.map(key => (
                                    <Pressable
                                        key={key}
                                        onPress={() => handleDigitPress(key)}
                                        className="w-[30.5%] h-20 rounded-[16px] bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 items-center justify-center"
                                    >
                                        <Text className="text-[30px] font-light text-slate-900 dark:text-white">
                                            {key}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        ))}

                        <View className="flex-row justify-between">
                            <TouchableOpacity
                                onPress={handleDelete}
                                disabled={isSubmitting || pinInput.length === 0}
                                className={`w-[30.5%] h-20 rounded-[16px] border items-center justify-center ${pinInput.length === 0
                                    ? 'border-transparent bg-transparent opacity-50'
                                    : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800'
                                    }`}
                                activeOpacity={0.85}
                            >
                                {pinInput.length > 0 && (
                                    <>
                                        <Ionicons name="backspace-outline" size={24} color={isDark ? '#e2e8f0' : '#0f172a'} />
                                        <Text className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Delete
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <Pressable
                                onPress={() => handleDigitPress('0')}
                                className="w-[30.5%] h-20 rounded-[16px] bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 items-center justify-center"
                            >
                                <Text className="text-[30px] font-light text-slate-900 dark:text-white">
                                    0
                                </Text>
                            </Pressable>

                            <TouchableOpacity
                                onPress={() => void handleBiometricUnlock()}
                                disabled={!biometricsAvailable || isSubmitting}
                                className={`w-[30.5%] h-20 rounded-[16px] border items-center justify-center ${biometricsAvailable
                                    ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20'
                                    : 'bg-white/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-50'
                                    }`}
                                activeOpacity={0.85}
                            >
                                <Ionicons
                                    name={biometricIcon}
                                    size={30}
                                    color={biometricsAvailable ? (isDark ? '#93c5fd' : '#2563eb') : '#94a3b8'}
                                />
                                <Text className={`mt-1 text-xs font-semibold ${biometricsAvailable ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'
                                    }`}>
                                    {biometricLabel}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}
