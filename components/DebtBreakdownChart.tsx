import React, { useState } from "react";
import { Text, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";

export type DebtItem = {
    label: string;
    value: number;
    color: string;
};

interface Props {
    data: DebtItem[];
}

export default function DebtBreakdownChart({ data }: Props) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    if (data.length === 0) {
        return (
            <View className="items-center justify-center py-8">
                <Text className="text-gray-400">No active debts</Text>
            </View>
        );
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);

    const pieData = data.map((item, index) => ({
        value: item.value,
        color: item.color,
        focused: selectedIndex === index,
        onPress: () => setSelectedIndex(index),
    }));

    const selectedItem =
        selectedIndex !== null ? data[selectedIndex] : null;

    const percentage = selectedItem
        ? ((selectedItem.value / total) * 100).toFixed(0)
        : 100;

    return (
        <View className="items-center justify-center ">

            {/* Chart */}
            <PieChart
                data={pieData}
                donut
                radius={60}
                innerRadius={45}
                focusOnPress
                showText={false}
                innerCircleColor="#fff" // TODO: Handle Dark Mode via prop or hook
                centerLabelComponent={() => {
                    return (
                        <View className="items-center">
                            <Text className="text-3xl font-bold text-gray-900">
                                {percentage}%
                            </Text>
                            <Text className="text-sm text-gray-500">
                                {selectedItem ? selectedItem.label : "Total Debt"}
                            </Text>
                        </View>
                    );
                }}
            />

            {/* Legend */}
            <View className="mt-6 w-full px-4">
                {data.map((item, index) => (
                    <View
                        key={index}
                        className="flex-row items-center justify-between mb-3"
                    >
                        <View className="flex-row items-center">
                            <View
                                style={{ backgroundColor: item.color }}
                                className="w-3 h-3 rounded-full mr-3"
                            />
                            <Text className="text-gray-700 font-medium items-center">{item.label?.slice(0, 5)}  </Text>
                        </View>

                        <Text className="font-semibold text-gray-900">
                            KES {item.value.toLocaleString()}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
