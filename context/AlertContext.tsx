import React, { createContext, ReactNode, useCallback, useContext, useState } from 'react';

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
