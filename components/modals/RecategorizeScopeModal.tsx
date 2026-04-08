import { Image } from 'expo-image';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface RecategorizeScopeModalProps {
  visible: boolean;
  colorScheme?: string | null;
  onClose: () => void;
  onJustThis: () => void | Promise<void>;
  onPast: () => void | Promise<void>;
  onFuture: () => void | Promise<void>;
  onAll: () => void | Promise<void>;
}

export default function RecategorizeScopeModal({
  visible,
  colorScheme,
  onClose,
  onJustThis,
  onPast,
  onFuture,
  onAll,
}: RecategorizeScopeModalProps) {
  const defaultTint = colorScheme === 'dark' ? '#fff' : '#3b82f6';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end mb-10">
        <View className="bg-white dark:bg-[#0f172a] rounded-t-[16px] p-6 pb-10">
          <Text className="text-xl font-bold text-slate-900 dark:text-white mb-1">Recategorize Transactions</Text>
          <Text className="text-slate-500 dark:text-slate-400 mb-6 text-sm">How should this change be applied?</Text>

          <View className="gap-y-3">
            <TouchableOpacity onPress={onJustThis} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 items-center justify-center mr-3">
                  <Image source={require('../../assets/svg/transaction.svg')} style={{ width: 16, height: 16 }} tintColor={defaultTint} contentFit="contain" />
                </View>
                <Text className="text-slate-900 dark:text-white font-semibold">Just this transaction</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onPast} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 items-center justify-center mr-3">
                  <Image source={require('../../assets/svg/transaction.svg')} style={{ width: 16, height: 16 }} tintColor={colorScheme === 'dark' ? '#fff' : '#f59e0b'} contentFit="contain" />
                </View>
                <Text className="text-slate-900 dark:text-white font-semibold">Past similar transactions</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onFuture} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 items-center justify-center mr-3">
                  <Image source={require('../../assets/svg/transaction.svg')} style={{ width: 16, height: 16 }} tintColor={colorScheme === 'dark' ? '#fff' : '#a855f7'} contentFit="contain" />
                </View>
                <Text className="text-slate-900 dark:text-white font-semibold">Future transactions</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onAll} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[12px] flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-lg bg-green-100 dark:bg-purple-900/30 items-center justify-center mr-3">
                  <Image source={require('../../assets/svg/transaction.svg')} style={{ width: 16, height: 16 }} tintColor={colorScheme === 'dark' ? '#fff' : '#65f755ff'} contentFit="contain" />
                </View>
                <Text className="text-slate-900 dark:text-white font-bold text-base">Apply to All Transactions</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose} className="bg-red-50 dark:bg-red-900/20 p-4 mt-6 mb-6 rounded-xl items-center border border-red-100 dark:border-red-900/50 justify-center">
            <Text className="text-red-600 dark:text-red-400 font-semibold text-[16px]">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
