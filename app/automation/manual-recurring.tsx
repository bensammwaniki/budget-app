import { FontAwesome } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAlert } from "../../context/AlertContext";
import { subscribeToDatabaseChanges } from "../../services/core/db";
import {
    ManualRecurringRunInfo,
    ManualRecurringTransactionTemplate,
    manualRecurringTransactionService,
} from "../../services/manualRecurringTransactionService";

type AccountId = "ACC-CASH-DEFAULT" | "ACC-MPESA-DEFAULT" | "ACC-BANK-DEFAULT";

export default function ManualRecurringTransactionsScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<
    ManualRecurringTransactionTemplate[]
  >([]);
  const [runInfoByTemplateId, setRunInfoByTemplateId] = useState<
    Record<string, ManualRecurringRunInfo>
  >({});
  const [editing, setEditing] =
    useState<ManualRecurringTransactionTemplate | null>(null);

  const [editAmount, setEditAmount] = useState("");
  const [editRecipient, setEditRecipient] = useState("");
  const [editType, setEditType] = useState<"SENT" | "RECEIVED">("SENT");
  const [editAccountId, setEditAccountId] =
    useState<AccountId>("ACC-CASH-DEFAULT");
  const [editActive, setEditActive] = useState(true);

  const isDark = colorScheme === "dark";

  const loadTemplates = useCallback(async () => {
    try {
      const data =
        await manualRecurringTransactionService.getTemplates("local_user");
      setTemplates(data);

      const runInfoEntries = await Promise.all(
        data.map(async (template) => {
          const runInfo =
            await manualRecurringTransactionService.getTemplateRunInfo(
              template,
            );
          return [template.id, runInfo] as const;
        }),
      );
      setRunInfoByTemplateId(Object.fromEntries(runInfoEntries));
    } catch (error) {
      console.error("Failed to load recurring templates:", error);
      showAlert({
        title: "Error",
        message: "Failed to load recurring transactions.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
      const unsubscribe = subscribeToDatabaseChanges((type) => {
        if (type === "TRANSACTIONS") {
          loadTemplates();
        }
      });
      return unsubscribe;
    }, [loadTemplates]),
  );

  const openEdit = (template: ManualRecurringTransactionTemplate) => {
    setEditing(template);
    setEditAmount(String(template.amount));
    setEditRecipient(template.recipientName || "");
    setEditType(template.type);
    setEditAccountId(
      (template.accountId === "ACC-MPESA-DEFAULT"
        ? "ACC-MPESA-DEFAULT"
        : template.accountId === "ACC-BANK-DEFAULT"
          ? "ACC-BANK-DEFAULT"
          : "ACC-CASH-DEFAULT") as AccountId,
    );
    setEditActive(template.isActive);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const accountLabel = useCallback((accountId: string) => {
    if (accountId === "ACC-MPESA-DEFAULT") return "M-PESA";
    if (accountId === "ACC-BANK-DEFAULT") return "Bank";
    return "Cash";
  }, []);

  const prettyMonth = useCallback((monthKey: string) => {
    const [yearRaw, monthRaw] = monthKey.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw) - 1;
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 0 ||
      month > 11
    ) {
      return monthKey;
    }
    return new Date(year, month, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, []);

  const prettyDate = useCallback((isoDate?: string | null) => {
    if (!isoDate) return "Not yet";
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return "Not yet";
    return parsed.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, []);

  const handleToggleActive = async (
    template: ManualRecurringTransactionTemplate,
  ) => {
    try {
      await manualRecurringTransactionService.setTemplateActive(
        template.id,
        !template.isActive,
      );
      await loadTemplates();
    } catch (error) {
      console.error("Failed to toggle recurring template:", error);
      showAlert({
        title: "Error",
        message: "Could not update recurring transaction status.",
        type: "error",
      });
    }
  };

  const handleDelete = (template: ManualRecurringTransactionTemplate) => {
    showAlert({
      title: "Delete Recurring Transaction",
      message: `Delete recurring entry "${template.recipientName}"? This only stops future auto-posting.`,
      type: "warning",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await manualRecurringTransactionService.deleteTemplate(
                template.id,
              );
              await loadTemplates();
            } catch (error) {
              console.error("Failed to delete recurring template:", error);
              showAlert({
                title: "Error",
                message: "Could not delete recurring transaction.",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;

    const amount = Number(editAmount.replace(/,/g, "").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert({
        title: "Invalid Amount",
        message: "Enter a valid amount greater than zero.",
        type: "error",
      });
      return;
    }

    const recipient = editRecipient.trim();
    if (!recipient) {
      showAlert({
        title: "Missing Note",
        message: "Enter a note/label for this recurring transaction.",
        type: "error",
      });
      return;
    }

    setSaving(true);
    try {
      await manualRecurringTransactionService.updateTemplate(editing.id, {
        amount,
        recipientName: recipient,
        type: editType,
        accountId: editAccountId,
        rawSms: `Manual ${editAccountId === "ACC-MPESA-DEFAULT" ? "m-pesa" : "cash"} ${editType === "SENT" ? "expense" : "income"} entry`,
        isActive: editActive,
      });

      setEditing(null);
      await loadTemplates();
      showAlert({
        title: "Saved",
        message: "Recurring transaction updated.",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to save recurring template:", error);
      showAlert({
        title: "Error",
        message: "Could not save recurring transaction changes.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(
    () => templates.filter((t) => t.isActive).length,
    [templates],
  );

  if (loading) {
    return (
      <View className="flex-1 app-screen items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 app-screen">
      <View
        className="px-6 pb-4 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800 shadow-sm z-10"
        style={{ paddingTop: insets.top > 0 ? insets.top : 20 }}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <Image
              source={require("../../assets/svg/back.svg")}
              style={{ width: 24, height: 24 }}
              tintColor={isDark ? "#fff" : "#1e293b"}
              contentFit="contain"
            />
          </TouchableOpacity>
          <Text className="text-slate-900 dark:text-white text-lg font-bold">
            Recurring Transactions
          </Text>
          <View className="w-8" />
        </View>
        <Text className="text-slate-500 dark:text-slate-400 text-xs mt-2">
          {activeCount} active of {templates.length} total
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {templates.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full items-center justify-center mb-6">
              <FontAwesome name="repeat" size={30} color="#3b82f6" />
            </View>
            <Text className="text-slate-900 dark:text-white text-lg font-bold mb-2">
              No Recurring Entries
            </Text>
            <Text className="text-slate-500 dark:text-slate-400 text-center px-8">
              Enable recurring from the Add Cash Transaction modal to auto-post
              monthly entries.
            </Text>
          </View>
        ) : (
          templates.map((template) => (
            <View
              key={template.id}
              className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl mb-4 border border-gray-200 dark:border-slate-700"
            >
              {(() => {
                const runInfo = runInfoByTemplateId[template.id];
                return (
                  <View className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 mb-3">
                    <Text className="text-slate-900 dark:text-white font-bold text-lg">
                      KES{" "}
                      {template.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                      Last auto-posted: {prettyDate(runInfo?.lastAutoPostedAt)}
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                      Next run:{" "}
                      {template.isActive
                        ? prettyDate(runInfo?.nextRunAt)
                        : "Paused"}
                    </Text>
                  </View>
                );
              })()}

              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-3">
                  <Text className="text-slate-900 dark:text-white font-bold text-base">
                    {template.recipientName}
                  </Text>
                  <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                    {template.type === "SENT" ? "Expense" : "Income"} •{" "}
                    {accountLabel(template.accountId)}
                  </Text>
                  <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                    Last generated: {prettyMonth(template.lastGeneratedMonth)}
                  </Text>
                </View>
                <Switch
                  value={template.isActive}
                  onValueChange={() => handleToggleActive(template)}
                  trackColor={{ false: "#cbd5e1", true: "#2563eb" }}
                  thumbColor="#ffffff"
                />
              </View>

              <View className="flex-row items-center justify-end gap-2">
                <TouchableOpacity
                  onPress={() => openEdit(template)}
                  className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20"
                >
                  <Text className="text-blue-700 dark:text-blue-300 font-semibold text-xs">
                    Edit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(template)}
                  className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20"
                >
                  <Text className="text-red-700 dark:text-red-300 font-semibold text-xs">
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={!!editing}
        onRequestClose={closeEdit}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-5">
          <View className="w-full bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
            <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">
              Edit Recurring Transaction
            </Text>

            <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">
              Type
            </Text>
            <View className="flex-row gap-2 mb-3">
              <TouchableOpacity
                onPress={() => setEditType("SENT")}
                className={`flex-1 py-3 rounded-xl items-center border ${editType === "SENT" ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
              >
                <Text
                  className={`font-bold ${editType === "SENT" ? "text-red-600 dark:text-red-300" : "text-slate-600 dark:text-slate-300"}`}
                >
                  Expense
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditType("RECEIVED")}
                className={`flex-1 py-3 rounded-xl items-center border ${editType === "RECEIVED" ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
              >
                <Text
                  className={`font-bold ${editType === "RECEIVED" ? "text-green-600 dark:text-green-300" : "text-slate-600 dark:text-slate-300"}`}
                >
                  Income
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">
              Account
            </Text>
            <View className="flex-row gap-2 mb-3">
              <TouchableOpacity
                onPress={() => setEditAccountId("ACC-CASH-DEFAULT")}
                className={`flex-1 py-3 rounded-xl items-center border ${editAccountId === "ACC-CASH-DEFAULT" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
              >
                <Text
                  className={`font-bold ${editAccountId === "ACC-CASH-DEFAULT" ? "text-blue-600 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"}`}
                >
                  Cash
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditAccountId("ACC-MPESA-DEFAULT")}
                className={`flex-1 py-3 rounded-xl items-center border ${editAccountId === "ACC-MPESA-DEFAULT" ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
              >
                <Text
                  className={`font-bold ${editAccountId === "ACC-MPESA-DEFAULT" ? "text-emerald-600 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}
                >
                  M-PESA
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditAccountId("ACC-BANK-DEFAULT")}
                className={`flex-1 py-3 rounded-xl items-center border ${editAccountId === "ACC-BANK-DEFAULT" ? "bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
              >
                <Text
                  className={`font-bold ${editAccountId === "ACC-BANK-DEFAULT" ? "text-sky-600 dark:text-sky-300" : "text-slate-600 dark:text-slate-300"}`}
                >
                  Bank
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">
              Amount
            </Text>
            <View className="h-12 rounded-xl px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 justify-center mb-3">
              <TextInput
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={isDark ? "#94a3b8" : "#64748b"}
                className="text-base font-semibold text-slate-900 dark:text-white"
              />
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold mb-2">
              Note
            </Text>
            <View className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-3">
              <TextInput
                value={editRecipient}
                onChangeText={setEditRecipient}
                placeholder="e.g. Rent"
                placeholderTextColor={isDark ? "#94a3b8" : "#64748b"}
                className="text-slate-900 dark:text-white"
              />
            </View>

            <View className="rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-5 flex-row items-center justify-between">
              <Text className="text-slate-900 dark:text-white font-semibold text-sm">
                Active
              </Text>
              <Switch
                value={editActive}
                onValueChange={setEditActive}
                trackColor={{ false: "#cbd5e1", true: "#2563eb" }}
                thumbColor="#ffffff"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={closeEdit}
                disabled={saving}
                className="flex-1 py-3 rounded-xl items-center bg-slate-100 dark:bg-slate-800"
              >
                <Text className="font-bold text-slate-700 dark:text-slate-200">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                className="flex-1 py-3 rounded-xl items-center bg-blue-600"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="font-bold text-white">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
