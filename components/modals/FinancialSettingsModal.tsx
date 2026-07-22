import DateTimePicker from "@react-native-community/datetimepicker";
import { Image as ExpoImage } from "expo-image";
import React from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    getFinancialMonthRange,
} from "../../services/financialSettingsService";

interface FinancialSettingsModalProps {
  visible: boolean;
  colorScheme?: string | null;
  financialMonthDraft: number;
  onSelectDay: (day: number) => void;
  onSaveMonthStart: () => void;
  liquidCashAmount: string;
  onChangeLiquidCashAmount: (value: string) => void;
  onSaveLiquidCashBaseline: () => void;
  isSaving: boolean;
  resetFromDate: Date;
  onChangeResetFromDate: (date: Date) => void;
  onResetFinancialData: () => void;
  onSyncSms: () => Promise<void> | void;
  isSyncingSms?: boolean;
  onClose: () => void;
}

export default function FinancialSettingsModal({
  visible,
  colorScheme,
  financialMonthDraft,
  onSelectDay,
  onSaveMonthStart,
  liquidCashAmount,
  onChangeLiquidCashAmount,
  onSaveLiquidCashBaseline,
  isSaving,
  resetFromDate,
  onChangeResetFromDate,
  onResetFinancialData,
  onSyncSms,
  isSyncingSms = false,
  onClose,
}: FinancialSettingsModalProps) {
  const isDark = colorScheme === "dark";
  const [showResetDatePicker, setShowResetDatePicker] = React.useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/60 px-6">
        <View className="bg-white dark:bg-slate-900 w-full rounded-[16px] overflow-hidden max-h-[88%]">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="p-6 border-b border-gray-100 dark:border-slate-800">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-slate-900 dark:text-white">
                    Financial Settings
                  </Text>
                  <Text className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    Choose the day your money month starts and decide what you
                    want to hide or reset.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-slate-800"
                >
                  <ExpoImage
                    source={require("../../assets/svg/close.svg")}
                    style={{ width: 12, height: 12 }}
                    contentFit="contain"
                    tintColor={isDark ? "#fff" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View className="p-5">
              <View className="mb-5">
                <Text className="text-slate-900 dark:text-white font-bold text-sm mb-3">
                  Month Start Day
                </Text>
                <View className="bg-gray-50 dark:bg-slate-800/60 rounded-[14px] p-3">
                  <View className="flex-row justify-between mb-3">
                    {[
                      { key: "sun", label: "S" },
                      { key: "mon", label: "M" },
                      { key: "tue", label: "T" },
                      { key: "wed", label: "W" },
                      { key: "thu", label: "T" },
                      { key: "fri", label: "F" },
                      { key: "sat", label: "S" },
                    ].map((day) => (
                      <Text
                        key={day.key}
                        className="w-[14.2%] text-center text-[11px] font-bold text-slate-400 dark:text-slate-500"
                      >
                        {day.label}
                      </Text>
                    ))}
                  </View>

                  <View className="flex-row flex-wrap">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
                      const selected = financialMonthDraft === day;
                      return (
                        <TouchableOpacity
                          key={day}
                          onPress={() => onSelectDay(day)}
                          className="w-[14.2%] aspect-square items-center justify-center"
                        >
                          <View
                            className={`w-10 h-10 rounded-full items-center justify-center ${selected ? "bg-blue-600" : "bg-transparent"}`}
                          >
                            <Text
                              className={`font-semibold text-sm ${selected ? "text-white" : "text-slate-700 dark:text-slate-200"}`}
                            >
                              {day}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onSaveMonthStart}
                  disabled={isSaving}
                  className="mt-3 py-3 rounded-xl items-center bg-slate-900 dark:bg-slate-100"
                >
                  <Text className="text-white dark:text-slate-900 font-bold">
                    Save month start
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="rounded-[12px] bg-gray-50 dark:bg-slate-800/70 p-4 mb-5">
                <Text className="text-slate-900 dark:text-white font-bold text-sm">
                  Current Cycle Preview
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  Right now, this month in the app starts on{" "}
                  {getFinancialMonthRange(
                    new Date(),
                    financialMonthDraft,
                  ).start.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  .
                </Text>
              </View>

              <View className="rounded-[12px] border border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/20 p-4 mb-5">
                <Text className="text-blue-800 dark:text-blue-200 font-bold text-sm">
                  Set liquid cash baseline
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  Enter the cash, bank, and M-Pesa total you actually have right now.
                  From this date forward, the app will calculate changes automatically.
                </Text>
                <View className="mt-3 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-900 px-3 py-3">
                  <Text className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-bold mb-2">
                    Opening liquid cash
                  </Text>
                  <TextInput
                    value={liquidCashAmount}
                    onChangeText={onChangeLiquidCashAmount}
                    keyboardType="numeric"
                    placeholder="e.g. 600"
                    placeholderTextColor="#94a3b8"
                    className="text-slate-900 dark:text-white font-semibold text-base"
                  />
                </View>
                <Text className="text-blue-700 dark:text-blue-300 text-[11px] mt-2">
                  If today you only have KES 600, put 600 here.
                </Text>
                <TouchableOpacity
                  onPress={onSaveLiquidCashBaseline}
                  disabled={isSaving}
                  className="mt-3 py-3 rounded-xl items-center bg-blue-600"
                >
                  <Text className="text-white font-bold">
                    Save liquid baseline
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="rounded-[12px] border border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/20 p-4 mb-5">
                <Text className="text-blue-800 dark:text-blue-200 font-bold text-sm">
                  Sync SMS history
                </Text>
                <Text className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  Re-parse your M-PESA and bank SMS messages to refresh the transaction history.
                </Text>
                <TouchableOpacity
                  onPress={() => onSyncSms()}
                  disabled={isSaving || isSyncingSms}
                  className="mt-3 py-3 rounded-xl items-center bg-blue-600"
                >
                  {isSyncingSms ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator size="small" color="#fff" />
                      <Text className="text-white font-bold ml-2">
                        Syncing…
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-white font-bold">Sync SMS history</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View className="rounded-[12px] border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/20 p-4 mb-5">
                <Text className="text-red-800 dark:text-red-200 font-bold text-sm">
                  Reset financial data from a date
                </Text>
                <Text className="text-red-700 dark:text-red-300 text-xs mt-1">
                  Permanently removes financial history on this date and every
                  date before it. Categories and automation stay.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowResetDatePicker(true)}
                  disabled={isSaving}
                  className="mt-3 px-3 py-3 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 flex-row justify-between items-center"
                >
                  <Text className="text-slate-900 dark:text-white font-semibold">
                    {resetFromDate.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                  <Text className="text-red-600 dark:text-red-300 font-bold text-xs">
                    Choose date
                  </Text>
                </TouchableOpacity>
                {showResetDatePicker && (
                  <DateTimePicker
                    value={resetFromDate}
                    mode="date"
                    maximumDate={new Date()}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_event, date) => {
                      setShowResetDatePicker(Platform.OS === "ios");
                      if (date) onChangeResetFromDate(date);
                    }}
                  />
                )}
                <TouchableOpacity
                  onPress={onResetFinancialData}
                  disabled={isSaving}
                  className="mt-3 py-3 rounded-xl items-center bg-red-600"
                >
                  <Text className="text-white font-bold">
                    Reset history through this date
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <View className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900" />
        </View>
      </View>
    </Modal>
  );
}
