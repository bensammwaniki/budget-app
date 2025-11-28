import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { Link, router } from 'expo-router';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

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
        <View className="flex-1 justify-center items-center bg-gray-100 p-6">
            <Text className="text-3xl font-bold text-blue-600 mb-8">Fanga Budget</Text>

            <View className="w-full bg-white p-6 rounded-2xl shadow-sm">
                <Text className="text-xl font-semibold mb-4 text-gray-800">Welcome Back</Text>

                <TextInput
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 text-gray-800"
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-gray-800"
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    className="w-full bg-blue-600 p-4 rounded-lg items-center mb-4"
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Sign In</Text>
                    )}
                </TouchableOpacity>

                <View className="flex-row justify-center mt-4">
                    <Text className="text-gray-600">Don't have an account? </Text>
                    <Link href="/signup" asChild>
                        <TouchableOpacity>
                            <Text className="text-blue-600 font-bold">Sign Up</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>

            <View className="mt-8 w-full">
                <Text className="text-center text-gray-500 mb-4">Or continue with</Text>
                <View className="flex-row justify-between space-x-4">
                    {/* Placeholders for Google and Phone Auth */}
                    <TouchableOpacity className="flex-1 bg-white p-4 rounded-lg border border-gray-200 items-center">
                        <Text className="font-semibold text-gray-700">Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 bg-white p-4 rounded-lg border border-gray-200 items-center">
                        <Text className="font-semibold text-gray-700">Phone</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
