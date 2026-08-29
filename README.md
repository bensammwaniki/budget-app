# Fanga Budget

Fanga Budget is a local-first personal-finance app for tracking Kenyan financial activity in KES. It imports supported SMS transactions on Android, supports manual entries, and brings budgeting, debts, savings, income, automation, analytics, export, and app security into one ledger-based experience.

For the complete product and QA reference, see [APP_SPECIFICATION.md](./APP_SPECIFICATION.md).

## What it does

- Imports and categorizes supported M-PESA SMS transactions on Android.
- Tracks optional I&M Bank SMS activity, including transfers, card purchases, and short-term loan activity.
- Records manual cash, M-PESA, and bank income/expense entries, including monthly recurring entries.
- Maintains accounts and internal transfers without counting transfers as income or spending.
- Organizes transactions with categories, learned recipient associations, and configurable automation rules.
- Manages income sources, recurring-income detection, SMS matching, and manual income records.
- Manages savings goals, deposits, progress, target dates, and linked transactions.
- Manages liabilities, receivables, Fuliza/overdraft activity, linked repayments, debt clearing, and debt merging.
- Supports monthly budgets, financial-period summaries, spending analysis, net worth, forecasts, and Excel export.
- Protects financial data with a PIN, optional biometrics, lock timeout, and optional AWS backup.

## Platforms and important limitations

| Platform | Support |
| --- | --- |
| Android | Full feature set, including SMS import after `READ_SMS` permission is granted. Use a development/custom build for native SMS functionality. |
| iOS | Finance, authentication, manual entry, and supported non-SMS features; device SMS import is not available. |
| Web | Supported UI and non-native features; device SMS import and native security/photo flows have platform limitations. |

The app currently requires Android SMS permission before it renders the protected app experience. I&M Bank is the only bank currently exposed in the bank settings UI.

## Main areas

| Area | Description |
| --- | --- |
| Home | Liquid-cash overview, period filters, transaction search, SMS sync, manual entries, categorization, and transaction linking. |
| Analytics | Savings rate, debt-to-income ratio, spending velocity, category trends, net worth, and forecasts. |
| Debts | Liabilities, receivables, Fuliza, repayments, payment linking, clearing, and merging. |
| Savings | Savings-goal creation, progress, deposit history, and transaction linking. |
| Profile | Profile/security settings, dark mode, budgets, banks, automation, financial settings, Excel export, and privacy policy. |

Income management is available from Profile rather than the visible bottom tab bar. It includes manual sources, pattern detection, history, SMS matching, and manual records.

## Technology

- Expo 57, React Native 0.86, React 19, TypeScript
- Expo Router and React Navigation
- NativeWind / Tailwind CSS styling
- Expo SQLite for the local ledger and application data
- Firebase Authentication and Firebase Storage
- Android SMS access through `react-native-get-sms-android`
- SecureStore and Local Authentication for app locking
- Optional AWS Lambda/S3-compatible cloud backup API

## Prerequisites

- Node.js 18 or newer
- npm
- Android Studio/emulator or Android device for SMS features
- A Firebase project with Email/Password authentication enabled

For Android SMS support, use an Android development build or APK rather than Expo Go.

## Setup

1. Clone and install dependencies.

   ```bash
   git clone <repository-url>
   cd budget-app
   npm install
   ```

2. Create your local environment file.

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS/Linux:

   ```bash
   cp .env.example .env
   ```

3. Configure Firebase values in `.env`.

   ```dotenv
   EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
   EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id_here
   EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
   ```

4. Start the development server.

   ```bash
   npm start
   ```

5. Run the app.

   ```bash
   npm run android:dev
   # or
   npm run ios
   # or
   npm run web
   ```

## Optional AWS cloud backup

Set both endpoints to enable cloud backup. Endpoints may use `{uid}` in their URL and must accept Firebase Bearer-token authentication.

```dotenv
EXPO_PUBLIC_AWS_BACKUP_UPLOAD_URL=https://your-api.example.com/backup/{uid}
EXPO_PUBLIC_AWS_BACKUP_DOWNLOAD_URL=https://your-api.example.com/backup/{uid}
```

When configured, sign-in compares the local data with the remote backup. A newer valid backup is restored; newer local data is uploaded. Later eligible database changes are uploaded after a debounce, and sign-out attempts a final backup.

The deployable API implementation is in [aws/backup-api](./aws/backup-api), with deployment instructions in [aws/backup-api/README.md](./aws/backup-api/README.md).

## Available scripts

```bash
npm start                # Start Expo
npm run start:dev        # Start Expo with development app variant
npm run start:prod       # Start Expo with production app variant
npm run android          # Run Android
npm run android:dev      # Run Android development variant
npm run android:prod     # Run Android production variant
npm run ios              # Run iOS
npm run web              # Start web
npm run lint             # Run Expo ESLint
npm run build:internal   # Create internal Android EAS build
npm run build:dev        # Create development Android EAS build
```

## Data and security model

- Financial records are stored locally in the Expo SQLite database.
- The app has one local profile at a time. When another Firebase user signs in on the same device, the prior local finance profile is cleared to avoid exposing it to the new user.
- PINs and PIN-attempt guards are stored in SecureStore and scoped to the signed-in user.
- Biometrics are available only on devices with enrolled supported hardware.
- SMS content is processed locally for supported transaction detection. Review the in-app Privacy Policy for the user-facing policy.
- `.env` contains credentials and must not be committed. Use `.env.example` as the template.

## Project layout

```text
app/                    Expo Router screens and route groups
  (auth)/               Login and sign-up
  (tabs)/               Home, analytics, debts, savings, profile, and income route
  automation/           Categorization rules and recurring manual entries
  banks/                Supported-bank preferences
  budget/               Monthly budget editor
  debt/                 Debt create/detail/select/merge workflows
  income/               Income source workflows
  savings/              Savings goal workflows
components/             Shared UI, sheets, modals, transaction and security components
context/                Alerts and app-lock state
services/               Database, ledger, parsing, finance, backup, export, and auth logic
types/                  Core TypeScript models
utils/                  SMS parsers, Fuliza calculator, and utilities
aws/backup-api/         Optional AWS backup API
APP_SPECIFICATION.md    Detailed functional/UI/QA specification
```

## Validation

Run linting before submitting changes:

```bash
npm run lint
```

For behavior verification, use the acceptance checklist in [APP_SPECIFICATION.md](./APP_SPECIFICATION.md#9-qa-acceptance-checklist). SMS parsing, permission, biometric, camera, and backup paths must be tested on relevant devices and configured services; they cannot be fully validated in a web-only run.

## License

This project is released under the [Fanga Budget Proprietary Use License](./LICENSE). Copyright © 2026 Bensam Mwaniki. The software may be used free of charge in its unmodified form; all modifications, feature additions, and official releases are reserved to the copyright holder unless authorized in writing.
