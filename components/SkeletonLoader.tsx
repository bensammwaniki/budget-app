import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';

interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    borderRadius?: number;
    style?: ViewStyle | ViewStyle[];
}

export const Shimmer = ({ width, height, borderRadius = 8, style }: SkeletonProps) => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={[
                {
                    borderRadius,
                    backgroundColor: '#e2e8f0', // slate-200 equivalent
                    opacity: opacity,
                },
                style,
                width ? { width: width as any } : {},
                height ? { height: height as any } : {},
            ]}
        />
    );
};

export const BalanceCardSkeleton = () => (
    <View className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
        <Shimmer width={100} height={16} borderRadius={4} style={{ marginBottom: 12 }} />
        <Shimmer width={200} height={40} borderRadius={8} style={{ marginBottom: 24 }} />
        <View className="flex-row justify-between gap-3">
            <Shimmer width="48%" height={50} borderRadius={12} />
            <Shimmer width="48%" height={50} borderRadius={12} />
        </View>
    </View>
);

export const TransactionSkeleton = () => (
    <View className="flex-row items-center bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm mb-4">
        <Shimmer width={48} height={48} borderRadius={24} style={{ marginRight: 16 }} />
        <View className="flex-1">
            <Shimmer width="60%" height={16} borderRadius={4} style={{ marginBottom: 8 }} />
            <Shimmer width="40%" height={12} borderRadius={4} />
        </View>
        <Shimmer width={60} height={16} borderRadius={4} />
    </View>
);

export const HomeSkeleton = () => (
    <View className="px-6 pt-16">
        <View className="flex-row justify-between items-center mb-8">
            <View>
                <Shimmer width={80} height={14} borderRadius={4} style={{ marginBottom: 8 }} />
                <Shimmer width={150} height={28} borderRadius={8} />
            </View>
        </View>
        <BalanceCardSkeleton />
        <View className="mt-8">
            <Shimmer width={150} height={20} borderRadius={4} style={{ marginBottom: 16 }} />
            <TransactionSkeleton />
            <TransactionSkeleton />
            <TransactionSkeleton />
            <TransactionSkeleton />
            <TransactionSkeleton />
        </View>
    </View>
);
