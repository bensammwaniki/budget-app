import { signOut as firebaseSignOut, onAuthStateChanged, updateProfile, User } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getUserSettings, saveUserSettings } from './database';
import { auth, storage } from './firebaseConfig';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    phoneNumber: string | null;
    signOut: () => Promise<void>;
    updateUserProfile: (data: { displayName?: string; photoURL?: string; phoneNumber?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    phoneNumber: null,
    signOut: async () => { },
    updateUserProfile: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    // Database is initialized by HomeScreen, just load settings here
                    const storedPhone = await getUserSettings('phoneNumber');
                    setPhoneNumber(storedPhone);
                } catch (error) {
                    console.error('Error loading user settings:', error);
                }
            } else {
                setPhoneNumber(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    const updateUserProfile = async (data: { displayName?: string; photoURL?: string; phoneNumber?: string }) => {
        if (!auth.currentUser) return;

        try {
            // Update Firebase Profile
            // Update Firebase Profile
            if (data.displayName !== undefined || data.photoURL !== undefined) {
                let photoURL = data.photoURL;

                // Should we upload first?
                if (photoURL && !photoURL.startsWith('http')) {
                    // It's a local URI, upload it
                    photoURL = await uploadImageToStorage(photoURL, auth.currentUser.uid);
                }

                await updateProfile(auth.currentUser, {
                    displayName: data.displayName,
                    photoURL: photoURL
                });
                // Force refresh user object
                setUser({ ...auth.currentUser });
            }

            // Update Local Settings (Phone Number)
            if (data.phoneNumber !== undefined) {
                await saveUserSettings('phoneNumber', data.phoneNumber);
                setPhoneNumber(data.phoneNumber);
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    };

    const uploadImageToStorage = async (uri: string, userId: string): Promise<string> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();

            const filename = `profile_images/${userId}/${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, phoneNumber, signOut, updateUserProfile }}>
            {children}
        </AuthContext.Provider>
    );
}
