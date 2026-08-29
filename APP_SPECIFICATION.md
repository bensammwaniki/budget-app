# Fanga Budget — Application Specification

**Version:** 1.0.0 (codebase review)  
**Platform:** Expo / React Native application for Android, iOS, and web  
**Primary market and currency:** Kenya; monetary values are presented in KES  
**Review basis:** Static review of routes, components, services, schemas, configuration, and UI copy in this repository. This is a product and QA specification; device- and service-dependent behavior still requires runtime validation.

## 1. Product purpose

Fanga Budget is a local-first personal-finance application. It imports and parses supported transaction SMS messages, lets a signed-in user correct and organize the resulting records, and provides budgeting, debt, income, savings, automation, analytics, export, security, and optional cloud-backup capabilities.

The main financial model is a ledger of transactions linked to accounts. M-PESA, bank, and manual cash activity can be represented. Internal transfers are deliberately excluded from cash-flow calculations so that moving money between a user's accounts is not treated as income or spending.

## 2. Scope, platforms, and dependencies

| Area | Specification |
| --- | --- |
| App shell | Expo Router file-based navigation; portrait orientation; automatic system light/dark appearance. |
| Client state | React contexts for authentication, alerts, scroll/tab-bar visibility, and app locking. |
| Local persistence | Expo SQLite database (`unified.db`) with migrations and seeded categories/default accounts. |
| Authentication | Firebase email/password and Google sign-in. |
| Profile image storage | Firebase Storage. |
| Device permissions | Android `READ_SMS`; camera and media-library permission when changing a profile photo. |
| Device security | SecureStore PIN, optional enrolled-device biometrics, configurable lock timeout. |
| SMS support | Android only. Non-Android platforms do not require SMS permission and return no device SMS messages. |
| Optional backup | AWS HTTP endpoints configured through public environment variables; authentication token is used by the backup service. |
| Export | Locally generated Excel-compatible `.xlsx` workbook. |

## 3. Navigation and information architecture

After authentication and permission gating, the persistent bottom navigation contains five visible destinations:

| Tab | Route | Purpose |
| --- | --- | --- |
| Home | `/(tabs)` | Financial overview and transaction workspace. |
| Analytics | `/(tabs)/analytics` | Metrics, trends, forecasts, and budgeting insights. |
| Debts | `/(tabs)/debts` | Liabilities and receivables. |
| Savings | `/(tabs)/savings` | Savings goals and linked deposits. |
| Profile | `/(tabs)/profile` | Profile, security, preferences, configuration, and tools. |

Income is implemented as a tab route but intentionally hidden from the bottom navigation. It is accessed from Profile. The custom tab bar can hide while the user scrolls and reappear when scrolling upward.

Secondary routes:

| Area | Routes / entry point |
| --- | --- |
| Authentication | `/login`, `/signup` |
| Budget | `/budget` from Profile |
| Banks | `/banks` from Profile |
| Automation | `/automation`, `/automation/create`, `/automation/manual-recurring` |
| Debt | `/debt/add`, `/debt/[id]`, `/debt/select`, `/debt/merge` |
| Income | `/income/add`, `/income/detect`, `/income/[id]` |
| Savings | `/savings/add`, `/savings/[id]` |
| Legal | `/privacy-policy` |

## 4. Global app lifecycle and gates

1. The root layout initializes the SQLite database, including schema migrations and default data.
2. Firebase authentication state determines whether the user is directed to authentication routes or the main application.
3. A permission gate blocks app content until Android SMS read access is granted. It supplies **Grant Permission** and **Open Settings** actions. This is a global gate, including for signed-in users.
4. For authenticated, non-auth routes, the security provider initializes the PIN/biometric state and displays the app lock when appropriate.
5. On first Home launch, the app displays an optional four-step guide. It can be skipped; Profile can reset the flag so it is shown again.
6. Home initializes transaction syncing. First use attempts a fast 30-day sync followed by a background 366-day sync; later launches use incremental sync. Manual refresh syncs a recent period.

## 5. Functional requirements

### 5.1 Authentication and identity

- Users can create an account with full name, email address, and password.
- Users can sign in with email/password or Google Sign-In.
- Empty credential fields are rejected before submission; Firebase errors are shown to the user.
- Sessions are monitored by Firebase and route redirection is automatic.
- Signing out confirms intent, attempts a final AWS backup when configured, and ends the Firebase session.
- The local finance profile is single-user. If a different Firebase user signs in on the same device, existing local financial records are cleared and categories/default accounts are reseeded before that user sees data.
- Profile updates may change display name, phone number, and photo. A locally selected photo is uploaded to Firebase Storage before the Firebase profile is updated.

### 5.2 SMS ingestion, parsing, and reconciliation

- The app requests and checks Android SMS-read permission before using SMS data.
- It reads inbox messages in batches, with date-bound scanning and a safety cap for very large histories.
- M-PESA messages are parsed into standard transactions where supported.
- Fuliza loan and repayment messages are detected before generic M-PESA parsing; they create/update Fuliza debt activity and repayment records.
- I&M Bank parsing is opt-in from **My Banks**. Enabling it clears processed-message cache and performs a current-period rescan. Supported parsing includes transfers, card purchases, and I&M short-term loan activity.
- Duplicate messages/transactions are prevented using stored processed IDs and transaction IDs.
- Matching bank/M-PESA references are reconciled as internal transfers where possible.
- SMS statement balances are used to reconcile the M-PESA account balance after sync.
- New incoming transactions may automatically reconcile with income-source schedules or matching SMS sender rules.
- Sync failures return an error state/message; imported transaction counts are reported for manual sync actions.

### 5.3 Home dashboard and transaction management

The Home screen is the operational financial dashboard.

- It greets the user, shows synchronization state, and supports pull-to-refresh.
- A financial-period selector supports **This Month**, **Last Month**, **Last 3 Months**, **Current Year**, and **All Time**.
- It calculates liquid cash from active non-deleted cash-flow transactions plus an optional opening baseline. Debt principal and internal transfers are excluded.
- It displays period-level earned, borrowed, spent, cash change, surplus/deficit, and debt summary information when data is available.
- Transactions can be searched by normalized transaction text and displayed progressively with “load more” behavior.
- Bank records are hidden when I&M parsing is disabled. Internal transfers can be hidden through financial settings.
- A transaction item exposes source/direction, counterparty, date, category, amount, status indicators, and an interaction to open transaction management.
- The transaction categorization flow supports:
  - selecting a category;
  - adding a category;
  - changing transaction date;
  - confirming a KES amount when a card charge requires confirmation;
  - flagging an inbound transaction as borrowed money and creating/linking a debt;
  - linking an eligible expense to a savings goal;
  - linking an eligible receipt to an income source;
  - deleting a transaction after confirmation;
  - choosing whether recategorization applies only to this record, past similar records, future transactions, or all matching transactions.
- Users can manually create a cash, M-PESA, or bank entry. They choose sent/received direction, amount, note, date, account, and whether it recurs monthly. Normal entries are ledger transactions; recurring entries become templates and generate due monthly entries.

### 5.4 Accounts and ledger behavior

- Default account types are M-PESA, bank, cash, and debt; all accounts use KES by default.
- A standard ledger transaction atomically inserts a transaction and adjusts the selected account balance.
- A transfer produces linked debit and credit rows with a shared reference ID and is marked internal.
- Transfers can warn rather than strictly prevent a non-debt account going below zero.
- Transactions include audit-oriented IDs, created/updated timestamps, soft-deletion fields, raw SMS, optional category, account, debt, goal, and reference links.

### 5.5 Categories and automation

- Categories have a name, transaction type (expense/income), icon, color, optional description, and custom flag.
- Profile lists custom categories. Users can create categories and delete custom categories with confirmation/error feedback.
- Automation rules can categorize income or expense transactions using one or more of:
  - time range;
  - amount range;
  - description keyword.
- A rule requires a name, target category, and at least one condition.
- On creation, enabled rules are applied to existing eligible transactions; the resulting count is shown.
- Rule list items show rule type, condition summary, enabled toggle, action summary, and delete action.
- Turning a rule on applies it to existing records. Turning it off stops future use without undoing historical categorization. System-created recipient rules are intentionally not shown in the user rule list.

### 5.6 Manual recurring transactions

- Manual recurring entries are managed separately from categorization automation.
- The user can view templates, enable/disable them, edit type/account/amount/description/start settings, and delete them with confirmation.
- Due monthly transactions are generated when Home initializes and whenever the app becomes active. Creation of a recurring manual entry also runs generation through the current date.

### 5.7 Income sources

- Income sources can be added manually with name, expected amount, receiving account, date, recurrence toggle, frequency (monthly, weekly, or irregular), and theme color.
- The app offers detected recurring-income patterns generated from transaction history. A user can create a source from a suggestion.
- The Income overview presents current/previous-month totals, trend, source count, and each source’s summary/status.
- Source detail shows schedule, expected amount, frequency, number of entries, history, and linked transactions.
- Source detail supports manual income recording (amount, channel/account, optional note), linking eligible received transactions, unlinking records, SMS sender matching setup, and source deletion.
- For an SMS-matched source, new qualifying incoming SMS transactions are automatically recorded against it.

### 5.8 Savings goals

- A savings goal includes name, target amount, optional target date, color, current amount, and active/completed/paused status.
- The Savings overview shows total saved, target, percentage progress, goal count, and list-card progress. Empty state directs users to create a goal.
- Goals can be created and edited through the add route.
- Goal detail shows progress, remaining amount, target date, completion state, and deposit history.
- Users can query eligible transactions, link them as goal deposits, unlink deposits, and delete a goal with confirmation.
- A linked savings transaction updates the goal’s current amount; completion is derived when the target is reached.

### 5.9 Debts and receivables

- The Debts tab supports active/paid status filtering and liability/receivable filtering, totals, counts, an empty state, and creation via a floating action button.
- Debt creation supports liability versus receivable, name, amount, optional interest rate, reducing-balance behavior, start date, optional due date, and account association. It can also originate from a “borrowed money” transaction.
- Debt detail presents outstanding amount, principal/interest context, status, inception/due date, Revolving/overdraft behavior, and a linked payment history.
- Users can link eligible transactions as payments, unlink payments, clear/mark a debt paid, delete a debt, and merge it into another active debt.
- Fuliza is modeled as an overdraft/revolving debt. Parsed SMS events update its balance and fees; repayment messages create linked debt-repayment transactions.
- I&M short-term loan messages can create a liability and separately record upfront fees.

### 5.10 Budgeting

- Budgeting is configured for the current calendar month.
- Users enter monthly income and allocate KES amounts to expense categories.
- The screen shows total allocated and remaining/unallocated amount, with a negative/over-allocation visual state.
- Users select a category to edit its allocation. Save persists the monthly budget and category allocations; back returns to Profile.

### 5.11 Analytics and forecasts

- Analytics calculates current/previous-month income and expenses, savings rate, debt-to-income ratio, daily spending velocity, savings progress, top spending category, assets, liabilities, and net worth.
- It shows spending by category for this month compared with last month and an empty state where categorization data is insufficient.
- Forecasting uses up to six earlier calendar months of cash-flow data to estimate next month’s expenses, income, savings, confidence, and budget exhaustion timing when applicable.
- Historical monthly summaries and net-worth snapshots are persisted locally for charts/trends.
- Internal transfers and debt principal are excluded from cash-flow analytics.

### 5.12 Profile, preferences, and settings

- The profile header displays photo/initial, display name, email, and saved phone number. An edit action opens profile and security controls.
- Dark mode can be toggled; the visual system supports light and dark palettes.
- Profile provides navigation to income, budget, bank settings, automation, privacy policy, and Excel export.
- Financial settings support:
  - financial-month start day (1–28);
  - liquid-cash opening baseline and effective date;
  - full SMS history synchronization;
  - destructive financial-history reset through a selected date.
- Reset removes historical transactions and related income/debt/Fuliza records through the selected date, recalculates retained goal/debt/account-derived data, preserves category/recipient/automation configuration, and clears processed SMS cache. It is explicitly irreversible in the UI.
- Excel export supports the same broad periods used by Home and presents the generated file location on completion.

### 5.13 Privacy, security, and backup

- The Privacy Policy screen states the local-first model, SMS purpose, no bank credentials, limitations of liability, and contact details.
- Users establish a required four-digit app PIN after entering the protected app area.
- An incorrect PIN is tracked per user. After five failed attempts, PIN access is locked out for five minutes.
- When the device has enrolled biometric hardware, biometrics can be enabled/disabled. Device fallback is disabled during biometric unlock so the app can direct users to the app PIN.
- App lock occurs after a configurable inactivity/background timeout (default three minutes). Lock timing resets with route activity.
- PIN values and attempt guards are stored with SecureStore, scoped to the authenticated user.
- Cloud backup is optional. When configured, sign-in begins a backup session that compares remote/local recency, restores a newer compatible backup or uploads newer local data, and later debounces data changes into uploads. Restore payloads are schema/user/date/size validated and local snapshots are retained for recovery.

## 6. UI and interaction specification

### Visual language

- The UI is mobile-first, high-density, card-based, and uses rounded controls, iconography, clear section labels, and KES-formatted figures.
- Both light and dark variants are present throughout screens. Primary actions use blue; income/success uses emerald; debt/warnings use orange, violet, or red depending on context.
- The historical design intent is glassmorphism/gradient styling; current screens primarily implement white/slate cards and themed backgrounds with the shared `app-screen` and `app-card` styles.
- Headers commonly include a back control, title, and a contextual action such as Save, Add, or Delete.
- Loading states use activity indicators or skeleton transaction rows. Long lists are scrollable and preserve bottom safe-area/ tab-bar clearance.
- Destructive operations use native or custom confirmation prompts. Success and errors surface through native alerts or the shared custom alert component.

### Key UI states to cover

| State | Expected experience |
| --- | --- |
| Startup / database initialization | Full-screen blue loading layer. |
| Authentication loading | Centered app-screen spinner. |
| SMS permission absent | Blocking explanation with grant/settings actions. |
| Security initialization / lock | Protected content waits; lock screen requires PIN setup/unlock. |
| Empty income, savings, debts, automation | Illustrated/iconic empty state with clear next action. |
| No search results / no linkable records | Clear no-results copy rather than blank UI. |
| Sync/export/save in progress | Disabled action where appropriate and spinner/status text. |
| Error | Human-readable alert with recovery route where available. |

### Accessibility requirements for validation

- All controls must be usable with touch and sufficiently separated, including the compact bottom tab bar.
- Verify readable contrast in both themes, particularly muted text, colored badges, disabled states, and text over gradients.
- Verify content remains reachable with large system text, keyboard open, small devices, notches, and Android gesture navigation.
- Add/verify meaningful accessibility labels for icon-only controls (back, close, delete, edit, floating actions, visibility toggle); some currently inherit limited/default labels and need runtime audit.
- Verify errors are announced/readable and focus remains sensible after modals, alerts, deletion, or navigation.

## 7. Data model

| Entity | Key fields / relationships |
| --- | --- |
| Account | ID, user ID, name, type (M-PESA/BANK/CASH/DEBT), balance, currency, active state. |
| Transaction | ID/UUID, account, category, direction, kind, amount, counterparty, date, raw SMS, account balance, deletion state, reference ID, optional debt/goal links. |
| Category | Name, expense/income type, icon, color, custom marker, description. |
| Debt | Liability/receivable/overdraft type, principal/current balance, revolving/reducing flags, interest, dates, status, payment links. |
| Savings goal | Target/current amounts, target date, color, status, linked transactions. |
| Income source/log | Source schedule/frequency/expected amount/color/account/SMS sender and individual received entries. |
| Budget | Month-level income and category budget allocations. |
| Automation rule | Transaction type, conditions, target category/debt action, enabled flag. |
| Manual recurring transaction | Recurrence template that generates ledger activity. |
| Insight records | Monthly summaries, category trends, net-worth history. |
| Settings | Banking enablement, financial month, transfer visibility, cash baseline, guide state, app-lock preferences, sync markers. |

## 8. Calculation rules

- **Account balance:** standard sent entry subtracts; received entry adds. Transfers create equal internal debit/credit entries.
- **Liquid cash:** opening baseline (if set) plus non-deleted received entries minus sent entries since reset date; excludes internal transfers and debt principal.
- **Cash flow:** excludes internal transfers and debt principal.
- **Savings rate:** `max(0, (this-month income − this-month expenses) / income × 100)`; zero when no income.
- **Debt-to-income ratio:** active liabilities divided by this-month income; zero when no income.
- **Net worth:** active account balances plus total savings, minus outstanding liabilities.
- **Financial month:** configurable start day is constrained to 1–28; Home period calculations use this configuration. Some Analytics/forecast/budget functions use calendar months, so cross-screen period differences must be explicitly tested and product-confirmed.

## 9. QA acceptance checklist

### Critical smoke path

- [ ] Fresh install initializes database, presents permission gate on Android, and has no crash.
- [ ] Granting SMS permission allows normal navigation; denying then opening Settings correctly rechecks permission on return.
- [ ] Signup and email login work; Google login works on a correctly configured Android build.
- [ ] First protected session requests PIN setup; lock/unlock and timeout work.
- [ ] Initial SMS import records supported M-PESA activity once, displays it on Home, and does not duplicate it after a repeat sync.
- [ ] Manual sent and received transactions update the selected account and Home totals.
- [ ] Categorizing a transaction updates the Home item and Analytics category result.
- [ ] A savings link updates goal progress; a debt payment link updates debt balance; an income link updates income history.
- [ ] Profile export produces an openable `.xlsx` workbook for each period selection.

### Feature verification

- [ ] Test all Home periods, search, load-more, pull-to-refresh, internal-transfer visibility, and zero/negative balances.
- [ ] Test KES card amount confirmation and transaction-date changes.
- [ ] Test every recategorization scope and confirm it changes only the advertised set.
- [ ] Test I&M enable/disable and verify imported bank activity appears/disappears according to preference without duplicating M-PESA transfers.
- [ ] Create/edit/delete categories; ensure only appropriate custom categories are removable.
- [ ] Create, toggle, apply, and delete automation rules; validate time, amount, and keyword conditions independently and in combination.
- [ ] Create recurring manual transactions, background the app, relaunch, and confirm due entries are created only once per month.
- [ ] Create income sources manually and from detected patterns; test recurring, irregular, manual, SMS-linked, unlink, and delete paths.
- [ ] Create, edit, link/unlink, complete, and delete savings goals.
- [ ] Create liabilities/receivables, link/unlink payments, clear, delete, merge, and validate Fuliza/I&M loan handling with representative messages.
- [ ] Save budgets including exact, under-, and over-allocated cases.
- [ ] Validate analytics/forecasting with no data, one month, multiple months, internal transfers, and debt principal.
- [ ] Update profile name/phone/photo and verify photo permission denial/retry behavior.
- [ ] Test PIN errors through lockout, biometric unavailable/enrolled states, every lock timeout option, and app background/foreground behavior.
- [ ] With backup endpoints configured, test initial upload, newer-remote restore, newer-local upload, invalid payload rejection, and sign-out flush.

### UI regression matrix

- [ ] Android: light/dark, permission dialog, SMS import, back navigation, and gesture navigation.
- [ ] iOS: no SMS gate blockage, keyboard avoidance, image/camera permission, biometrics, safe areas.
- [ ] Web: authentication, navigation, empty states, layout responsiveness, and graceful absence of native SMS features.
- [ ] Test smallest supported phone width, a tall device, tablet, large font, slow network, offline Firebase/AWS, and a database with thousands of transactions.

## 10. Known implementation constraints / decisions requiring confirmation

These are observations from the current implementation, not new requirements:

1. The README describes older tab names, package versions, and an earlier screen structure. This specification follows the current route/service code and should replace it as the primary product reference.
2. SMS permission gates the whole application on Android, including functionality that does not itself require SMS. This is a deliberate current behavior but may be a product-friction decision to revisit.
3. SMS import is Android-only; iOS/web users currently depend on manual entries and supported non-SMS functions.
4. I&M is the only bank connector visible in the UI; more banks are explicitly a placeholder.
5. Financial-month logic is configurable for Home, while budget, analytics, and forecast services contain calendar-month logic. Align them if one reporting period is intended across the product.
6. Cloud backup is disabled unless both configured public endpoint variables are provided. Firebase authentication does not itself synchronize the SQLite ledger.
7. Financial reset is destructive by design. It has confirmation and recomputation logic but no user-facing undo; validate backup/recovery expectations before release.

