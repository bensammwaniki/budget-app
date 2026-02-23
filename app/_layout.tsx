import { Stack, useRouter, useSegments } from "expo-router";
import "../global.css";

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import CustomAlert from "../components/CustomAlert";
import PermissionGuard from "../components/PermissionGuard";
import { AlertProvider } from "../context/AlertContext";
import { AuthProvider, useAuth } from "../services/AuthContext";
import { ScrollProvider } from "../services/ScrollContext";
import { initDatabase } from "../services/core/db";

function RootLayoutContent() {
  const { user, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, authLoading, segments]);

  // ⚠️ Always render Stack.
  // Do NOT block navigation tree.
  return (
    <PermissionGuard>
      <ScrollProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ScrollProvider>
    </PermissionGuard>
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
          <RootLayoutContent />
          <CustomAlert />

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