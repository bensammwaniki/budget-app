import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Modal, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FreshStartConfig, getFinancialMonthRange, getFreshStartEffectiveDate } from '../../services/financialSettingsService';

const FRESH_START_OPTIONS = [
  {
    key: 'resetBroughtForward' as const,
    title: 'Balance brought forward',
    description: 'Start this month with no carried balance from earlier months.',
  },
  {
    key: 'resetDebts' as const,
    title: 'Debt carry state',
    description: 'Treat older debt progress as part of your previous cycle.',
  },
  {
    key: 'resetSavings' as const,
    title: 'Savings progress baseline',
    description: 'Start tracking your savings progress fresh from this month.',
  },
  {
    key: 'resetIncome' as const,
    title: 'Income progress baseline',
    description: 'Start income progress tracking fresh from this month.',
  },
  {
    key: 'resetBudgets' as const,
    title: 'Budget and month summaries',
    description: 'Rebuild your monthly summaries and budget flow from this month.',
  },
];

type FreshStartOptions = {
  resetBroughtForward: boolean;
  resetDebts: boolean;
  resetSavings: boolean;
  resetIncome: boolean;
  resetBudgets: boolean;
};

interface FinancialSettingsModalProps {
  visible: boolean;
  colorScheme?: string | null;
  financialMonthDraft: number;
  onSelectDay: (day: number) => void;
  hideInternalTransfersDraft: boolean;
  onToggleHideInternalTransfers: (enabled: boolean) => void;
  freshStartOptions: FreshStartOptions;
  onToggleFreshStartOption: (key: keyof FreshStartOptions, value: boolean) => void;
  freshStartConfig: FreshStartConfig | null;
  isSaving: boolean;
  primaryLabel: string;
  onPrimaryAction: () => void;
  onClose: () => void;
}

export default function FinancialSettingsModal({
  visible,
  colorScheme,
  financialMonthDraft,
  onSelectDay,
  hideInternalTransfersDraft,
  onToggleHideInternalTransfers,
  freshStartOptions,
  onToggleFreshStartOption,
  freshStartConfig,
  isSaving,
  primaryLabel,
  onPrimaryAction,
  onClose,
}: FinancialSettingsModalProps) {
  const isDark = colorScheme === 'dark';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/60 px-6">
        <View className="bg-white dark:bg-slate-900 w-full rounded-[16px] overflow-hidden max-h-[88%]">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="p-6 border-b border-gray-100 dark:border-slate-800">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-slate-900 dark:text-white">Financial Settings</Text>
                  <Text className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    Choose the day your money month starts and decide what you want to hide or reset.
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-slate-800">
                  <ExpoImage
                    source={require('../../assets/svg/close.svg')}
                    style={{ width: 12, height: 12 }}
                    contentFit="contain"
                    tintColor={isDark ? '#fff' : '#64748b'}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View className="p-5">
              <View className="mb-5">
                <Text className="text-slate-900 dark:text-white font-bold text-sm mb-3">Month Start Day</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2 pr-4">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
                      const selected = financialMonthDraft === day;
                      return (
                        <TouchableOpacity
                          key={day}
                          onPress={() => onSelectDay(day)}
                          className={`px-4 py-2 rounded-full ${selected ? 'bg-blue-600' : 'bg-gray-100 dark:bg-slate-800'}`}
                        >
                          <Text className={`font-semibold text-sm ${selected ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                            Day {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              <View className="rounded-[12px] bg-gray-50 dark:bg-slate-800/70 p-4 mb-5">
                <Text className="text-slate-900 dark:text-white font-bold text-sm">Current Cycle Preview</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  Right now, this month in the app starts on{' '}
                  {getFinancialMonthRange(new Date(), financialMonthDraft).start.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  .
                </Text>
              </View>

              <View className="rounded-[12px] bg-gray-50 dark:bg-slate-800/70 p-4 mb-5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-slate-900 dark:text-white font-bold text-sm">Hide Internal Transfers</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                      Hide money moves between your own accounts so they do not clutter your summaries and recent transactions.
                    </Text>
                  </View>
                  <Switch
                    value={hideInternalTransfersDraft}
                    onValueChange={onToggleHideInternalTransfers}
                    disabled={isSaving}
                    trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>

              <View className="rounded-[12px] bg-gray-50 dark:bg-slate-800/70 p-4 mb-5">
                <Text className="text-slate-900 dark:text-white font-bold text-sm">Start Fresh From This Month</Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1 mb-4">
                  Pick what you want the app to restart from this month. Your transactions and dates will stay the same.
                </Text>

                <View className="gap-3">
                  {FRESH_START_OPTIONS.map((option) => (
                    <View key={option.key} className="flex-row items-center justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-slate-900 dark:text-white font-semibold text-sm">{option.title}</Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">{option.description}</Text>
                      </View>
                      <Switch
                        value={freshStartOptions[option.key]}
                        onValueChange={(value) => onToggleFreshStartOption(option.key, value)}
                        disabled={isSaving}
                        trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                        thumbColor="#ffffff"
                      />
                    </View>
                  ))}
                </View>

                {freshStartConfig && getFreshStartEffectiveDate(freshStartConfig) && (
                  <View className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                    <Text className="text-slate-900 dark:text-white font-semibold text-sm">Active Fresh Start</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                      A fresh start is currently active from{' '}
                      {getFreshStartEffectiveDate(freshStartConfig)?.toLocaleDateString(undefined, {
                        month: 'long',
                        year: 'numeric',
                      })}
                      .
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          <View className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <TouchableOpacity
              onPress={onPrimaryAction}
              disabled={isSaving}
              className={`py-3 rounded-[12px] items-center ${isSaving ? 'bg-slate-400' : 'bg-slate-900 dark:bg-slate-100'}`}
            >
              <Text className="text-white dark:text-slate-900 font-semibold">{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
