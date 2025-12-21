import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useColorScheme } from 'nativewind';
import React, { useEffect } from 'react';
import { Dimensions, Modal, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { useAlert } from '../context/AlertContext';

const { width } = Dimensions.get('window');

const CustomAlert: React.FC = () => {
    const { isVisible, alertConfig, hideAlert } = useAlert();
    const { colorScheme } = useColorScheme();
    const scale = useSharedValue(0.8);
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (isVisible) {
            opacity.value = withTiming(1, { duration: 200 });
            scale.value = withSpring(1, { damping: 15, stiffness: 150 });
        } else {
            opacity.value = withTiming(0, { duration: 200 });
            scale.value = withTiming(0.8, { duration: 200 });
        }
    }, [isVisible]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    if (!alertConfig && !isVisible) return null;

    const getIcon = () => {
        switch (alertConfig?.type) {
            case 'success':
                return <Ionicons name="checkmark-circle" size={48} color="#22c55e" />;
            case 'error':
                return <Ionicons name="close-circle" size={48} color="#ef4444" />;
            case 'warning':
                return <Ionicons name="warning" size={48} color="#f59e0b" />;
            case 'info':
            default:
                return <Ionicons name="information-circle" size={48} color="#3b82f6" />;
        }
    };

    const handleButtonPress = (onPress?: () => void) => {
        hideAlert();
        if (onPress) {
            // slightly delay callback to allow animation to start
            setTimeout(onPress, 100);
        }
    };

    return (
        <Modal transparent visible={isVisible} animationType="none">
            <View className="flex-1 justify-center items-center">
                <Animated.View style={[backdropStyle, { position: 'absolute', width: '100%', height: '100%' }]}>
                    <BlurView intensity={30} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                </Animated.View>

                <Animated.View style={[animatedStyle, { width: width * 0.85, maxWidth: 340 }]}>
                    <View className="bg-white dark:bg-[#1e293b] rounded-3xl p-6 shadow-2xl items-center border border-gray-100 dark:border-slate-700">
                        <View className="mb-4">
                            {getIcon()}
                        </View>

                        <Text className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">
                            {alertConfig?.title}
                        </Text>

                        {alertConfig?.message && (
                            <Text className="text-slate-600 dark:text-slate-300 text-center mb-6 leading-5">
                                {alertConfig.message}
                            </Text>
                        )}

                        <View className="flex-row justify-center w-full gap-3 flex-wrap">
                            {(alertConfig?.buttons || [{ text: 'OK', onPress: () => { } }]).map((btn, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => handleButtonPress(btn.onPress)}
                                    className={`flex-1 min-w-[100px] py-3 rounded-xl items-center justify-center ${btn.style === 'cancel'
                                        ? 'bg-gray-100 dark:bg-slate-800'
                                        : btn.style === 'destructive'
                                            ? 'bg-red-50 dark:bg-red-900/20'
                                            : 'bg-blue-600'
                                        }`}
                                >
                                    <Text className={`font-semibold ${btn.style === 'cancel'
                                        ? 'text-slate-600 dark:text-slate-300'
                                        : btn.style === 'destructive'
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-white'
                                        }`}>
                                        {btn.text}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

export default CustomAlert;
