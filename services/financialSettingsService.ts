import { Transaction } from "../types/transaction";
import { getUserSettings, saveUserSettings } from "./database";

export const FINANCIAL_MONTH_START_KEY = "financial_month_start_day";
export const HIDE_INTERNAL_TRANSFERS_KEY = "hide_internal_transfers";
export const FINANCIAL_FRESH_START_KEY = "financial_fresh_start_v1";
export const LIQUID_BALANCE_RESET_KEY = "liquid_balance_reset_date_v1";

export interface FreshStartConfig {
  effectiveDate: string;
  createdAt: string;
  resetBroughtForward: boolean;
  resetDebts: boolean;
  resetSavings: boolean;
  resetIncome: boolean;
  resetBudgets: boolean;
}

export interface FinancialSettings {
  monthStartDay: number;
  hideInternalTransfers: boolean;
  freshStart: FreshStartConfig | null;
  liquidBalanceResetDate: string | null;
  liquidBalanceOpeningAmount: number;
}

export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  monthStartDay: 1,
  hideInternalTransfers: false,
  freshStart: null,
  liquidBalanceResetDate: null,
  liquidBalanceOpeningAmount: 0,
};

export const getFinancialMonthStart = (
  referenceDate: Date,
  monthStartDay: number,
): Date => {
  const safeStartDay = Math.max(1, Math.min(28, monthStartDay || 1));
  if (referenceDate.getDate() >= safeStartDay) {
    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      safeStartDay,
      0,
      0,
      0,
      0,
    );
  }

  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() - 1,
    safeStartDay,
    0,
    0,
    0,
    0,
  );
};

export const getFinancialMonthRange = (
  referenceDate: Date,
  monthStartDay: number,
) => {
  const start = getFinancialMonthStart(referenceDate, monthStartDay);
  const nextStart = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    start.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(nextStart.getTime() - 1);
  return { start, end, nextStart };
};

export const getPreviousFinancialMonthRange = (
  referenceDate: Date,
  monthStartDay: number,
) => {
  const { start } = getFinancialMonthRange(referenceDate, monthStartDay);
  const previousReference = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() - 1,
    12,
    0,
    0,
    0,
  );
  return getFinancialMonthRange(previousReference, monthStartDay);
};

export const getFinancialSettings = async (): Promise<FinancialSettings> => {
  const [startDayValue, hideTransfersValue, freshStartValue, liquidResetValue] =
    await Promise.all([
      getUserSettings(FINANCIAL_MONTH_START_KEY),
      getUserSettings(HIDE_INTERNAL_TRANSFERS_KEY),
      getUserSettings(FINANCIAL_FRESH_START_KEY),
      getUserSettings(LIQUID_BALANCE_RESET_KEY),
    ]);

  let freshStart: FreshStartConfig | null = null;
  if (freshStartValue) {
    try {
      freshStart = JSON.parse(freshStartValue) as FreshStartConfig;
    } catch {
      freshStart = null;
    }
  }

  let liquidBalanceResetDate: string | null = null;
  let liquidBalanceOpeningAmount = 0;
  if (liquidResetValue) {
    try {
      const parsed = JSON.parse(liquidResetValue) as {
        effectiveDate?: string;
        openingAmount?: number;
        date?: string;
        amount?: number;
      };
      liquidBalanceResetDate = parsed.effectiveDate || parsed.date || null;
      liquidBalanceOpeningAmount = Number(parsed.openingAmount ?? parsed.amount ?? 0);
    } catch {
      liquidBalanceResetDate = liquidResetValue;
      liquidBalanceOpeningAmount = 0;
    }
  }

  const monthStartDay = Number.parseInt(startDayValue || "", 10);

  return {
    monthStartDay:
      Number.isFinite(monthStartDay) && monthStartDay > 0
        ? Math.min(monthStartDay, 28)
        : 1,
    hideInternalTransfers: hideTransfersValue === "1",
    freshStart,
    liquidBalanceResetDate,
    liquidBalanceOpeningAmount,
  };
};

export const saveFinancialMonthStart = async (
  monthStartDay: number,
): Promise<void> => {
  await saveUserSettings(
    FINANCIAL_MONTH_START_KEY,
    String(Math.max(1, Math.min(28, monthStartDay))),
  );
};

export const saveHideInternalTransfers = async (
  enabled: boolean,
): Promise<void> => {
  await saveUserSettings(HIDE_INTERNAL_TRANSFERS_KEY, enabled ? "1" : "0");
};

export const saveFreshStartConfig = async (
  config: FreshStartConfig,
): Promise<void> => {
  await saveUserSettings(FINANCIAL_FRESH_START_KEY, JSON.stringify(config));
};

export const clearFreshStartConfig = async (): Promise<void> => {
  await saveUserSettings(FINANCIAL_FRESH_START_KEY, "");
};

export const saveLiquidBalanceResetDate = async (
  dateIso: string | null,
  openingAmount: number = 0,
): Promise<void> => {
  if (!dateIso) {
    await saveUserSettings(LIQUID_BALANCE_RESET_KEY, "");
    return;
  }

  await saveUserSettings(
    LIQUID_BALANCE_RESET_KEY,
    JSON.stringify({
      effectiveDate: dateIso,
      openingAmount: Number.isFinite(openingAmount) ? openingAmount : 0,
    }),
  );
};

export const buildFreshStartConfig = (
  monthStartDay: number,
  options: Omit<FreshStartConfig, "effectiveDate" | "createdAt">,
  now: Date = new Date(),
): FreshStartConfig => {
  const effectiveDate = getFinancialMonthStart(now, monthStartDay);
  return {
    effectiveDate: effectiveDate.toISOString(),
    createdAt: now.toISOString(),
    ...options,
  };
};

const normalizeText = (value?: string | null): string =>
  (value || "").trim().toLowerCase();
export const isInternalTransfer = (
  transaction: Transaction,
  _options?: {
    userPhoneNumber?: string | null;
  },
): boolean => {
  if (transaction.isInternalTransfer) return true;
  const rawSms = normalizeText(transaction.rawSms);
  const recipientName = normalizeText(transaction.recipientName);
  const recipientId = normalizeText(transaction.recipientId);

  const hasTransferLabel =
    rawSms.includes("internal transfer:") ||
    rawSms.includes("mpesa-bank transfer") ||
    rawSms.includes("bank to m-pesa transfer") ||
    rawSms.includes("bank to mpesa transfer") ||
    recipientName.includes("mpesa-bank transfer") ||
    recipientName.includes("bank to m-pesa transfer") ||
    recipientName.includes("bank to mpesa transfer");

  if (hasTransferLabel) {
    return true;
  }

  const isTransferKind =
    transaction.transactionKind === "TRANSFER" ||
    transaction.transactionKind === "SAVINGS_TRANSFER";

  if (isTransferKind) {
    const looksLikeInternalTransfer =
      recipientId === "self" ||
      recipientName.startsWith("transfer to ") ||
      recipientName.startsWith("transfer from ");

    if (looksLikeInternalTransfer) {
      return true;
    }
  }

  if (recipientId === "self") {
    return true;
  }

  return false;
};

/** Internal moves change account locations, not the user's income or spending. */
export const isCashflowTransaction = (
  transaction: Transaction,
  options?: { userPhoneNumber?: string | null },
): boolean => !isInternalTransfer(transaction, options) && transaction.transactionKind !== "DEBT_PRINCIPAL";

export const getFreshStartEffectiveDate = (
  freshStart: FreshStartConfig | null,
): Date | null => {
  if (!freshStart?.effectiveDate) return null;
  const parsed = new Date(freshStart.effectiveDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getLiquidBalanceResetDate = (
  value: string | null,
): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
