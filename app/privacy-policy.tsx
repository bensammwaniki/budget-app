import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

export default function PrivacyPolicyScreen() {
    const router = useRouter();
    const { colorScheme } = useColorScheme();

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-[#020617]">
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <View className="px-6 py-4 flex-row items-center border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Image
                            source={require('../assets/svg/back.svg')}
                            style={{ width: 24, height: 24 }}
                            tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                            contentFit="contain"
                        />
                    </TouchableOpacity>
                <Text className="text-xl font-bold text-slate-900 dark:text-white">Privacy & Policy</Text>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View className="mb-8">
                    <Text className="text-slate-500 dark:text-slate-400 text-sm mb-2 uppercase font-bold tracking-wider">Last Updated: December 2025</Text>
                    <Text className="text-slate-900 dark:text-white text-3xl font-bold mb-4">Privacy Policy</Text>
                    <Text className="text-slate-600 dark:text-slate-300 text-base leading-6">
                        We value your privacy and are committed to protecting your personal data. This Privacy Policy explains how Fanga Budget handles your information.
                    </Text>
                </View>

                {/* Section 1: Local Storage */}
                <View className="mb-8 bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-200 dark:border-slate-800">
                    <View className="flex-row items-center mb-3">
                        <View className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center mr-3">
                            <FontAwesome name="database" size={14} color="#3b82f6" />
                        </View>
                        <Text className="text-slate-900 dark:text-white text-lg font-bold">1. Local Data Storage</Text>
                    </View>
                    <Text className="text-slate-600 dark:text-slate-400 text-sm leading-6">
                        Fanga Budget operates accurately on a <Text className="font-bold text-slate-900 dark:text-white">Local-First</Text> basis.
                        All your financial data, including transaction history, categories, and budgets, are stored <Text className="font-bold text-slate-900 dark:text-white">exclusively on your physical device</Text> using an encrypted SQLite database.
                    </Text>
                    <View className="mt-4 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800/50">
                        <Text className="text-green-800 dark:text-green-300 text-xs font-medium">
                            We do not transmit, sync, or back up your financial transaction data to any external server or cloud storage. You retain full ownership and control of your data at all times.
                        </Text>
                    </View>
                </View>

                {/* Section 2: Data Collection */}
                <View className="mb-8 bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-200 dark:border-slate-800">
                    <View className="flex-row items-center mb-3">
                        <View className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 items-center justify-center mr-3">
                            <FontAwesome name="eye-slash" size={14} color="#8b5cf6" />
                        </View>
                        <Text className="text-slate-900 dark:text-white text-lg font-bold">2. No Data Collection</Text>
                    </View>
                    <Text className="text-slate-600 dark:text-slate-400 text-sm leading-6 mb-3">
                        The developer of Fanga Budget does not collect, track, or sell your personal information.
                    </Text>
                    <View className="pl-2 border-l-2 border-slate-200 dark:border-slate-700 ml-1">
                        <Text className="text-slate-600 dark:text-slate-400 text-xs mb-2">• We do not track your location.</Text>
                        <Text className="text-slate-600 dark:text-slate-400 text-xs mb-2">• We do not read your SMS messages for any purpose other than local transaction categorization.</Text>
                        <Text className="text-slate-600 dark:text-slate-400 text-xs">• We do not have access to your bank credentials.</Text>
                    </View>
                </View>

                {/* Section 3: SMS Permissions */}
                <View className="mb-8 bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-200 dark:border-slate-800">
                    <View className="flex-row items-center mb-3">
                        <View className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 items-center justify-center mr-3">
                            <FontAwesome name="envelope" size={14} color="#f97316" />
                        </View>
                        <Text className="text-slate-900 dark:text-white text-lg font-bold">3. SMS Permissions</Text>
                    </View>
                    <Text className="text-slate-600 dark:text-slate-400 text-sm leading-6">
                        The app requests SMS read permissions solely to automate expense tracking. This processing happens <Text className="font-bold">locally on your device</Text>. No SMS content is ever uploaded.
                    </Text>
                </View>

                {/* Section 4: Liability Disclaimer - BIG RED ALERT */}
                <View className="mb-8 bg-red-50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-200 dark:border-red-900/50">
                    <View className="flex-row items-center mb-4">
                        <FontAwesome name="warning" size={24} color="#ef4444" />
                        <Text className="text-red-600 dark:text-red-400 text-lg font-bold ml-3">4. Limitation of Liability</Text>
                    </View>

                    <Text className="text-slate-700 dark:text-slate-300 text-sm leading-6 font-bold mb-3">
                        THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
                    </Text>

                    <Text className="text-slate-600 dark:text-slate-400 text-xs leading-5 mb-3">
                        By using Fanga Budget, you acknowledge and agree that:
                    </Text>
                    <View className="gap-2">
                        <Text className="text-slate-600 dark:text-slate-400 text-xs leading-5">
                            1. The creator/developer shall <Text className="font-bold">NOT be held liable</Text> for any claim, damages, or other liability, including but not limited to financial loss, data loss, or inaccuracies in calculation.
                        </Text>
                        <Text className="text-slate-600 dark:text-slate-400 text-xs leading-5">
                            2. You are solely responsible for verifying the accuracy of your financial records. This app is a tool for estimation and organization, not a certified accounting service.
                        </Text>
                        <Text className="text-slate-600 dark:text-slate-400 text-xs leading-5">
                            3. You are responsible for backing up your own device data. If you lose your phone or delete the app, your data cannot be recovered by us.
                        </Text>
                    </View>
                </View>

                {/* Section 5: Changes to Policy */}
                <View className="mb-8">
                    <Text className="text-slate-900 dark:text-white text-lg font-bold mb-3">5. Changes to This Policy</Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-sm leading-6">
                        We reserve the right to update or change our Privacy Policy at any time. Your continued use of the Service after we post any modifications to the Privacy Policy on this page will constitute your acknowledgment of the modifications and your consent to abide and be bound by the modified Privacy Policy.
                    </Text>
                </View>

                <View className="items-center mt-4 mb-8">
                    <Text className="text-slate-400 dark:text-slate-600 text-xs text-center mb-1">
                        If you have any questions about this Privacy Policy, please contact the developer:
                    </Text>
                    <Text className="text-blue-500 dark:text-blue-400 text-sm font-semibold">bensammwaniki@gmail.com</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">0743 491 012</Text>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}
