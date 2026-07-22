import { getUserSettings, saveUserSettings } from "./database";

export const APP_GUIDE_SEEN_KEY = "app_guide_seen_v1";

export const getAppGuideSeen = async (): Promise<boolean> => {
  const value = await getUserSettings(APP_GUIDE_SEEN_KEY);
  return value === "1";
};

export const setAppGuideSeen = async (seen: boolean): Promise<void> => {
  await saveUserSettings(APP_GUIDE_SEEN_KEY, seen ? "1" : "0");
};
