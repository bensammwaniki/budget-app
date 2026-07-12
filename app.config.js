const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
    "expo": {
        "name": IS_DEV ? "Fanga Dev" : "Fanga Budget",
        "slug": "budget-app",
        "version": "1.0.0",
        "orientation": "portrait",
        "icon": "./assets/images/icon.png",
        "scheme": "fangabudget",
        "userInterfaceStyle": "automatic",
        "newArchEnabled": true,
        "ios": {
            "supportsTablet": true,
            "config": {
                "usesNonExemptEncryption": false
            },
            "bundleIdentifier": IS_DEV ? "com.bensammwaniki.budgetapp.dev" : "com.bensammwaniki.budgetapp"
        },
        "android": {
            "package": IS_DEV ? "fanga_budget.android.dev" : "fanga_budget.android",
            "versionCode": 1,
            "adaptiveIcon": {
                "backgroundColor": "#E6F4FE",
                "foregroundImage": "./assets/images/icon.png",
                "backgroundImage": "./assets/images/icon.png",
                "monochromeImage": "./assets/images/android-icon-monochrome.png"
            },
            "permissions": [
                "READ_SMS"
            ],
            "softwareKeyboardLayoutMode": "resize",
            "googleServicesFile": "./google-services.json",
            "edgeToEdgeEnabled": true,
            "predictiveBackGestureEnabled": false
        },
        "web": {
            "output": "static",
            "favicon": "./assets/images/favicon.png"
        },
        "plugins": [
            "expo-router",
            [
                "expo-splash-screen",
                {
                    "image": "./assets/images/loading.gif",
                    "imageWidth": 100,
                    "resizeMode": "contain",
                    "backgroundColor": "#ffffff",
                    "dark": {
                        "backgroundColor": "#000000"
                    }
                }
            ],
            "expo-build-properties",
            "expo-sqlite",
            [
                "expo-local-authentication",
                {
                    "faceIDPermission": "Allow $(PRODUCT_NAME) to use Face ID to unlock your financial data."
                }
            ],
            [
                "expo-secure-store",
                {
                    "configureAndroidBackup": true,
                    "faceIDPermission": "Allow $(PRODUCT_NAME) to securely access your Face ID biometric data."
                }
            ],
            "expo-web-browser"
        ],
        "experiments": {
            "typedRoutes": true,
            "reactCompiler": true
        },
        "extra": {
            "router": {},
            "eas": {
                "projectId": "108d52d2-3deb-4d86-a451-af3ef922d5c1"
            }
        }
    }
};
