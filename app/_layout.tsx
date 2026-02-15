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
  let segments: string[] = [];
  let router: any = null;

  try {
    // These hooks can throw if the navigation context isn't ready yet
    segments = useSegments();
    router = useRouter();
  } catch (err) {
    // No navigation context available yet — we'll skip redirects until it's ready
    segments = [];
    router = null;
  }

  useEffect(() => {
    if (authLoading) return;
    if (!router || !segments || segments.length === 0) return;

    const inAuthGroup = segments[0] === "(auth)";

    try {
      if (!user && !inAuthGroup) {
        router.replace("/login");
      } else if (user && inAuthGroup) {
        router.replace("/(tabs)");
      }
    } catch (err) {
      // navigation not ready — ignore and wait for context
      console.warn('Router not ready for redirects yet');
    }
  }, [user, authLoading, segments, router]);

  // IMPORTANT: Do NOT return null or a skeleton if authLoading is true 
  // after the initial DB load, because that unmounts the Stack and 
  // breaks navigation context for children (tabs).
  // The children should handle their own local loading states.

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
      .then(() => setDbLoading(false))
      .catch((err) => {
        console.error("Failed to initialize database in RootLayout:", err);
        // We could show a fatal error screen here
      });
  }, []);

  if (dbLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-blue-600">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AlertProvider>
          <RootLayoutContent />
          <CustomAlert />
        </AlertProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

