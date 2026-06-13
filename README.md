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

## 3. Verifying the Assignment Features

### A. Switched Identity Selector
*   At the top-right of the navigation bar, there is an **Active Identity** dropdown switcher.
*   You can select any roommate (Aisha, Rohan, Priya, Meera, Sam) to instantly switch the view. The balance card updates to show their personal net balance, and the pairwise balance list changes to show only their direct debts.

### B. Pairwise Balances (Aisha's View)
*   The **Balances Summary** card displays direct pairwise relationships (e.g. "Rohan owes Aisha ₹2,300").
*   This satisfies Aisha's requirement: "I just want one number per person. Who pays whom, how much, done."

### C. Math Trace Drilldown (Rohan's View)
*   Clicking on any debt entry in the Balances list opens the **Math Trace / Explanation** panel on the right.
*   It displays the exact row-by-row shared expenses and settlements contributing to that net balance.
*   This satisfies Rohan's requirement: "No magic numbers... I want to see exactly which expenses make that up."

### D. Time-based Memberships (Sam's View)
*   Switch to **Sam** in the Identity Selector.
*   Note that Sam's balance does *not* include any of the March expenses (like March Rent or March Electricity) because his membership window started on April 8, 2026.
*   This satisfies Sam's requirement: "I moved in mid-April. Why would March electricity affect my balance?"

### E. Smart CSV Import Wizard (Meera's View)
1.  Go to the **Smart CSV Importer** tab.
2.  Click on the upload zone and select [Expenses Export.csv](file:///c:/Users/jabhi/Desktop/Shared%20Expenses%20App/Expenses%20Export.csv).
3.  The engine immediately parses the file and loads **17 anomalies** across **11 distinct anomaly types** (exact duplicates, fuzzy duplicates, stale memberships, ambiguous dates, missing payers, guest participants, negative refunds, zero amounts, currency mismatches, and percentage sums exceeding 100%).
4.  Each anomaly card displays a clear description and an interactive form proposing the recommended resolution policy.
5.  After adjusting any decisions, click **Resolve & Import Staged Rows** at the bottom.
6.  Upon completion, the app displays a complete **Import Report** showcasing processing statistics.
7.  This satisfies Meera's requirement: "Clean up the duplicates — but I want to approve anything the app deletes or changes."
