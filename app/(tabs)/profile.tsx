import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../services/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function ProfileScreen() {
    const { signOut, user } = useAuth();

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
        <ScrollView className="flex-1 bg-[#020617]">
            <StatusBar style="light" />
            {/* Header with user info */}
            <View className="px-6 pt-16 pb-12 items-center bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg">
                <View className="w-24 h-24 bg-[#1e293b] rounded-full items-center justify-center mb-4 shadow-xl border border-slate-700">
                    <Text className="text-4xl text-white font-bold">{user?.displayName?.charAt(0) || '👤'}</Text>
                </View>
                <Text className="text-white text-2xl font-bold mb-1">{user?.displayName || 'User'}</Text>
                <Text className="text-slate-400 text-sm">{user?.email}</Text>
            </View>

            {/* Profile Options List */}
            <View className="px-6 mt-8">
                <View className="bg-[#1e293b] rounded-2xl shadow-lg border border-slate-700 overflow-hidden">
                    {[
                        { icon: 'user', label: 'Edit Profile', color: '#3b82f6' },
                        { icon: 'bell', label: 'Notifications', color: '#8b5cf6' },
                        { icon: 'shield', label: 'Privacy & Security', color: '#10b981' },
                        { icon: 'question-circle', label: 'Help & Support', color: '#f59e0b' },
                    ].map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            className={`flex-row items-center p-4 ${index !== 3 ? 'border-b border-slate-700' : ''}`}
                        >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-[#0f172a] border border-slate-700">
                                <FontAwesome name={item.icon as any} size={18} color={item.color} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-semibold text-base">{item.label}</Text>
                            </View>
                            <FontAwesome name={item.icon === 'question-circle' ? 'question-circle' : 'angle-right'} size={20} color="#64748b" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    onPress={handleSignOut}
                    className="bg-red-500/10 border border-red-500/50 rounded-2xl p-4 mt-8 mb-8 flex-row items-center justify-center"
                >
                    <FontAwesome name="sign-out" size={20} color="#ef4444" />
                    <Text className="text-red-500 font-bold text-base ml-2">Sign Out</Text>
                </TouchableOpacity>

                <Text className="text-center text-slate-600 text-xs mb-8">Version 1.0.0</Text>
            </View>
        </ScrollView>
    );
}
