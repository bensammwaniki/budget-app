import { FontAwesome } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    Extrapolate,
    interpolate,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accountService } from "../../services/accountService";
import { debtService } from "../../services/debtService";
import { Account } from "../../types/account";

function AddDebtScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const editId = typeof params.editId === "string" ? params.editId : undefined;
  const isEditMode = Boolean(editId);

  const [type, setType] = useState<"LIABILITY" | "RECEIVABLE">("LIABILITY");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [isReducingBalance, setIsReducingBalance] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>(
    undefined,
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [expectedPayDate, setExpectedPayDate] = useState<Date | undefined>(
    undefined,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [dueDatePickerYear, setDueDatePickerYear] = useState(
    new Date().getFullYear(),
  );
  const [loading, setLoading] = useState(false);
  const [loadingDebt, setLoadingDebt] = useState(false);

  const scrollY = useSharedValue(0);

  const formatWithCommas = (value: string) => {
    const numeric = value.replace(/,/g, "").replace(/[^0-9]/g, "");
    if (!numeric) return "";
    return parseInt(numeric, 10).toLocaleString();
  };

  const handleAmountChange = (text: string) => {
    setAmount(formatWithCommas(text));
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      accountService.getAccounts().then((accs) => {
        if (active) setAccounts(accs);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    let active = true;
    const loadForEdit = async () => {
      if (!editId) return;
      setLoadingDebt(true);
      try {
        const existing = await debtService.getDebtById(editId);
        if (!existing) {
          Alert.alert("Error", "Debt not found.");
          router.back();
          return;
        }
        if (existing.type === "OVERDRAFT") {
          Alert.alert(
            "Not Allowed",
            "System overdraft debts cannot be edited here.",
          );
          router.back();
          return;
        }
        if (!active) return;

        setType(existing.type === "RECEIVABLE" ? "RECEIVABLE" : "LIABILITY");
        setName(existing.name);
        setAmount(existing.principalAmount.toLocaleString());
        setInterestRate(
          existing.interestRate !== undefined && existing.interestRate !== null
            ? String(existing.interestRate)
            : "",
        );
        setIsReducingBalance(!!existing.isReducingBalance);
        setSelectedAccount(existing.accountId);
        setStartDate(
          existing.startDate ? new Date(existing.startDate) : new Date(),
        );
        setExpectedPayDate(
          existing.dueDate ? new Date(existing.dueDate) : undefined,
        );
        setDueDatePickerYear(
          existing.dueDate
            ? new Date(existing.dueDate).getFullYear()
            : new Date().getFullYear(),
        );
      } catch (error) {
        console.error("Failed to load debt for edit:", error);
        Alert.alert("Error", "Failed to load debt details.");
        router.back();
      } finally {
        if (active) setLoadingDebt(false);
      }
    };

    loadForEdit();
    return () => {
      active = false;
    };
  }, [editId, router]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 50],
      [0, 1],
      Extrapolate.CLAMP,
    );
    const borderOpacity = interpolate(
      scrollY.value,
      [0, 50],
      [0, 0.1],
      Extrapolate.CLAMP,
    );
    return {
      backgroundColor:
        colorScheme === "dark"
          ? `rgba(15, 23, 42, ${opacity})`
          : `rgba(255, 255, 255, ${opacity})`,
      borderBottomColor:
        colorScheme === "dark"
          ? `rgba(255, 255, 255, ${borderOpacity})`
          : `rgba(0, 0, 0, ${borderOpacity})`,
      borderBottomWidth: 1,
    };
  });

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setStartDate(selectedDate);
      // If the start date is moved past the month of due date, reset it
      if (expectedPayDate) {
        const startYear = selectedDate.getFullYear();
        const startMonth = selectedDate.getMonth();
        const dueYear = expectedPayDate.getFullYear();
        const dueMonth = expectedPayDate.getMonth();

        if (
          startYear > dueYear ||
          (startYear === dueYear && startMonth > dueMonth)
        ) {
          setExpectedPayDate(undefined);
        }
      }
    }
  };

  const handleMonthYearSelect = (month: number, year: number) => {
    // Set date to the last day of that month
    const lastDay = new Date(year, month + 1, 0);
    setExpectedPayDate(lastDay);
  };

  const openDueDatePicker = () => {
    const base = expectedPayDate ?? new Date();
    setDueDatePickerYear(base.getFullYear());
    setShowDueDatePicker(true);
  };

  const monthLabels = useMemo(() => {
    const fallback = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    try {
      return Array.from({ length: 12 }, (_, i) =>
        new Date(Date.UTC(2024, i, 1)).toLocaleString(undefined, {
          month: "short",
          timeZone: "UTC",
        }),
      );
    } catch {
      return fallback;
    }
  }, []);

  const projectedInterestValue = useMemo(() => {
    const principal = parseFloat(amount.replace(/,/g, "")) || 0;
    const rate = parseFloat(interestRate) || 0;
    if (principal <= 0 || rate <= 0) return 0;

    if (!isReducingBalance) {
      return principal * (rate / 100);
    }

    if (expectedPayDate) {
      const diffTime = expectedPayDate.getTime() - startDate.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      return principal * (rate / 100 / 365) * diffDays;
    }

    return 0;
  }, [amount, interestRate, isReducingBalance, expectedPayDate, startDate]);

  const projectedTotal = useMemo(() => {
    return (parseFloat(amount.replace(/,/g, "")) || 0) + projectedInterestValue;
  }, [amount, projectedInterestValue]);

  const handleSave = async () => {
    if (!name || !amount) {
      Alert.alert("Missing Fields", "Please enter a name and amount.");
      return;
    }

    setLoading(true);
    try {
      if (editId) {
        await debtService.updateDebt({
          debtId: editId,
          name,
          amount: parseFloat(amount.replace(/,/g, "")),
          interestRate: interestRate ? parseFloat(interestRate) : undefined,
          isReducingBalance,
          startDate,
          dueDate: expectedPayDate,
        });
      } else {
        await debtService.createDebt({
          userId: "local_user",
          type,
          name,
          amount: parseFloat(amount.replace(/,/g, "")),
          accountId: selectedAccount,
          interestRate: interestRate ? parseFloat(interestRate) : undefined,
          isReducingBalance,
          startDate: startDate,
          dueDate: expectedPayDate,
        });
      }
      router.back();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to save debt: ${errorMessage}`);
      console.error("Debt save error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loadingDebt) {
    return (
      <View className="flex-1 app-screen items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 app-screen">
      {/* Header */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            paddingTop: insets.top,
          },
          headerStyle,
        ]}
      >
        <View className="px-6 py-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <Image
              source={require("../../assets/svg/back.svg")}
              style={{ width: 24, height: 24 }}
              tintColor={colorScheme === "dark" ? "#fff" : "#1e293b"}
              contentFit="contain"
            />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900 dark:text-white ml-2">
            {isEditMode
              ? `Edit ${type === "LIABILITY" ? "Debt" : "Loan"}`
              : `Add New ${type === "LIABILITY" ? "Debt" : "Loan"}`}
          </Text>
        </View>
      </Animated.View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 20 : 0}
      >
        <Animated.ScrollView
          className="flex-1"
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          contentContainerStyle={{
            paddingTop: insets.top + 70,
            paddingBottom: 100,
          }}
        >
          <View className="p-6">
            {/* Type Selection */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: colorScheme === "dark" ? "#0f172a" : "#e6edf3",
                padding: 4,
                borderRadius: 50,
                marginBottom: 24,
              }}
            >
              <TouchableOpacity
                onPress={() => !isEditMode && setType("LIABILITY")}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 50,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    type === "LIABILITY"
                      ? colorScheme === "dark"
                        ? "#334155"
                        : "#ffffff"
                      : "transparent",
                }}
                disabled={isEditMode}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontWeight: "700",
                    color:
                      type === "LIABILITY"
                        ? colorScheme === "dark"
                          ? "#ffffff"
                          : "#0f172a"
                        : "#64748b",
                  }}
                >
                  I Owe (Liability)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => !isEditMode && setType("RECEIVABLE")}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 50,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    type === "RECEIVABLE"
                      ? colorScheme === "dark"
                        ? "#334155"
                        : "#ffffff"
                      : "transparent",
                }}
                disabled={isEditMode}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontWeight: "700",
                    color:
                      type === "RECEIVABLE"
                        ? colorScheme === "dark"
                          ? "#ffffff"
                          : "#0f172a"
                        : "#64748b",
                  }}
                >
                  Owed to Me
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">
              {type === "LIABILITY" ? "Lender Name" : "Borrower Name"}
            </Text>
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
              <TextInput
                className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                placeholder={
                  type === "LIABILITY"
                    ? "e.g. Fuliza, Bank, John"
                    : "e.g. John, Alice"
                }
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">
              Total Amount (Principal)
            </Text>
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-1 mb-6 border border-slate-200 dark:border-slate-700">
              <Text className="text-slate-400 font-bold mr-2">KES</Text>
              <TextInput
                className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                placeholder="0"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2 uppercase tracking-wider">
              Interest Rate (%) (Optional)
            </Text>
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-1 mb-4 border border-slate-200 dark:border-slate-700">
              <TextInput
                className="flex-1 text-slate-900 dark:text-white font-semibold text-[14px]"
                placeholder="e.g. 12.5"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={interestRate}
                onChangeText={setInterestRate}
              />
              <Text className="text-slate-400 font-bold ml-2">%</Text>
            </View>

            {/* Reducing Balance Toggle */}
            <View className="flex-row items-center justify-between mb-6 bg-slate-50 dark:bg-slate-800/50 rounded-[12px] px-4 py-3 border border-slate-200 dark:border-slate-700">
              <View className="flex-1 pr-4">
                <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Reducing Balance Rate
                </Text>
                <Text className="text-xs text-slate-500 mt-1 leading-snug">
                  Repayments reduce the principal used to calculate future
                  interest.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsReducingBalance(!isReducingBalance)}
                className={`w-12 h-6 rounded-full justify-center p-1 ${isReducingBalance ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700"}`}
              >
                <Animated.View
                  className="w-4 h-4 rounded-full bg-white"
                  style={{
                    transform: [{ translateX: isReducingBalance ? 24 : 0 }],
                  }}
                />
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-3 mb-4">
              {/* Start Date Selector */}
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                className="flex-1 bg-white dark:bg-[#0f172a] p-4 rounded-[12px] border border-blue-50 dark:border-blue-900/20"
              >
                <Text className="text-sm font-semibold text-slate-500 mb-2">
                  Loan/Debt Start
                </Text>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full items-center justify-center">
                      <FontAwesome name="calendar" size={16} color="#3b82f6" />
                    </View>
                    <View>
                      <Text className="text-slate-900 dark:text-white font-bold text-lg">
                        {startDate.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                      <Text className="text-slate-400 text-xs">
                        Tap to change
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Expected Pay Date Selector */}
              <TouchableOpacity
                onPress={openDueDatePicker}
                className="flex-1 bg-white dark:bg-[#0f172a] p-4 rounded-[12px] border border-purple-50 dark:border-purple-900/20"
              >
                <Text className="text-sm font-semibold text-slate-500 mb-2">
                  Expected Pay Date
                </Text>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-full items-center justify-center">
                      <FontAwesome
                        name="calendar-check-o"
                        size={16}
                        color="#a855f7"
                      />
                    </View>
                    <View>
                      <Text className="text-slate-900 dark:text-white font-bold text-lg">
                        {expectedPayDate
                          ? expectedPayDate.toLocaleDateString(undefined, {
                              month: "long",
                              year: "numeric",
                            })
                          : "Select Month"}
                      </Text>
                      <Text className="text-slate-400 text-xs text-wrap">
                        Target payoff month
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                maximumDate={new Date()}
              />
            )}

            {showDueDatePicker && (
              <Modal
                transparent={true}
                animationType="fade"
                visible={showDueDatePicker}
                onRequestClose={() => setShowDueDatePicker(false)}
              >
                <TouchableOpacity
                  className="flex-1 bg-black/50 justify-center items-center p-6"
                  activeOpacity={1}
                  onPress={() => setShowDueDatePicker(false)}
                >
                  <View className="bg-white dark:bg-[#0f172a] w-full rounded-[12px] p-6 border border-slate-200 dark:border-slate-700">
                    <View className="flex-row justify-between items-center mb-6">
                      <Text className="text-l uppercase font-bold text-slate-900 dark:text-white text-center flex-1 ml-6">
                        Select Month
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowDueDatePicker(false)}
                      >
                        <Image
                          source={require("../../assets/svg/close.svg")}
                          style={{ width: 10, height: 10 }}
                          tintColor={
                            colorScheme === "dark" ? "#fff" : "#1e293b"
                          }
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row flex-wrap justify-between">
                      {Array.from({ length: 12 }).map((_, i) => {
                        const now = new Date();
                        const displayYear = dueDatePickerYear;
                        const currentMonth =
                          expectedPayDate &&
                          expectedPayDate.getFullYear() === displayYear
                            ? expectedPayDate.getMonth()
                            : -1;
                        // Disable months before the current month if we're displaying the current year
                        const isPastMonth =
                          displayYear === now.getFullYear() &&
                          i < now.getMonth();

                        return (
                          <TouchableOpacity
                            key={i}
                            disabled={isPastMonth}
                            onPress={() => {
                              handleMonthYearSelect(i, displayYear);
                            }}
                            className={`w-[30%] py-2 mb-2 rounded-[8px] items-center ${currentMonth === i ? "bg-blue-600" : isPastMonth ? "opacity-20" : "bg-slate-50 dark:bg-slate-800"}`}
                          >
                            <Text
                              className={`font-medium uppercase text-sm ${currentMonth === i ? "text-white" : "text-slate-600 dark:text-slate-300"}`}
                            >
                              {monthLabels[i]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View className="flex-row justify-center items-center gap-6 mt-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                      <TouchableOpacity
                        onPress={() => setDueDatePickerYear((prev) => prev - 1)}
                        className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
                      >
                        <FontAwesome name="minus" size={10} color="#3b82f6" />
                      </TouchableOpacity>
                      <Text className="text-xl font-black text-slate-900 dark:text-white">
                        {dueDatePickerYear}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setDueDatePickerYear((prev) => prev + 1)}
                        className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
                      >
                        <FontAwesome name="plus" size={10} color="#3b82f6" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => setShowDueDatePicker(false)}
                      className="bg-blue-600 mt-4 py-4 rounded-[12px] items-center"
                    >
                      <Text className="text-white font-bold text-[14px]">
                        Confirm
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Projection Summary */}
            {projectedInterestValue > 0 && (
              <View className="bg-slate-900 dark:bg-white p-6 rounded-[12px] mb-8 border border-slate-700/30 dark:border-slate-200">
                <Text className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">
                  Projected Total Owed
                </Text>
                <View className="flex-row items-baseline gap-2">
                  <Text className="text-white dark:text-slate-900 text-3xl font-bold">
                    KES{" "}
                    {projectedTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>
                <View className="mt-4 pt-4 border-t border-slate-800 dark:border-slate-100">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-slate-400 dark:text-slate-500 text-xs">
                      Initial Principal
                    </Text>
                    <Text className="text-slate-300 dark:text-slate-700 text-xs font-bold">
                      KES{" "}
                      {(
                        parseFloat(amount.replace(/,/g, "")) || 0
                      ).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 dark:text-slate-500 text-xs">
                      Estimated Interest
                    </Text>
                    <Text className="text-blue-400 dark:text-blue-600 text-xs font-bold">
                      +KES{" "}
                      {projectedInterestValue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {!isEditMode && (
              <View className="bg-white dark:bg-[#0f172a] p-4 rounded-[12px] mb-6 border border-slate-200 dark:border-slate-700">
                <Text className="text-sm font-semibold text-slate-500 mb-2">
                  {type === "LIABILITY"
                    ? "Money Received Into (Optional)"
                    : "Money Sent From (Optional)"}
                </Text>
                <View className="flex-row gap-2 flex-wrap">
                  {accounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() =>
                        setSelectedAccount(
                          acc.id === selectedAccount ? undefined : acc.id,
                        )
                      }
                      className={`px-3 py-2 rounded-lg border ${selectedAccount === acc.id ? "bg-blue-50 border-blue-500" : "bg-slate-50 border-slate-200"}`}
                    >
                      <Text
                        className={`${selectedAccount === acc.id ? "text-blue-600 font-bold" : "text-slate-600"}`}
                      >
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-xs text-slate-400 mt-2">
                  {type === "LIABILITY"
                    ? "Select an account if you received this loan into it (we create an Income transaction)."
                    : "Select an account if you sent this money from it (we create an Expense transaction)."}
                </Text>
              </View>
            )}

            <TouchableOpacity
              className="bg-blue-600 p-4 rounded-[12px] items-center"
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Image
                    source={require("../../assets/svg/confirm.svg")}
                    style={{ width: 20, height: 20 }}
                    tintColor={"white"}
                    contentFit="contain"
                  />
                  <Text className="text-white font-bold text-lg">
                    {isEditMode
                      ? `Save ${type === "LIABILITY" ? "Debt" : "Loan"}`
                      : `Create ${type === "LIABILITY" ? "Debt" : "Loan"}`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default AddDebtScreen;
