import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../services/AuthContext';

export default function ProfileScreen() {
    const { signOut, user } = useAuth();
    const { colorScheme, toggleColorScheme } = useColorScheme();

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: signOut
                },
            ]
        );
    };

    return (
        <ScrollView className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            {/* Header with user info */}
            <View className="px-6 pt-16 pb-12 items-center bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg">
                <View className="w-24 h-24 bg-gray-100 dark:bg-[#1e293b] rounded-full items-center justify-center mb-4 shadow-xl border border-gray-200 dark:border-slate-700">
                    <Text className="text-4xl text-slate-800 dark:text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                </View>
                <Text className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{user?.displayName || 'User'}</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-sm">{user?.email}</Text>
            </View>

            {/* Profile Options List */}
            <View className="px-6 mt-8">
                <View className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    {/* Dark Mode Toggle */}
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700">
                                <FontAwesome name={colorScheme === 'dark' ? 'moon-o' : 'sun-o'} size={18} color={colorScheme === 'dark' ? '#8b5cf6' : '#f59e0b'} />
                            </View>
                            <Text className="text-slate-800 dark:text-white font-semibold text-base">Dark Mode</Text>
                        </View>
                        <Switch
                            value={colorScheme === 'dark'}
                            onValueChange={toggleColorScheme}
                            trackColor={{ false: '#e2e8f0', true: '#8b5cf6' }}
                            thumbColor={'#ffffff'}
                        />
                    </View>

                    {[
                        { icon: 'user', label: 'Edit Profile', color: '#3b82f6' },
                        { icon: 'bell', label: 'Notifications', color: '#8b5cf6' },
                        { icon: 'shield', label: 'Privacy & Security', color: '#10b981' },
                        { icon: 'question-circle', label: 'Help & Support', color: '#f59e0b' },
                    ].map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            className={`flex-row items-center p-4 ${index !== 3 ? 'border-b border-gray-100 dark:border-slate-700' : ''}`}
                        >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700">
                                <FontAwesome name={item.icon as any} size={18} color={item.color} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-slate-800 dark:text-white font-semibold text-base">{item.label}</Text>
                            </View>
                            <FontAwesome name={item.icon === 'question-circle' ? 'question-circle' : 'angle-right'} size={20} color="#94a3b8" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    onPress={handleSignOut}
                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-2xl p-4 mt-8 mb-8 flex-row items-center justify-center"
                >
                    <FontAwesome name="sign-out" size={20} color="#ef4444" />
                    <Text className="text-red-500 font-bold text-base ml-2">Sign Out</Text>
                </TouchableOpacity>

                <Text className="text-center text-slate-400 dark:text-slate-600 text-xs mb-8">Version 1.0.0</Text>
            </View>
        </ScrollView>
    );
}
