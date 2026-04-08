import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface DueDatePickerModalProps {
  visible: boolean;
  colorScheme?: string | null;
  dueDatePickerYear: number;
  currentMonth: number;
  monthLabels: string[];
  onClose: () => void;
  onSelectMonth: (monthIndex: number, year: number) => void;
  onChangeYear: (nextYear: number) => void;
}

export default function DueDatePickerModal({
  visible,
  colorScheme,
  dueDatePickerYear,
  currentMonth,
  monthLabels,
  onClose,
  onSelectMonth,
  onChangeYear,
}: DueDatePickerModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/50 justify-center items-center p-6" activeOpacity={1} onPress={onClose}>
        <View className="bg-white dark:bg-[#0f172a] w-full rounded-[12px] p-6 border border-slate-200 dark:border-slate-700">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-l uppercase font-bold text-slate-900 dark:text-white text-center flex-1 ml-6">
              Select Month
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Image
                source={require('../../assets/svg/close.svg')}
                style={{ width: 10, height: 10 }}
                tintColor={colorScheme === 'dark' ? '#fff' : '#1e293b'}
                contentFit="contain"
              />
            </TouchableOpacity>
          </View>

          <View className="flex-row flex-wrap justify-between">
            {Array.from({ length: 12 }).map((_, i) => {
              const now = new Date();
              const isPastMonth = dueDatePickerYear === now.getFullYear() && i < now.getMonth();

              return (
                <TouchableOpacity
                  key={i}
                  disabled={isPastMonth}
                  onPress={() => onSelectMonth(i, dueDatePickerYear)}
                  className={`w-[30%] py-2 mb-2 rounded-[8px] items-center ${currentMonth === i ? 'bg-blue-600' : isPastMonth ? 'opacity-20' : 'bg-slate-50 dark:bg-slate-800'}`}
                >
                  <Text className={`font-medium uppercase text-sm ${currentMonth === i ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    {monthLabels[i]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="flex-row justify-center items-center gap-6 mt-4 pt-6 border-t border-slate-100 dark:border-slate-800">
            <TouchableOpacity
              onPress={() => onChangeYear(dueDatePickerYear - 1)}
              className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
            >
              <FontAwesome name="minus" size={10} color="#3b82f6" />
            </TouchableOpacity>
            <Text className="text-xl font-black text-slate-900 dark:text-white">{dueDatePickerYear}</Text>
            <TouchableOpacity
              onPress={() => onChangeYear(dueDatePickerYear + 1)}
              className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
            >
              <FontAwesome name="plus" size={10} color="#3b82f6" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose} className="bg-blue-600 mt-4 py-4 rounded-[12px] items-center">
            <Text className="text-white font-bold text-[14px]">Confirm</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
