import { FontAwesome } from '@expo/vector-icons';
import { Image as ExpoImage, Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type LockTimeoutOption = {
  value: number;
  label: string;
};

interface ProfileEditModalProps {
  visible: boolean;
  colorScheme?: string | null;
  editImage: string | null;
  displayName?: string | null;
  editName: string;
  onChangeName: (value: string) => void;
  editPhone: string;
  onChangePhone: (value: string) => void;
  currentPin: string;
  onChangeCurrentPin: (value: string) => void;
  newPin: string;
  onChangeNewPin: (value: string) => void;
  confirmPin: string;
  onChangeConfirmPin: (value: string) => void;
  biometricLabel: string;
  biometricsSupported: boolean;
  biometricsEnabled: boolean;
  onToggleBiometrics: (enabled: boolean) => void;
  isSecurityUpdating: boolean;
  lockTimeoutMs: number;
  lockTimeoutOptions: LockTimeoutOption[];
  onSelectLockTimeout: (timeoutMs: number) => void;
  isUpdating: boolean;
  onSave: () => void;
  onClose: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
}

export default function ProfileEditModal({
  visible,
  colorScheme,
  editImage,
  displayName,
  editName,
  onChangeName,
  editPhone,
  onChangePhone,
  currentPin,
  onChangeCurrentPin,
  newPin,
  onChangeNewPin,
  confirmPin,
  onChangeConfirmPin,
  biometricLabel,
  biometricsSupported,
  biometricsEnabled,
  onToggleBiometrics,
  isSecurityUpdating,
  lockTimeoutMs,
  lockTimeoutOptions,
  onSelectLockTimeout,
  isUpdating,
  onSave,
  onClose,
  onTakePhoto,
  onPickImage,
}: ProfileEditModalProps) {
  const isDark = colorScheme === 'dark';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white dark:bg-[#1e293b] rounded-t-[16px] p-6 h-[85%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-slate-900 dark:text-white text-xl font-bold">Edit Profile</Text>
              <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
                <ExpoImage
                  source={require('../../assets/svg/close.svg')}
                  style={{ width: 20, height: 20 }}
                  contentFit="contain"
                  tintColor={isDark ? '#fff' : '#64748b'}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <View className="items-center mb-8">
                <View className="w-32 h-32 bg-gray-100 dark:bg-[#0f172a] rounded-full items-center justify-center mb-4 border border-gray-200 dark:border-slate-700 overflow-hidden">
                  {editImage ? (
                    <Image source={{ uri: editImage }} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text className="text-5xl text-slate-800 dark:text-white font-bold">{displayName?.charAt(0) || '👤'}</Text>
                  )}
                </View>
                <View className="flex-row gap-4">
                  <TouchableOpacity onPress={onTakePhoto} className="bg-blue-500 px-4 py-2 rounded-full flex-row items-center">
                    <FontAwesome name="camera" size={14} color="white" />
                    <Text className="text-white font-bold ml-2">Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onPickImage} className="bg-purple-500 px-4 py-2 rounded-full flex-row items-center">
                    <FontAwesome name="image" size={14} color="white" />
                    <Text className="text-white font-bold ml-2">Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-6">
                <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Full Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={onChangeName}
                  placeholder="Enter your name"
                  placeholderTextColor="#94a3b8"
                  className="bg-gray-50 dark:bg-slate-800 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                />
              </View>

              <View className="mb-6">
                <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Phone Number</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={onChangePhone}
                  placeholder="e.g., +254 712 345 678"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  className="bg-gray-50 dark:bg-slate-800 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                />
              </View>

              <View className="mb-6 rounded-[12px] bg-gray-50 dark:bg-slate-800/80 p-4 border border-gray-200 dark:border-slate-700">
                <Text className="text-slate-900 dark:text-white font-bold text-base mb-1">App PIN</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mb-4">
                  Change the 4-digit PIN used to unlock the app.
                </Text>

                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-1 pr-4">
                    <Text className="text-slate-900 dark:text-white font-semibold text-sm">
                      Unlock with {biometricLabel}
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                      {biometricsSupported
                        ? `Allow ${biometricLabel.toLowerCase()} when unlocking the app.`
                        : `${biometricLabel} is not available on this device.`}
                    </Text>
                  </View>
                  <Switch
                    value={biometricsSupported && biometricsEnabled}
                    onValueChange={onToggleBiometrics}
                    disabled={!biometricsSupported || isSecurityUpdating}
                    trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                    thumbColor="#ffffff"
                  />
                </View>

                <View className="mb-5">
                  <Text className="text-slate-900 dark:text-white font-semibold text-sm mb-2">Lock After</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {lockTimeoutOptions.map((option) => {
                      const isSelected = lockTimeoutMs === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() => onSelectLockTimeout(option.value)}
                          disabled={isSecurityUpdating}
                          className={`px-3 py-2 rounded-full ${isSelected ? 'bg-blue-600' : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700'}`}
                        >
                          <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Current PIN</Text>
                  <TextInput
                    value={currentPin}
                    onChangeText={onChangeCurrentPin}
                    placeholder="Enter current PIN"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    className="bg-white dark:bg-slate-900 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">New PIN</Text>
                  <TextInput
                    value={newPin}
                    onChangeText={onChangeNewPin}
                    placeholder="Enter new 4-digit PIN"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    className="bg-white dark:bg-slate-900 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Confirm New PIN</Text>
                  <TextInput
                    value={confirmPin}
                    onChangeText={onChangeConfirmPin}
                    placeholder="Re-enter new PIN"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    className="bg-white dark:bg-slate-900 p-4 rounded-[12px] text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={onSave}
                disabled={isUpdating || isSecurityUpdating}
                className={`bg-slate-900 dark:bg-slate-100 p-4 rounded-[12px] mb-8 ${(isUpdating || isSecurityUpdating) ? 'opacity-50' : ''}`}
              >
                {isUpdating ? (
                  <ActivityIndicator color={isDark ? '#0f172a' : '#ffffff'} />
                ) : (
                  <Text className="text-white dark:text-slate-900 text-center font-bold text-lg">Save Changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
