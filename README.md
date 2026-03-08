# Fanga Budget 💰

A modern, feature-rich budget tracking application built with React Native and Expo. Take charge of your finances with a beautiful, intuitive interface featuring premium glassmorphism design.

## ✨ Features

- **🔐 Authentication**
  - Email/Password authentication via Firebase
  - Protected routes with automatic redirection
  - Persistent user sessions with AsyncStorage
  - Optional AWS cloud backup restore on sign-in

- **🎨 Premium UI/UX**
  - Glassmorphism design with foggy glass effects
  - Light/Dark mode support with smooth transitions
  - Responsive layouts optimized for mobile devices
  - Modern gradient backgrounds and blur effects

- **📊 Core Functionality**
  - Budget tracking and analytics
  - Tab-based navigation (Home, Analytics, Explore, Profile)
  - User profile management
  - Real-time data synchronization

- **⚡ Performance**
  - Built with React 19 and React Native 0.81
  - NativeWind (TailwindCSS) for efficient styling
  - Optimized Metro bundler configuration
  - Expo Go compatible

## 🛠 Tech Stack

### Core
- **React Native** 0.81.5
- **Expo** ~54.0.25
- **TypeScript** ~5.9.2
- **Expo Router** ~6.0.15 (File-based routing)

### Styling
- **NativeWind** ^4.2.1 (TailwindCSS for React Native)
- **TailwindCSS** ^3.4.18
- **expo-blur** ~15.0.7
- **expo-linear-gradient** ^15.0.7

### Backend & State
- **Firebase** ^12.6.0 (Authentication)
- **AsyncStorage** 2.2.0 (Persistent storage)

### Navigation
- **Expo Router** (File-based routing)
- **React Navigation** ^7.1.8

## 📦 Installation

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Expo Go** app (for testing on physical devices)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd budget-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Email/Password authentication
   - Copy your Firebase configuration
   
   **Environment Variables Setup:**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Update `.env` with your Firebase credentials:
     ```bash
     EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
     EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
     EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
     EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
     EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
     EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id_here
     EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
     EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL=https://your-api.example.com/backup/{uid}
     EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL=https://your-api.example.com/backup/{uid}
     ```
   
   > **Note**: The `.env` file is gitignored and will not be committed. Never commit sensitive credentials to version control.

4. **Start the development server**
   ```bash
   npm start
   # or with cache clear
   npx expo start -c
   ```

5. **Run on your device**
   - Scan the QR code with Expo Go (Android) or Camera app (iOS)
   - Or press `a` for Android emulator, `i` for iOS simulator

## 📁 Project Structure

```
budget-app/
├── app/                      # Expo Router pages
│   ├── (auth)/              # Authentication screens
│   │   ├── login.tsx        # Login screen
│   │   └── signup.tsx       # Signup screen
│   ├── (tabs)/              # Main app tabs
│   │   ├── index.tsx        # Home/Dashboard
│   │   ├── analytics.tsx    # Analytics screen
│   │   ├── explore.tsx      # Explore screen
│   │   └── profile.tsx      # User profile
│   └── _layout.tsx          # Root layout with auth provider
├── components/              # Reusable components
│   ├── GlassLayout.tsx      # Glassmorphism wrapper
│   ├── themed-text.tsx      # Themed text component
│   └── ui/                  # UI components
├── services/                # Backend services
│   ├── AuthContext.tsx      # Authentication context
│   └── firebaseConfig.ts    # Firebase configuration
├── hooks/                   # Custom React hooks
├── constants/               # App constants
├── assets/                  # Images, fonts, etc.
├── .env                     # Environment variables (gitignored)
├── .env.example             # Environment template
├── global.css              # Global Tailwind styles
├── tailwind.config.js      # Tailwind configuration
├── metro.config.js         # Metro bundler config (NativeWind)
├── babel.config.js         # Babel configuration
└── package.json            # Dependencies
```

## ⚙️ Configuration Files

### Essential Configs

- **`metro.config.js`** - Required for NativeWind v4 support
- **`tailwind.config.js`** - TailwindCSS configuration with NativeWind preset
- **`babel.config.js`** - NativeWind Babel plugin configuration
- **`global.css`** - Tailwind directives (@tailwind base/components/utilities)
- **`nativewind-env.d.ts`** - TypeScript definitions for NativeWind

### Firebase Setup

Firebase credentials are managed through environment variables. See the **Configure Firebase** section in the Installation guide above for setup instructions.

The configuration in `services/firebaseConfig.ts` automatically reads from environment variables:
```typescript
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};
```

> **Security**: Never commit your `.env` file. Use `.env.example` as a template for team members.

### AWS Backup Endpoints

If `EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL` and `EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL` are set:
- Login triggers cloud sync automatically:
  - If cloud backup is newer, local DB is restored from AWS.
  - If local DB is newer, local snapshot is uploaded.
- DB changes trigger debounced auto-backup uploads.
- URLs can include `{uid}` placeholder for per-user key routing.

### Deploy AWS Backup API

A ready-to-deploy backend is included at:
- `aws/backup-api`

It includes:
- Lambda handler with Firebase token verification
- S3-backed backup storage
- SAM template (`aws/backup-api/template.yaml`) for API Gateway + Lambda + S3

Deployment steps are documented in:
- `aws/backup-api/README.md`

## 🚀 Available Scripts

```bash
npm start          # Start Expo development server
npm run android    # Run on Android device/emulator
npm run ios        # Run on iOS simulator
npm run web        # Run in web browser
npm run lint       # Run ESLint
```

## 🎨 Design System

### Glassmorphism Effect
The app features a custom `GlassLayout` component with:
- Gradient backgrounds (light: blue-purple, dark: deep slate)
- Dynamic blur intensity (light: 90, dark: 60)
- Semi-transparent overlays for depth
- Automatic light/dark mode switching

### Color Palette
- **Light Mode**: Soft blue-purple gradients with frosted glass
- **Dark Mode**: Deep slate gradients with subtle blur
- **Accent**: Blue (#3b82f6) for primary actions

## 🔒 Authentication Flow

1. App starts → Check auth state
2. Not authenticated → Redirect to `/login`
3. User signs up/logs in via Firebase
4. Authenticated → Redirect to `/(tabs)`
5. Session persists via AsyncStorage

## 📱 Expo Go Compatibility

This app is fully compatible with Expo Go. The Metro config has been set up to support:
- NativeWind styling in Expo Go
- Hot reloading with Tailwind classes
- Firebase authentication

**Important**: After code changes, restart the server with:
```bash
npx expo start -c
```

## 🐛 Troubleshooting

### Tailwind not working in Expo Go
- Ensure `metro.config.js` exists with NativeWind wrapper
- Clear cache: `npx expo start -c`
- Verify `global.css` is imported in `app/_layout.tsx`

### Firebase authentication errors
- Check Firebase credentials in `firebaseConfig.ts`
- Verify Email/Password provider is enabled in Firebase Console
- Ensure AsyncStorage is installed

### Build errors
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Metro cache: `npx expo start -c`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [Expo](https://expo.dev)
- Styled with [NativeWind](https://www.nativewind.dev/)
- Authentication by [Firebase](https://firebase.google.com)
- Icons from [@expo/vector-icons](https://icons.expo.fyi/)

---

**Made with ❤️ for better financial management**
