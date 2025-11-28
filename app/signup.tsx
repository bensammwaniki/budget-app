import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { router } from 'expo-router';

export default function SignupScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignup = async () => {
        if (!email || !password || !name) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Update profile with name for Personalization
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
        <View className="flex-1 justify-center items-center bg-gray-100 p-6">
            <Text className="text-3xl font-bold text-blue-600 mb-8">Create Account</Text>

            <View className="w-full bg-white p-6 rounded-2xl shadow-sm">

                <TextInput
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 text-gray-800"
                    placeholder="Full Name (for AI Personalization)"
                    value={name}
                    onChangeText={setName}
                />

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
                    onPress={handleSignup}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Sign Up</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.back()} className="mt-4 items-center">
                    <Text className="text-blue-600 font-bold">Back to Login</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
