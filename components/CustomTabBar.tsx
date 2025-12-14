import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : -2 }]}>
            <View style={styles.blurContainer}>
                {/* Gradient Border/Glow Effect */}
                <LinearGradient
                    colors={['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.1)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />

                {/* Glass Background */}
                <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />

                {/* Tab Items */}
                <View style={styles.tabsContainer}>
                    {state.routes.map((route, index) => {
                        const { options } = descriptors[route.key];
                        const label =
                            options.tabBarLabel !== undefined
                                ? options.tabBarLabel
                                : options.title !== undefined
                                    ? options.title
                                    : route.name;

                        const isFocused = state.index === index;

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name, route.params);
                            }
                        };

                        const onLongPress = () => {
                            navigation.emit({
                                type: 'tabLongPress',
                                target: route.key,
                            });
                        };

                        return (
                            <TouchableOpacity
                                key={route.key}
                                accessibilityRole="button"
                                accessibilityState={isFocused ? { selected: true } : {}}
                                accessibilityLabel={options.tabBarAccessibilityLabel}
                                testID={(options as any).tabBarTestID}
                                onPress={onPress}
                                onLongPress={onLongPress}
                                style={[styles.tabItem, { flex: isFocused ? 1.2 : 1 }]} // Give active tab slightly more space
                            >
                                {/* Active Indicator (Pill) */}
                                {isFocused && (
                                    <View style={styles.activePill}>
                                        <LinearGradient
                                            colors={['#ffffffa8', '#f6f6f6ae']} // Dark bluish gradient
                                            style={StyleSheet.absoluteFill}
                                        />
                                    </View>
                                )}

                                {/* Icon */}
                                <View style={styles.iconContainer}>
                                    {options.tabBarIcon?.({
                                        focused: isFocused,
                                        color: isFocused ? '#1d1212ff' : '#64748b',
                                        size: 24,
                                    })}
                                </View>


                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        pointerEvents: 'box-none',
    },
    blurContainer: {
        width: '90%',
        maxWidth: 380,
        height: 60,
        borderRadius: 40,
        overflow: 'hidden',
        position: 'relative',
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 5,
    },
    tabsContainer: {
        flexDirection: 'row',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingHorizontal: 5,
    },
    tabItem: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    activePill: {
        position: 'absolute',
        width: '90%',
        height: '85%',
        borderRadius: 24, // Rounded Rectangle / Squircle
        overflow: 'hidden',
    },
    iconContainer: {
        marginBottom: 2,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1, // Ensure on top of pill
    },

});
