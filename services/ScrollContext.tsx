import React, { createContext, useContext } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';

const ScrollContext = createContext<{
    tabBarVisible: { value: number };
    showTabBar: () => void;
    hideTabBar: () => void;
} | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
    const tabBarVisible = useSharedValue(0); // 0 = hidden, 1 = shown

    const showTabBar = () => {
        'worklet';
        tabBarVisible.value = withTiming(1, { duration: 300 });
    };

    const hideTabBar = () => {
        'worklet';
        tabBarVisible.value = withTiming(0, { duration: 300 });
    };

    return (
        <ScrollContext.Provider value={{ tabBarVisible, showTabBar, hideTabBar }}>
            {children}
        </ScrollContext.Provider>
    );
}

export function useScrollVisibility() {
    const context = useContext(ScrollContext);
    if (!context) {
        throw new Error('useScrollVisibility must be used within a ScrollProvider');
    }
    return context;
}
