import { FontAwesome } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Image as ExpoImage } from 'expo-image';
import { Link, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../services/firebaseConfig';

export default function LoginScreen() {
    const { colorScheme } = useColorScheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        // Configure Google Sign-In
        GoogleSignin.configure({
            webClientId: '638697871062-vful4b4acggaa510o2so0gtod6i1il64.apps.googleusercontent.com',
        });
    }, []);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert('Login Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        try {
            // Check if device supports Google Play Services
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

            // Sign in with Google
            const userInfo = await GoogleSignin.signIn();

            // Create Firebase credential with the Google ID token
            const googleCredential = GoogleAuthProvider.credential(userInfo.data?.idToken);

            // Sign in to Firebase with the credential
            await signInWithCredential(auth, googleCredential);
            router.replace('/(tabs)');
        } catch (error: any) {
            if (error.code === 'sign_in_cancelled') {
                // User cancelled the sign-in flow
                console.log('User cancelled Google Sign-In');
            } else if (error.code === 'in_progress') {
                // Sign-in already in progress
                console.log('Google Sign-In already in progress');
            } else if (error.code === 'play_services_not_available') {
                Alert.alert('Error', 'Google Play Services not available on this device');
            } else {
                console.error('Google Sign-In error:', error);
                Alert.alert('Google Sign-In Failed', error.message || 'An error occurred during sign-in');
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-gray-50 dark:bg-[#020617]"
        >
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <ScrollView
                contentContainerClassName="flex-grow justify-center"
                className="flex-1"
            >
                <SafeAreaView className="flex-1 justify-center items-center px-6">
                    {/* Logo/Brand Section */}
                    <View className="mb-6 items-center">
                        <View className="w-24 h-24 bg-blue-100 dark:bg-blue-600/20 rounded-full items-center justify-center mb-2 mt-6 border border-blue-200 dark:border-blue-500/30">
                            <ExpoImage
                                source={require('../../assets/svg/favicon.svg')}
                                style={{ width: 48, height: 48 }}
                                contentFit="contain"
                            />
                        </View>
                        <Text className="text-4xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">Fanga Budget</Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-base">Take Charge of your finances</Text>
                    </View>

                    {/* Login Card */}
                    <View className="w-full max-w-md bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-200 dark:border-slate-700 shadow-lg">
                        <Text className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Welcome Back</Text>
                        <Text className="text-slate-500 dark:text-slate-400 mb-8">Sign in to access your dashboard</Text>

                        {/* Email Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 ml-1">Email Address</Text>
                            <View className="flex-row items-center bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                <FontAwesome name="envelope" size={18} color={colorScheme === 'dark' ? "#94a3b8" : "#64748b"} />
                                <TextInput
                                    className="flex-1 ml-3 text-slate-900 dark:text-white text-base outline-none"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                        </View>

                        {/* Password Input */}
                        <View className="mb-8">
                            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 ml-1">Password</Text>
                            <View className="flex-row items-center bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5">
                                <FontAwesome name="lock" size={20} color={colorScheme === 'dark' ? "#94a3b8" : "#64748b"} />
                                <TextInput
                                    className="flex-1 ml-3 text-slate-900 dark:text-white text-base outline-none"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    placeholderTextColor="#94a3b8"
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <FontAwesome
                                        name={showPassword ? "eye" : "eye-slash"}
                                        size={18}
                                        color={colorScheme === 'dark' ? "#94a3b8" : "#64748b"}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Login Button */}
                        <TouchableOpacity
                            className="w-full bg-blue-600 rounded-xl py-4 items-center mb-6 shadow-lg shadow-blue-500/30 dark:shadow-blue-900/50"
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">Sign In</Text>
                            )}
                        </TouchableOpacity>

                        {/* Sign Up Link */}
                        <View className="flex-row justify-center">
                            <Text className="text-slate-500 dark:text-slate-400">Don't have an account? </Text>
                            <Link href="/signup" asChild>
                                <TouchableOpacity>
                                    <Text className="text-blue-600 dark:text-blue-400 font-bold">Sign Up</Text>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>

                    {/* Social Login Section */}
                    <View className="mt-10 w-full max-w-md">
                        <View className="flex-row items-center mb-3">
                            <View className="flex-1 h-px bg-gray-200 dark:bg-slate-800" />
                            <Text className="mx-4 text-slate-400 dark:text-slate-500 font-medium">Or continue with</Text>
                            <View className="flex-1 h-px bg-gray-200 dark:bg-slate-800" />
                        </View>

                        <TouchableOpacity
                            className="w-full bg-white dark:bg-[#1e293b] mb-6 p-4 rounded-xl border border-gray-200 dark:border-slate-700 items-center flex-row justify-center"
                            onPress={handleGoogleSignIn}
                            disabled={googleLoading}
                        >
                            {googleLoading ? (
                                <ActivityIndicator color={colorScheme === 'dark' ? "#fff" : "#000"} />
                            ) : (
                                <>
                                    <FontAwesome name="google" size={20} color={colorScheme === 'dark' ? "#fff" : "#000"} />
                                    <Text className="ml-2 font-semibold text-slate-700 dark:text-slate-200">Sign in with Google</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
