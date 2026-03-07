import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollVisibility } from '../services/ScrollContext';

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const { tabBarVisible } = useScrollVisibility();

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    translateY: (1 - tabBarVisible.value) * (75 + insets.bottom + 20),
                },
            ],
            opacity: tabBarVisible.value,
        };
    });

    return (
        <Animated.View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 0 }, animatedStyle]}>
            <View style={[
                styles.innerContainer,
                {
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
                }
            ]}>
                {/* Tab Items */}
                <View style={styles.tabsContainer}>
                    {state.routes.filter((route) => {
                        // Tabs accessed via other navigation (e.g. Profile) should not appear here
                        const HIDDEN_TABS = ['income'];
                        return !HIDDEN_TABS.includes(route.name);
                    }).map((route, index) => {
                        const { options } = descriptors[route.key];
                        const routeIndex = state.routes.findIndex(r => r.key === route.key);
                        const isFocused = state.index === routeIndex;

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
                                style={styles.tabItem}
                            >
                                {/* Icon */}
                                <View style={styles.iconContainer}>
                                    {options.tabBarIcon?.({
                                        focused: isFocused,
                                        color: isFocused ? '#3b82f6' : (isDark ? '#64748b' : '#94a3b8'),
                                        size: 22,
                                    })}
                                </View>
                                {/* Label */}
                                <Text style={[
                                    styles.label,
                                    { color: isFocused ? '#3b82f6' : (isDark ? '#64748b' : '#94a3b8') }
                                ]}>
                                    {options.title ?? route.name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    innerContainer: {
        width: '100%',
        height: 75,
        borderTopWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 10,
    },
    tabsContainer: {
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    tabItem: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3,
    },
    iconContainer: {
        width: 26,
        height: 26,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 10,
        fontWeight: '600',
        textAlign: 'center',
    },
});
