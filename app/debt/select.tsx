import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAlert } from "../../context/AlertContext";
import { addAutomationRule, applyRuleToExistingTransactions, getCategories, getTransactions } from "../../services/database";
import { debtService } from "../../services/debtService";
import { Debt } from "../../types/debt";
import { AutomationRule } from "../../types/automation";

export default function DebtSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ transactionId?: string }>();
  const transactionId = typeof params.transactionId === "string" ? params.transactionId : null;
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();

  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [query, setQuery] = useState("");
  const [savingDebtId, setSavingDebtId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await debtService.getDebts("local_user", "ACTIVE", "LIABILITY");
        setDebts(items.filter((d) => d.status === "ACTIVE"));
      } catch (error) {
        console.error("Failed to load debts:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredDebts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return debts;
    return debts.filter((debt) => debt.name.toLowerCase().includes(q));
  }, [debts, query]);

  const handleChooseDebt = async (debt: Debt) => {
    if (!transactionId) return;
    try {
      setSavingDebtId(debt.id);
      const [tx, categories] = await Promise.all([
        getTransactions().then((rows) => rows.find((row) => row.id === transactionId)),
        getCategories(),
      ]);

      if (!tx) throw new Error("Transaction not found");

      await debtService.linkTransactionToDebt({
        debtId: debt.id,
        transactionId,
      });

      const debtRepaymentCategory = categories.find(
        (category) => category.name.toLowerCase() === "debt repayment",
      );
      if (!debtRepaymentCategory) throw new Error("Debt Repayment category missing");

      const rule: Omit<AutomationRule, "id"> = {
        name: `AUTO::DEBT::${debt.id}::${debt.name}`,
        type: "EXPENSE",
        conditions: [
          {
            field: "DESCRIPTION",
            operator: "CONTAINS",
            value: debt.name,
          },
        ],
        action: {
          categoryId: debtRepaymentCategory.id,
          debtId: debt.id,
        },
        isEnabled: true,
      };

      const ruleId = await addAutomationRule(rule);
      await applyRuleToExistingTransactions({ ...rule, id: ruleId });

      Alert.alert("Linked", `${debt.name} is now linked and future matching payments will be auto-linked.`);
      router.back();
    } catch (error: any) {
      showAlert({
        title: "Debt link failed",
        message: error?.message || "Could not link the transaction to this debt.",
        type: "error",
      });
    } finally {
      setSavingDebtId(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 app-screen items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 app-screen" style={{ paddingTop: insets.top }}>
      <View className="px-6 py-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <FontAwesome name="chevron-left" size={18} color={colorScheme === "dark" ? "#fff" : "#1e293b"} />
        </TouchableOpacity>
        <Text className="text-slate-900 dark:text-white text-lg font-bold">Pick Debt</Text>
        <View style={{ width: 24 }} />
      </View>

      <View className="px-6 pb-4">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search debts"
          placeholderTextColor="#94a3b8"
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[12px] px-4 py-3 text-slate-900 dark:text-white"
        />
      </View>

      <View className="px-6">
        <Text className="text-slate-500 dark:text-slate-400 text-xs mb-3">
          Choose the debt this payment belongs to. The app will also create a rule for similar future payments.
        </Text>
        {filteredDebts.map((debt) => (
          <TouchableOpacity
            key={debt.id}
            onPress={() => handleChooseDebt(debt)}
            disabled={savingDebtId === debt.id}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[12px] p-4 mb-3 flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-slate-900 dark:text-white font-bold text-base">
                {debt.name}
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                KES {debt.currentBalance.toLocaleString()}
              </Text>
            </View>
            {savingDebtId === debt.id ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : (
              <FontAwesome name="chevron-right" size={14} color="#94a3b8" />
            )}
          </TouchableOpacity>
        ))}
        {filteredDebts.length === 0 && (
          <View className="py-10 items-center">
            <Text className="text-slate-400">No debts found.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
