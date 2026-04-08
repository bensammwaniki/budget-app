import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface PageSheetSearchModalProps {
  visible: boolean;
  title: string;
  colorScheme?: string | null;
  searchQuery: string;
  onChangeSearch: (value: string) => void;
  onClearSearch: () => void;
  onClose: () => void;
  placeholder?: string;
  useFontAwesomeSearch?: boolean;
  closeIconType?: 'fontawesome' | 'image';
  children: React.ReactNode;
}

export default function PageSheetSearchModal({
  visible,
  title,
  colorScheme,
  searchQuery,
  onChangeSearch,
  onClearSearch,
  onClose,
  placeholder = 'Search by name or amount...',
  useFontAwesomeSearch = false,
  closeIconType = 'image',
  children,
}: PageSheetSearchModalProps) {
  const isDark = colorScheme === 'dark';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 app-screen pt-6 mt-6">
        <View className="px-6 pb-4 flex-row justify-between items-center border-b border-gray-200 dark:border-slate-800">
          <Text className="text-xl font-bold text-slate-900 dark:text-white">{title}</Text>
          <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
            {closeIconType === 'fontawesome' ? (
              <FontAwesome name="times" size={20} color={isDark ? '#94a3b8' : '#64748b'} />
            ) : (
              <Image
                source={require('../../assets/svg/close.svg')}
                style={{ width: 18, height: 18 }}
                tintColor={isDark ? '#94a3b8' : '#64748b'}
                contentFit="contain"
              />
            )}
          </TouchableOpacity>
        </View>

        <View className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
          <View className="flex-row items-center bg-gray-100 dark:bg-slate-800 px-4 py-3 rounded-[12px] border border-slate-200 dark:border-slate-700">
            {useFontAwesomeSearch ? (
              <FontAwesome name="search" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
            ) : (
              <Image
                source={require('../../assets/svg/search.svg')}
                style={{ width: 26, height: 26 }}
                tintColor={isDark ? '#fff' : '#1e293b'}
                contentFit="contain"
              />
            )}
            <TextInput
              className="flex-1 ml-3 text-slate-900 dark:text-white text-[16px]"
              placeholder={placeholder}
              placeholderTextColor={isDark ? '#cbd5e1' : '#94a3b8'}
              value={searchQuery}
              onChangeText={onChangeSearch}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={onClearSearch} className="p-1">
                {useFontAwesomeSearch ? (
                  <FontAwesome name="times-circle" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                ) : (
                  <Image
                    source={require('../../assets/svg/close.svg')}
                    style={{ width: 10, height: 10 }}
                    tintColor={isDark ? '#fff' : '#1e293b'}
                    contentFit="contain"
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {children}
      </View>
    </Modal>
  );
}
