import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { ExportPeriod } from '../../services/exportService';

interface ExportOption {
  key: ExportPeriod;
  label: string;
  description: string;
}

interface ExportPeriodModalProps {
  visible: boolean;
  colorScheme?: string | null;
  options: ExportOption[];
  selectedPeriod: ExportPeriod;
  isExporting: boolean;
  onSelectPeriod: (period: ExportPeriod) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ExportPeriodModal({
  visible,
  colorScheme,
  options,
  selectedPeriod,
  isExporting,
  onSelectPeriod,
  onClose,
  onConfirm,
}: ExportPeriodModalProps) {
  const isDark = colorScheme === 'dark';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50 p-6">
        <View className="bg-white dark:bg-slate-900 rounded-[16px] border border-gray-200 dark:border-slate-700 p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-slate-900 dark:text-white text-lg font-bold">Export Excel (.xlsx)</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <ExpoImage
                source={require('../../assets/svg/close.svg')}
                style={{ width: 14, height: 14 }}
                contentFit="contain"
                tintColor={isDark ? '#fff' : '#64748b'}
              />
            </TouchableOpacity>
          </View>

          <Text className="text-slate-500 dark:text-slate-400 text-xs mb-3">
            Choose a period. Export creates one Excel workbook with multiple sheets.
          </Text>

          <View className="gap-2 mb-5">
            {options.map((option) => {
              const selected = option.key === selectedPeriod;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => onSelectPeriod(option.key)}
                  className={`p-3 rounded-[12px] border ${selected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}
                >
                  <Text className={`font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-white'}`}>
                    {option.label}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{option.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity onPress={onClose} className="flex-1 py-3 rounded-[12px] bg-gray-100 dark:bg-slate-800 items-center">
              <Text className="text-slate-700 dark:text-slate-200 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={isExporting}
              className={`flex-1 py-3 rounded-[12px] items-center ${isExporting ? 'bg-blue-400' : 'bg-blue-600'}`}
            >
              <Text className="text-white font-semibold">Export</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
