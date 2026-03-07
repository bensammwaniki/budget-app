import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

type AlertType = 'success' | 'error' | 'info' | 'warning';

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertConfig {
    title: string;
    message?: string;
    type?: AlertType;
    buttons?: AlertButton[];
}

interface AlertContextType {
    showAlert: (config: AlertConfig) => void;
    hideAlert: () => void;
    alertConfig: AlertConfig | null;
    isVisible: boolean;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

    const showAlert = useCallback((config: AlertConfig) => {
        setAlertConfig(config);
        setIsVisible(true);
    }, []);

    const hideAlert = useCallback(() => {
        setIsVisible(false);
        // Clear config after animation is likely done to prevent content jump
        setTimeout(() => {
            setAlertConfig(null);
        }, 300);
    }, []);

    useEffect(() => {
        const originalAlert = Alert.alert;

        Alert.alert = (
            title: string,
            message?: string,
            buttons?: { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
        ) => {
            showAlert({
                title,
                message,
                type: 'info',
                buttons: buttons && buttons.length > 0
                    ? buttons.map((b) => ({
                        text: b.text || 'OK',
                        onPress: b.onPress,
                        style: b.style || 'default'
                    }))
                    : [{ text: 'OK', style: 'default' }]
            });
        };

        return () => {
            Alert.alert = originalAlert;
        };
    }, [showAlert]);

    return (
        <AlertContext.Provider value={{ showAlert, hideAlert, alertConfig, isVisible }}>
            {children}
        </AlertContext.Provider>
    );
};

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
};
