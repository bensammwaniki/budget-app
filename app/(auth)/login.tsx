import { FontAwesome } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../services/firebaseConfig';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-[#020617]"
        >
            <StatusBar style="light" />
            <ScrollView
                contentContainerClassName="flex-grow justify-center"
                className="flex-1"
            >
                <View className="flex-1 justify-center items-center px-6 py-12">
                    {/* Logo/Brand Section */}
                    <View className="mb-12 items-center">
                        <View className="w-24 h-24 bg-blue-600/20 rounded-full items-center justify-center mb-6 border border-blue-500/30">
                            <FontAwesome name="google-wallet" size={48} color="#3b82f6" />
                        </View>
                        <Text className="text-4xl font-bold text-white mb-2 tracking-tight">Fanga Budget</Text>
                        <Text className="text-slate-400 text-base">Take Charge of your finances</Text>
                    </View>

                    {/* Login Card */}
                    <View className="w-full max-w-md bg-[#1e293b] rounded-3xl p-8 border border-slate-700 shadow-xl">
                        <Text className="text-2xl font-bold mb-2 text-white">Welcome Back</Text>
                        <Text className="text-slate-400 mb-8">Sign in to access your dashboard</Text>

                        {/* Email Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</Text>
                            <View className="flex-row items-center bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                <FontAwesome name="envelope" size={18} color="#94a3b8" />
                                <TextInput
                                    className="flex-1 ml-3 text-white text-base outline-none"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    placeholderTextColor="#64748b"
                                />
                            </View>
                        </View>

                        {/* Password Input */}
                        <View className="mb-8">
                            <Text className="text-sm font-semibold text-slate-300 mb-2 ml-1">Password</Text>
                            <View className="flex-row items-center bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3.5">
                                <FontAwesome name="lock" size={20} color="#94a3b8" />
                                <TextInput
                                    className="flex-1 ml-3 text-white text-base outline-none"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    placeholderTextColor="#64748b"
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <FontAwesome
                                        name={showPassword ? "eye" : "eye-slash"}
                                        size={18}
                                        color="#94a3b8"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Login Button */}
                        <TouchableOpacity
                            className="w-full bg-blue-600 rounded-xl py-4 items-center mb-6 shadow-lg shadow-blue-900/50"
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
                            <Text className="text-slate-400">Don't have an account? </Text>
                            <Link href="/signup" asChild>
                                <TouchableOpacity>
                                    <Text className="text-blue-400 font-bold">Sign Up</Text>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>

                    {/* Social Login Section */}
                    <View className="mt-10 w-full max-w-md">
                        <View className="flex-row items-center mb-6">
                            <View className="flex-1 h-px bg-slate-800" />
                            <Text className="mx-4 text-slate-500 font-medium">Or continue with</Text>
                            <View className="flex-1 h-px bg-slate-800" />
                        </View>

                        <View className="flex-row justify-between gap-4">
                            <TouchableOpacity className="flex-1 bg-[#1e293b] p-4 rounded-xl border border-slate-700 items-center flex-row justify-center">
                                <FontAwesome name="google" size={20} color="#fff" />
                                <Text className="ml-2 font-semibold text-slate-200">Google</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="flex-1 bg-[#1e293b] p-4 rounded-xl border border-slate-700 items-center flex-row justify-center">
                                <FontAwesome name="phone" size={20} color="#fff" />
                                <Text className="ml-2 font-semibold text-slate-200">Phone</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
