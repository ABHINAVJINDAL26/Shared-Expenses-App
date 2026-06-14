# Splitwise Pro - Shared Expenses App

Splitwise Pro is a roommate expense sharing web application built for Aisha, Rohan, Priya, Meera, Sam, and Dev to resolve their shared expenses and import their spreadsheet exports cleanly. 

The application implements a custom **CSV Anomaly Resolution Wizard** that parses raw uploads, flags inconsistencies (such as duplicate entries, percentages exceeding 100%, and stale memberships), and stages them for interactive user resolution before committing to the database.

---

## 1. Tech Stack
*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Database ORM:** Prisma 7
*   **Database:** SQLite (file-based relational database)
*   **Database Client Adapter:** LibSQL Driver Adapter (`@prisma/adapter-libsql` and `@libsql/client`)
*   **Styling:** Premium Vanilla CSS (custom design system with dark-themed glassmorphism, glowing accents, and responsive layout)
*   **AI Collaborator:** Gemini 3.5 Flash (Medium) via Antigravity IDE

---

## 2. Setup and Installation

Follow these instructions to run the application locally on your machine.

### Prerequisites
*   Node.js (v20+ or v24+ recommended)
*   npm (v10+ or v11+)

### Installation Steps
1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Initialize Database and Apply Migrations:**
    Prisma 7 uses SQLite. Run the following command to apply the schema:
    ```bash
    npx prisma migrate dev --name init
    ```

3.  **Seed Database:**
    Seed the database with pre-defined users (Aisha, Rohan, Priya, Meera, Sam, Dev, Kabir) and their active membership timelines:
    ```bash
    npx prisma db seed
    ```

4.  **Run Development Server:**
    Launch the Next.js dev server:
    ```bash
    npm run dev
    ```

5.  **Open the App:**
    Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 3. Login Credentials (Test Accounts)

To log in as any of the standard flatmates, use the following details. All seeded users have the default password **`password123`**:

| User Name | Email | Password | Role / Account Type | Active Timeline |
|---|---|---|---|---|
| **Aisha** | `aisha@example.com` | `password123` | Active Roommate (Payer) | Feb 1, 2026 - Present |
| **Rohan** | `rohan@example.com` | `password123` | Active Roommate (Payer) | Feb 1, 2026 - Present |
| **Priya** | `priya@example.com` | `password123` | Active Roommate | Feb 1, 2026 - Present |
| **Meera** | `meera@example.com` | `password123` | Inactive Roommate (Moved out) | Feb 1 - Mar 31, 2026 |
| **Sam** | `sam@example.com` | `password123` | Active Roommate (Joined late) | Apr 8, 2026 - Present |

*Guests (`Dev` and `Kabir`) are registered on the database for historical split reference but do not have passwords/login accounts.*

---

## 4. Verifying the Assignment Features

### A. Authentication & Route Protection
*   If you attempt to access `http://localhost:3000/` or `/members` without signing in, the middleware intercepts your request and redirects you to the `/login` page.
*   Sign in using any email from the table above (e.g. `aisha@example.com`) and password `password123`.

### B. Pairwise Balances (Aisha's View)
*   The **Balances Summary** card displays direct pairwise relationships (e.g. "Rohan owes You ₹40,417.23").
*   This satisfies Aisha's requirement: "I just want one number per person. Who pays whom, how much, done."

### C. Math Trace Drilldown & Edit/Delete (Rohan's View)
*   Clicking on any debt entry in the Balances list opens the **Math Trace / Explanation** panel on the right.
*   It displays the exact row-by-row shared expenses and settlements contributing to that net balance.
*   You can click **Edit** on any expense to modify details, or click **Delete** (with confirmation) to remove it.
*   This satisfies Rohan's requirement: "No magic numbers... I want to see exactly which expenses make that up."

### D. Time-based Memberships (Sam's View)
*   Log in as **Sam** (`sam@example.com`).
*   Note that Sam's balance does *not* include any of the March expenses (like March Rent or March Electricity) because his membership window started on April 8, 2026.
*   This satisfies Sam's requirement: "I moved in mid-April. Why would March electricity affect my balance?"

### E. Smart CSV Import Wizard & Printable Report (Meera's View)
1.  Go to the **Smart CSV Importer** tab.
2.  Select and upload [Expenses Export.csv](file:///c:/Users/jabhi/Desktop/Shared%20Expenses%20App/Expenses%20Export.csv).
3.  The engine immediately parses the file and loads **17 anomalies** across **11 distinct anomaly types** (exact duplicates, fuzzy duplicates, stale memberships, ambiguous dates, missing payers, guest participants, negative refunds, zero amounts, currency mismatches, and percentage sums exceeding 100%).
4.  Each anomaly card displays a clear description and an interactive form proposing the recommended resolution policy.
5.  After adjusting any decisions, click **Resolve & Import Staged Rows** at the bottom.
6.  Upon completion, the app displays a complete **Import Report** showcasing processing statistics.
7.  Click **Print / Export PDF** to generate a clean A4 printed audit log.
8.  This satisfies Meera's requirement: "Clean up the duplicates — but I want to approve anything the app deletes or changes."
