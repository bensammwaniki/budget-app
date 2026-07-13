import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Returns a navigation function that pops the current screen when there is
 * history to go back to, and falls back to `fallbackHref` otherwise.
 *
 * This avoids the "GO_BACK was not handled by any navigator" warning/crash
 * that happens when router.back() is called on a screen that has no
 * navigation history behind it — e.g. when the screen was opened directly
 * via a deep link, a cold start, or a push notification.
 *
 * Usage:
 *   const goBack = useSafeBack(); // defaults to "/"
 *   <TouchableOpacity onPress={() => goBack()} />
 *
 *   const goBack = useSafeBack("/(tabs)"); // custom fallback route
 */
export function useSafeBack(fallbackHref: string = "/") {
  const router = useRouter();

  return useCallback(
    (hrefOverride?: string) => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace((hrefOverride ?? fallbackHref) as any);
      }
    },
    [router, fallbackHref]
  );
}