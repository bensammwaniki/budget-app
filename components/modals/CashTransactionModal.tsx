import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface CashTransactionModalProps {
  visible: boolean;
  colorScheme?: string | null;
  isDark: boolean;
  saving: boolean;
  cashType: 'SENT' | 'RECEIVED';
  cashAmount: string;
  cashNote: string;
  onChangeType: (type: 'SENT' | 'RECEIVED') => void;
  onChangeAmount: (value: string) => void;
  onChangeNote: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onCancel: () => void;
}

export default function CashTransactionModal({
  visible,
  colorScheme,
  isDark,
  saving,
  cashType,
  cashAmount,
  cashNote,
  onChangeType,
  onChangeAmount,
  onChangeNote,
  onSave,
  onClose,
  onCancel,
}: CashTransactionModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <TouchableOpacity className="flex-1 bg-black/50 justify-center items-center p-6" activeOpacity={1} onPress={() => !saving && onClose()}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="w-full max-h-[85%] bg-white dark:bg-[#0f172a] rounded-xl p-6 border border-slate-200 dark:border-slate-800"
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row justify-between items-center mb-5">
                <Text className="text-slate-900 dark:text-white text-xl font-black">Add Cash Transaction</Text>
                <TouchableOpacity onPress={() => !saving && onClose()}>
                  <Image
                    source={require('../../assets/svg/close.svg')}
                    style={{ width: 14, height: 14 }}
                    tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              </View>

              <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Transaction Type</Text>
              <View className="flex-row gap-2 mb-4">
                <TouchableOpacity
                  onPress={() => onChangeType('SENT')}
                  className={`flex-1 py-3 rounded-xl items-center border ${cashType === 'SENT' ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                >
                  <Text className={`font-bold ${cashType === 'SENT' ? 'text-red-600 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}>
                    Expense
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onChangeType('RECEIVED')}
                  className={`flex-1 py-3 rounded-xl items-center border ${cashType === 'RECEIVED' ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                >
                  <Text className={`font-bold ${cashType === 'RECEIVED' ? 'text-green-600 dark:text-green-300' : 'text-slate-600 dark:text-slate-300'}`}>
                    Income
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Amount (KES)</Text>
              <View className="h-12 rounded-xl px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 justify-center mb-4">
                <TextInput
                  value={cashAmount}
                  onChangeText={onChangeAmount}
                  placeholder="0"
                  placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
                  keyboardType="numeric"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                />
              </View>

              <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">Note (Optional)</Text>
              <View className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-5">
                <TextInput
                  value={cashNote}
                  onChangeText={onChangeNote}
                  placeholder={cashType === 'SENT' ? 'What was this expense for?' : 'Where did this cash come from?'}
                  placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
                  className="text-slate-900 dark:text-white"
                />
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity onPress={onCancel} disabled={saving} className="flex-1 py-3 rounded-xl items-center bg-slate-100 dark:bg-slate-800">
                  <Text className="font-bold text-slate-700 dark:text-slate-200">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onSave} disabled={saving} className="flex-1 py-3 rounded-xl items-center bg-blue-600">
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-bold text-white">Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
