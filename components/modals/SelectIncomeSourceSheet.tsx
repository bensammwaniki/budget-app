import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { IncomeSource } from '../../services/incomeService';

interface SelectIncomeSourceSheetProps {
  visible: boolean;
  isDark: boolean;
  amount?: number;
  incomeSources: IncomeSource[];
  linkingIncome: string | null;
  onClose: () => void;
  onSelectIncome: (sourceId: string) => void;
}

export default function SelectIncomeSourceSheet({
  visible,
  isDark,
  amount,
  incomeSources,
  linkingIncome,
  onClose,
  onSelectIncome,
}: SelectIncomeSourceSheetProps) {
  if (!visible) return null;

  return (
    <View className="absolute z-50 top-0 left-0 right-0 bottom-0 bg-black/40 justify-end">
      <View className="bg-white dark:bg-[#0f172a] rounded-t-[32px] p-6 pb-12 border-t border-slate-200 dark:border-slate-800">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-slate-900 dark:text-white">Select Income Source</Text>
          <TouchableOpacity onPress={onClose}>
            <FontAwesome name="times" size={20} color={isDark ? '#94a3b8' : '#64748b'} />
          </TouchableOpacity>
        </View>
        <Text className="text-slate-500 dark:text-slate-400 mb-5">
          Link KES {amount?.toLocaleString()} to which income source?
        </Text>
        <View className="space-y-3">
          {incomeSources.map(src => (
            <TouchableOpacity
              key={src.id}
              onPress={() => onSelectIncome(src.id)}
              disabled={linkingIncome === src.id}
              className="app-card p-4 flex-row justify-between items-center mb-2"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${src.color || '#10b981'}20` }}>
                  <FontAwesome name="arrow-down" size={16} color={src.color || '#10b981'} />
                </View>
                <View>
                  <Text className="font-bold text-slate-900 dark:text-white">{src.name}</Text>
                  {src.isRecurring && (
                    <Text className="text-xs text-slate-500 mt-0.5">{src.frequency}</Text>
                  )}
                </View>
              </View>
              {linkingIncome === src.id
                ? <ActivityIndicator size="small" color={src.color || '#10b981'} />
                : <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
              }
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
