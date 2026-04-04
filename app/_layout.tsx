import { Stack, useRouter, useSegments } from "expo-router";
import "../global.css";

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import CustomAlert from "../components/CustomAlert";
import { PermissionGuard } from "../components/PermissionGuard";
import { AlertProvider } from "../context/AlertContext";
import { AppLockProvider, useAppLock } from "../context/AppLockContext";
import { AuthProvider, useAuth } from "../services/AuthContext";
import { ScrollProvider } from "../services/ScrollContext";
import { initDatabase } from "../services/core/db";

function RootLayoutContent() {
  const { user, loading: authLoading } = useAuth();
  const { isSecurityReady, recordActivity } = useAppLock();
  const segments = useSegments();
  const router = useRouter();
  const inAuthGroup = segments[0] === "(auth)";

  useEffect(() => {
    if (authLoading) return;

    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, authLoading, inAuthGroup, router]);

  useEffect(() => {
    recordActivity();
  }, [recordActivity, segments]);

  // ⚠️ Always render Stack.
  // Do NOT block navigation tree.
  return (
    <PermissionGuard>
      <ScrollProvider>
        <View
          style={{ flex: 1 }}
          onTouchStart={recordActivity}
          pointerEvents={user && !inAuthGroup && !isSecurityReady ? "none" : "auto"}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </ScrollProvider>
    </PermissionGuard>
  );
}

function LockAwareTree() {
  const segments = useSegments();
  const inAuthGroup = segments[0] === "(auth)";

  return (
    <AppLockProvider isAuthRoute={inAuthGroup}>
      <RootLayoutContent />
      <CustomAlert />
    </AppLockProvider>
  );
}

export default function RootLayout() {
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    initDatabase()
      .catch(err => console.error("DB init failed:", err))
      .finally(() => setDbLoading(false));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AlertProvider>
          <LockAwareTree />

          {dbLoading && (
            <View
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#2563eb",
                zIndex: 9999,
              }}
            >
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          )}
        </AlertProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
