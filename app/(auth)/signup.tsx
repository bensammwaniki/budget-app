import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useColorScheme } from 'nativewind';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../services/firebaseConfig';

export default function SignupScreen() {
    const { colorScheme } = useColorScheme();
    const router = useRouter();
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
            className="flex-1 bg-gray-50 dark:bg-[#020617]"
        >
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <ScrollView
                contentContainerClassName="flex-grow"
                className="flex-1"
            >
                <SafeAreaView className="flex-1 justify-center items-center px-6">
                    {/* Back Button */}
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 absolute top-12 left-6 dark:bg-[#1e293b] p-3 z-10">
                        <Image
                            source={require('../../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>

                    {/* Logo/Brand Section */}
                    <View className="mb-10 items-center mt-12">
                        <View className="w-20 h-20 dark:bg-blue-600/20 items-center justify-center mb-4  dark:border-blue-500/30">
                            <Image
                                source={require('../../assets/images/signin.png')}
                                style={{ width: 150, height: 150 }}
                                contentFit="contain"
                            />
                        </View>
                        <Text className="text-xl font-bold text-slate-900 dark:text-white mt-3">Create Account</Text>
                    </View>

                    {/* Signup Card */}
                    <View className="w-full max-w-md bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-200 dark:border-slate-700 shadow-xl">

                        {/* Name Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 ml-1">Full Name</Text>
                            <View className="flex-row items-center bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                    <Image
                                        source={require('../../assets/svg/name.svg')}
                                        style={{ width: 22, height: 22 }}
                                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                                        contentFit="contain"
                                    />
                                <TextInput
                                    className="flex-1 ml-3 text-slate-900 dark:text-white text-base outline-none"
                                    placeholder="Your full name"
                                    value={name}
                                    onChangeText={setName}
                                    placeholderTextColor="#94a3b8"
                                />
                            </View>
                            <Text className="text-xs text-slate-500 dark:text-slate-500 mt-1.5 ml-1">Used for AI personalization</Text>
                        </View>

                        {/* Email Input */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 ml-1">Email Address</Text>
                            <View className="flex-row items-center bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5 focus:border-blue-500">
                                    <Image
                                        source={require('../../assets/svg/email.svg')}
                                        style={{ width: 20, height: 20 }}
                                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                                        contentFit="contain"
                                    />                                
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
                                    <Image
                                        source={require('../../assets/svg/password.svg')}
                                        style={{ width: 26, height: 26 }}
                                        tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                                        contentFit="contain"
                                    />                                  
                                <TextInput
                                    className="flex-1 ml-3 text-slate-900 dark:text-white text-base outline-none"
                                    placeholder="Create a password"
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

                        {/* Signup Button */}
                        <TouchableOpacity
                            className="w-full bg-blue-600 rounded-xl py-4 items-center mb-6 shadow-lg shadow-blue-500/30 dark:shadow-blue-900/50"
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
                </SafeAreaView>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
