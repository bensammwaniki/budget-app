import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SavingsGoal } from '../../services/savingsService';

interface SelectSavingsGoalSheetProps {
  visible: boolean;
  amount?: number;
  goals: SavingsGoal[];
  linkingGoal: string | null;
  onClose: () => void;
  onSelectGoal: (goalId: string) => void;
}

export default function SelectSavingsGoalSheet({
  visible,
  amount,
  goals,
  linkingGoal,
  onClose,
  onSelectGoal,
}: SelectSavingsGoalSheetProps) {
  if (!visible) return null;

  return (
    <View className="absolute z-50 top-0 left-0 right-0 bottom-[100px] bg-black/40 justify-end">
      <View className="bg-white dark:bg-[#0f172a] rounded-t-[12px] p-6 pb-12 border-t border-slate-200 dark:border-slate-800">
        <View className="flex-row justify-between flex-wrap gap-y-3 items-center mb-6">
          <Text className="text-xl font-bold text-slate-900 dark:text-white">Select a Savings Goal</Text>
          <TouchableOpacity onPress={onClose}>
            <Image
              source={require('../../assets/svg/close.svg')}
              style={{ width: 10, height: 10 }}
            />
          </TouchableOpacity>
        </View>
        <Text className="text-slate-500 dark:text-slate-400 mb-4">
          Where would you like to transfer KES {amount?.toLocaleString()}?
        </Text>

        {goals.length === 0 ? (
          <Text className="text-center text-slate-500 mt-4 mb-8">No active goals available.</Text>
        ) : (
          <View className="space-y-3">
            {goals.map(goal => (
              <TouchableOpacity
                key={goal.id}
                onPress={() => onSelectGoal(goal.id)}
                disabled={linkingGoal === goal.id}
                className="app-card p-4 flex-row justify-between items-center mb-2"
              >
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${goal.color || '#3b82f6'}20` }}>
                    <FontAwesome name="flag" size={16} color={goal.color || '#3b82f6'} />
                  </View>
                  <View>
                    <Text className="font-bold text-slate-900 dark:text-white">{goal.name}</Text>
                    <Text className="text-xs text-slate-500 mt-1">
                      KES {goal.currentAmount.toLocaleString()} / {goal.targetAmount.toLocaleString()}
                    </Text>
                  </View>
                </View>
                {linkingGoal === goal.id ? (
                  <ActivityIndicator size="small" color={goal.color || '#3b82f6'} />
                ) : (
                  <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
