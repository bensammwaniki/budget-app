import { Image } from 'expo-image';
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

interface CashTransactionModalProps {
  visible: boolean;
  colorScheme?: string | null;
  isDark: boolean;
  saving: boolean;
  cashType: 'SENT' | 'RECEIVED';
  cashAmount: string;
  cashNote: string;
  cashAccountId: 'ACC-CASH-DEFAULT' | 'ACC-MPESA-DEFAULT';
  isRecurring: boolean;
  onChangeType: (type: 'SENT' | 'RECEIVED') => void;
  onChangeAmount: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeAccountId: (accountId: 'ACC-CASH-DEFAULT' | 'ACC-MPESA-DEFAULT') => void;
  onChangeRecurring: (value: boolean) => void;
  onSave: () => void;
  onManageRecurring: () => void;
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
  cashAccountId,
  isRecurring,
  onChangeType,
  onChangeAmount,
  onChangeNote,
  onChangeAccountId,
  onChangeRecurring,
  onSave,
  onManageRecurring,
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
                <Text className="text-slate-900 dark:text-white text-xl font-black">Add Manual</Text>
                <TouchableOpacity onPress={() => !saving && onClose()}>
                  <Image
                    source={require('../../assets/svg/close.svg')}
                    style={{ width: 14, height: 14 }}
                    tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              </View>

              <View className="flex-row gap-3 mb-5">

                {/* Transaction Type */}
                <View className="flex-1">
                  <Text className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1 text-center">
                    Type
                  </Text>

                  <View className="flex-row bg-slate-100 dark:bg-slate-800 p-1 rounded-full">
                    <TouchableOpacity
                      onPress={() => onChangeType('SENT')}
                      className={`flex-1 py-2 rounded-full items-center ${
                        cashType === 'SENT' ? 'bg-red-500' : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          cashType === 'SENT'
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Expense
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onChangeType('RECEIVED')}
                      className={`flex-1 py-2 rounded-full items-center ${
                        cashType === 'RECEIVED' ? 'bg-green-500' : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          cashType === 'RECEIVED'
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Income
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Account */}
                <View className="flex-1">
                  <Text className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold mb-1 text-center">
                    Account
                  </Text>

                  <View className="flex-row bg-slate-100 dark:bg-slate-800 p-1 rounded-full">
                    <TouchableOpacity
                      onPress={() => onChangeAccountId('ACC-CASH-DEFAULT')}
                      className={`flex-1 py-2 rounded-full items-center ${
                        cashAccountId === 'ACC-CASH-DEFAULT' ? 'bg-blue-500' : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          cashAccountId === 'ACC-CASH-DEFAULT'
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Cash
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onChangeAccountId('ACC-MPESA-DEFAULT')}
                      className={`flex-1 py-2 rounded-full items-center ${
                        cashAccountId === 'ACC-MPESA-DEFAULT' ? 'bg-emerald-500' : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          cashAccountId === 'ACC-MPESA-DEFAULT'
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        M-PESA
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

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

              <View className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-slate-900 dark:text-white font-bold text-sm">Recurring Monthly</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">Auto-create this transaction on day 1 of each new month.</Text>
                  </View>
                  <Switch
                    value={isRecurring}
                    onValueChange={onChangeRecurring}
                    disabled={saving}
                    trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={onManageRecurring}
                disabled={saving}
                className="mb-5 py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600"
              >
                <Text className="font-bold text-slate-700 dark:text-slate-200">Manage Recurring Transactions</Text>
              </TouchableOpacity>

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
