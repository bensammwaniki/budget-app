import React, { createContext, useContext } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';

const ScrollContext = createContext<{
    tabBarVisible: { value: number };
    showTabBar: () => void;
    hideTabBar: () => void;
} | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
    const tabBarVisible = useSharedValue(1); // 0 = hidden, 1 = shown

    const showTabBar = () => {
        'worklet';
        tabBarVisible.value = withTiming(1, { duration: 300 });
    };

    const hideTabBar = () => {
        'worklet';
        // Disabled hiding logic as per request to keep it permanently visible
        // tabBarVisible.value = withTiming(0, { duration: 300 });
        tabBarVisible.value = withTiming(1, { duration: 300 });
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
        // Return no-op functions instead of throwing to prevent crashes during initialization
        console.warn('useScrollVisibility called outside ScrollProvider, using no-op functions');
        return {
            tabBarVisible: { value: 1 },
            showTabBar: () => { },
            hideTabBar: () => { }
        };
    }
    return context;
}
