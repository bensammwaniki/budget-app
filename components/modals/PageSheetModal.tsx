import { Image } from 'expo-image';
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';

interface PageSheetModalProps {
  visible: boolean;
  title: string;
  colorScheme?: string | null;
  onClose: () => void;
  keyboardAvoiding?: boolean;
  children: React.ReactNode;
}

export default function PageSheetModal({
  visible,
  title,
  colorScheme,
  onClose,
  keyboardAvoiding = false,
  children,
}: PageSheetModalProps) {
  const isDark = colorScheme === 'dark';
  const content = (
    <View className="flex-1 app-screen pt-6 mt-6">
      <View className="px-6 pb-4 flex-row justify-between items-center border-b border-gray-200 dark:border-slate-800">
        <Text className="text-xl font-bold text-slate-900 dark:text-white">{title}</Text>
        <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
          <Image
            source={require('../../assets/svg/close.svg')}
            style={{ width: 18, height: 18 }}
            tintColor={isDark ? '#94a3b8' : '#64748b'}
            contentFit="contain"
          />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </Modal>
  );
}
