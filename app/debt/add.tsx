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
import DueDatePickerModal from "../../components/modals/DueDatePickerModal";
import { accountService } from "../../services/accountService";
import { debtService } from "../../services/debtService";
import { Account } from "../../types/account";

function AddDebtScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editId?: string;
    sourceTransactionId?: string;
    lenderName?: string;
    amount?: string;
    accountId?: string;
    transactionDate?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const editId = typeof params.editId === "string" ? params.editId : undefined;
  const sourceTransactionId =
    typeof params.sourceTransactionId === "string"
      ? params.sourceTransactionId
      : undefined;
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

  useEffect(() => {
    if (editId || !sourceTransactionId) return;

    setType("LIABILITY");
    setName(typeof params.lenderName === "string" ? params.lenderName : "");
    setAmount(
      typeof params.amount === "string" ? formatWithCommas(params.amount) : "",
    );
    setSelectedAccount(
      typeof params.accountId === "string" ? params.accountId : undefined,
    );
    if (typeof params.transactionDate === "string") {
      const date = new Date(params.transactionDate);
      if (!Number.isNaN(date.getTime())) setStartDate(date);
    }
  }, [editId, params.accountId, params.amount, params.lenderName, params.transactionDate, sourceTransactionId]);

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

  const onDateChange = (_event: any, selectedDate?: Date) => {
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
      } else if (sourceTransactionId) {
        await debtService.createDebtFromIncomingTransaction({
          transactionId: sourceTransactionId,
          userId: "local_user",
          name,
          amount: parseFloat(amount.replace(/,/g, "")),
          interestRate: interestRate ? parseFloat(interestRate) : undefined,
          isReducingBalance,
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
            {sourceTransactionId && (
              <View className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-[12px] mb-6 border border-violet-100 dark:border-violet-900/50">
                <Text className="text-violet-700 dark:text-violet-300 font-bold text-sm">Borrowed-money transaction</Text>
                <Text className="text-violet-600 dark:text-violet-400 text-xs mt-1">
                  Saving will link this debt to the incoming transaction and remove it from income reports.
                </Text>
              </View>
            )}
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
                onPress={() => !isEditMode && !sourceTransactionId && setType("LIABILITY")}
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
                disabled={isEditMode || Boolean(sourceTransactionId)}
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
                onPress={() => !isEditMode && !sourceTransactionId && setType("RECEIVABLE")}
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
                disabled={isEditMode || Boolean(sourceTransactionId)}
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

            <DueDatePickerModal
              visible={showDueDatePicker}
              colorScheme={colorScheme}
              dueDatePickerYear={dueDatePickerYear}
              currentMonth={
                expectedPayDate && expectedPayDate.getFullYear() === dueDatePickerYear
                  ? expectedPayDate.getMonth()
                  : -1
              }
              monthLabels={monthLabels}
              onClose={() => setShowDueDatePicker(false)}
              onSelectMonth={handleMonthYearSelect}
              onChangeYear={setDueDatePickerYear}
            />

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
                    ? "Money Received Into"
                    : "Money Sent From"}
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
                    ? "We always create an Income transaction for this loan start date. If you skip selection, it will go to M-PESA by default."
                    : "We always create an Expense transaction for this lending start date. If you skip selection, it will go to M-PESA by default."}
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
