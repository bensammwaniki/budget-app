import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../services/firebaseConfig';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function SignupScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSignup = async () => {
        if (!email || !password || !name) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: name
            });
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert('Signup Failed', error.message);
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
                contentContainerClassName="flex-grow"
                className="flex-1"
            >
                <View className="flex-1 justify-center items-center px-6 py-12">
                    {/* Back Button */}
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="absolute top-12 left-6 bg-[#1e293b] p-3 rounded-full border border-slate-700"
                    >
                        <FontAwesome name="arrow-left" size={20} color="white" />
                    </TouchableOpacity>

                    {/* Logo/Brand Section */}
                    <View className="mb-10 items-center mt-12">
                        <View className="w-20 h-20 bg-blue-600/20 rounded-full items-center justify-center mb-4 border border-blue-500/30">
                            <FontAwesome name="user-plus" size={32} color="#3b82f6" />
                        </View>
                        <Text className="text-3xl font-bold text-white mb-2">Create Account</Text>
                        <Text className="text-slate-400 text-base">Join Fanga Budget today</Text>
                    </View>

                    {/* Signup Card */}
                    <View className="w-full max-w-md bg-[#1e293b] rounded-3xl p-8 border border-slate-700 shadow-xl">

                        {/* Name Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-300 mb-2 ml-1">Full Name</Text>
                            <View className="flex-row items-center bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                <FontAwesome name="user" size={20} color="#94a3b8" />
                                <TextInput
                                    className="flex-1 ml-3 text-white text-base"
                                    placeholder="Your full name"
                                    value={name}
                                    onChangeText={setName}
                                    placeholderTextColor="#64748b"
                                />
                            </View>
                            <Text className="text-xs text-slate-500 mt-1.5 ml-1">Used for AI personalization</Text>
                        </View>

                        {/* Email Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</Text>
                            <View className="flex-row items-center bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                <FontAwesome name="envelope" size={18} color="#94a3b8" />
                                <TextInput
                                    className="flex-1 ml-3 text-white text-base"
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
                                    className="flex-1 ml-3 text-white text-base"
                                    placeholder="Create a password"
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

                        {/* Signup Button */}
                        <TouchableOpacity
                            className="w-full bg-blue-600 rounded-xl py-4 items-center mb-6 shadow-lg shadow-blue-900/50"
                            onPress={handleSignup}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">Create Account</Text>
                            )}
                        </TouchableOpacity>

                        {/* Terms */}
                        <Text className="text-center text-xs text-slate-500">
                            By signing up, you agree to our Terms & Privacy Policy
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
