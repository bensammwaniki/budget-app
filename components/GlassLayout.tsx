import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";

interface GlassLayoutProps {
    children: ReactNode;
    intensity?: number;
}

export default function GlassLayout({ children, intensity }: GlassLayoutProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";

    // Enhanced blur intensity for better foggy glass effect
    const blurIntensity = intensity ?? (isDark ? 60 : 90);

    return (
        <View style={styles.container}>
            {/* Gradient Background Layer - Enhanced for light mode */}
            <LinearGradient
                colors={
                    isDark
                        ? ["#0f172a", "#1e293b", "#0f172a"] // Dark mode: deep slate gradient
                        : ["#f8fafc", "#e0e7ff", "#ddd6fe", "#f8fafc"] // Light mode: soft blue-purple gradient
                }
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Glass Blur Effect Layer */}
            <BlurView
                intensity={blurIntensity}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
            />

            {/* Semi-transparent Overlay for Depth */}
            <View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: isDark
                            ? "rgba(15, 23, 42, 0.3)" // Dark mode: subtle dark overlay
                            : "rgba(248, 250, 252, 0.4)", // Light mode: soft white overlay
                    },
                ]}
            />

            {/* Content Layer */}
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        zIndex: 1,
    },
});
