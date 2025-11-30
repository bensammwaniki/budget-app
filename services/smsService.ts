import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';

export interface SMSMessage {
    _id: string;
    address: string;
    body: string;
    date: number;
    type: number;
}

/**
 * Request SMS permissions on Android
 */
export const requestSMSPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        console.log('SMS reading only supported on Android');
        return false;
    }

    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_SMS,
            {
                title: 'SMS Permission',
                message: 'This app needs access to your SMS messages to track M-PESA transactions',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
            }
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
        console.error('Error requesting SMS permission:', err);
        return false;
    }
};

/**
 * Read M-PESA SMS messages from the phone
 */
export const readMpesaSMS = async (): Promise<string[]> => {
    if (Platform.OS !== 'android') {
        console.log('SMS reading only supported on Android');
        return [];
    }

    try {
        // Check permission first
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_SMS
        );

        if (!hasPermission) {
            const granted = await requestSMSPermission();
            if (!granted) {
                console.log('SMS permission denied');
                return [];
            }
        }

        return new Promise((resolve, reject) => {
            const filter = {
                box: 'inbox', // 'inbox', 'sent', 'draft', 'outbox', 'failed', 'queued'
                address: 'MPESA', // Filter for M-PESA sender
                indexFrom: 0,
                maxCount: 100, // Get last 100 M-PESA messages
            };

            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => {
                    console.error('Failed to read SMS:', fail);
                    reject(fail);
                },
                (count: number, smsList: string) => {
                    try {
                        const messages: SMSMessage[] = JSON.parse(smsList);
                        const mpesaTexts = messages.map(msg => msg.body);
                        console.log(`Found ${mpesaTexts.length} M-PESA messages`);
                        resolve(mpesaTexts);
                    } catch (error) {
                        console.error('Error parsing SMS:', error);
                        reject(error);
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error reading M-PESA SMS:', error);
        return [];
    }
};
