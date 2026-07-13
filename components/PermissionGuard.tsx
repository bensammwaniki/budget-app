import React, { createContext, useContext, useEffect, useState } from "react";
import {
    ActivityIndicator,
    AppState,
    PermissionsAndroid,
    Platform,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { requestSMSPermission } from "../services/smsService";

interface PermissionContextType {
  hasPermission: boolean | null;
  isRestricted: boolean;
  loading: boolean;
  requestPermission: () => Promise<void>;
  openSettings: () => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(
  undefined,
);

export function usePermission() {
  return useContext(PermissionContext)!;
}

export function PermissionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRestricted, setIsRestricted] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkPermission = async () => {
    if (Platform.OS !== "android") {
      setHasPermission(true);
      setLoading(false);
      return;
    }
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      );
      setHasPermission(granted);
    } catch (err) {
      console.error("Error checking permission:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkPermission();
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkPermission();
      }
    });
    return () => subscription.remove();
  }, []);

  const requestPermission = async () => {
    setLoading(true);
    const granted = await requestSMSPermission();
    if (granted) {
      setHasPermission(true);
      setIsRestricted(false);
    } else {
      setIsRestricted(true);
    }
    setLoading(false);
  };

  const openSettings = () => {
    import("expo-linking").then((Linking) => Linking.openSettings());
  };

  return (
    <PermissionContext.Provider
      value={{
        hasPermission,
        isRestricted,
        loading,
        requestPermission,
        openSettings,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function PermissionGuard({ children }: { children: React.ReactNode }) {
  return (
    <PermissionProvider>
      <PermissionGate>{children}</PermissionGate>
    </PermissionProvider>
  );
}

function PermissionGate({ children }: { children: React.ReactNode }) {
  const ctx = useContext(PermissionContext)!;
  const {
    hasPermission,
    loading,
    requestPermission,
    isRestricted,
    openSettings,
  } = ctx;

  if (loading) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        className="app-screen"
      >
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // If permission is granted (or not required on this platform), render app
  if (hasPermission) {
    return <>{children}</>;
  }

  // Otherwise block and show a required permission prompt
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
      className="app-screen"
    >
      <View style={{ maxWidth: 520 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          SMS Permission Required
        </Text>
        <Text
          style={{ textAlign: "center", color: "#475569", marginBottom: 20 }}
        >
          This app needs access to your SMS messages to automatically detect
          incoming income and link payments. Please grant the permission to
          continue using the app.
        </Text>

        <TouchableOpacity
          onPress={() => requestPermission()}
          style={{
            backgroundColor: "#2563eb",
            padding: 12,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Text
            style={{ color: "white", textAlign: "center", fontWeight: "600" }}
          >
            Grant Permission
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => openSettings()}
          style={{ backgroundColor: "#e2e8f0", padding: 12, borderRadius: 10 }}
        >
          <Text
            style={{ color: "#0f172a", textAlign: "center", fontWeight: "600" }}
          >
            {isRestricted ? "Open Settings" : "Maybe Later / Settings"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default PermissionGuard;
