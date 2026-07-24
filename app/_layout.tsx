import { Stack, useRouter, useSegments } from "expo-router";
import "../global.css";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AppLockScreen from "../components/AppLockScreen";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, inAuthGroup]);

  useEffect(() => {
    recordActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  const shouldBlockAppTree =
    authLoading || (user && !inAuthGroup && !isSecurityReady);

  if (shouldBlockAppTree) {
    return (
      <PermissionGuard>
        <ScrollProvider>
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            className="app-screen"
          >
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        </ScrollProvider>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard>
      <ScrollProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="debt/add"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              gestureEnabled: true,
            }}
          />
        </Stack>
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
      <AppLockScreen />
      <CustomAlert />
    </AppLockProvider>
  );
}

export default function RootLayout() {
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    initDatabase()
      .catch((err) => console.error("DB init failed:", err))
      .finally(() => setDbLoading(false));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AlertProvider>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <LockAwareTree />
          </KeyboardAvoidingView>

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
