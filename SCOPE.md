# Scope and Anomaly Log

This document lists the 20 deliberate data anomalies discovered in [Expenses Export.csv](file:///c:/Users/jabhi/Desktop/Shared%20Expenses%20App/Expenses%20Export.csv) and documents the resolution policies implemented in the application. It also details the relational database schema structure.

---

## 1. CSV Anomaly Log

| # | Row / Issue | Description | Applied Policy (User-controlled via Wizard) |
|---|---|---|---|
| 1 | "Dinner at Marina Bites" vs "dinner - marina bites" (08-02) | Exact duplicate — same date, payer, amount, split | **Flagged as duplicate** in wizard → Default action is **Skip** (keeps first, archives/ignores second). |
| 2 | "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450) (11-03) | Same event, both logged it, amounts differ, notes say one is "wrong" | **Flagged as fuzzy duplicate** → Wizard lets user choose to keep one (Aisha's or Rohan's) and skip the other. |
| 3 | `"1,200"` — comma-formatted number (Electricity Feb) | Parsing issue | **Parsed & Normalized**: The comma is stripped out during parsing to yield a clean float `1200.00`. |
| 4 | `899.995` — 3 decimal places (Cylinder refill) | Sub-paisa precision | **Rounded to 2 decimals** (`900.00`) using standard round-half-up. |
| 5 | "Priya S" vs "Priya" vs "priya" | Same person, inconsistent naming/casing | **Canonical Mapping**: Mapped all alias variations to the database-registered user `Priya`. |
| 6 | "Rohan paid Aisha back" (25-02) — `split_type` empty, looks like a settlement | This is a payment, not an expense | **Auto-detected as settlement** → Wizard resolves it to a direct `Settlement` record, bypassing splits. |
| 7 | "House cleaning supplies" — `paid_by` empty | Missing payer | **Flagged as missing payer** → Wizard requires the user to select an active member (default: Rohan) to assign as the payer. |
| 8 | Pizza Friday percentages = 30+30+30+20 = **110%** | Doesn't sum to 100% | **Flagged as percentage mismatch** → Wizard rescales shares proportionally (divides each by 1.1) to sum to 100%. |
| 9 | Weekend brunch — same 30/30/30/20 = 110% issue | Same percentage sum issue | **Flagged as percentage mismatch** → Same normalization policy applied. |
| 10 | USD expenses (Goa villa 540 USD, Beach shack 84 USD, Parasailing 150 USD, refund -30 USD) | Currency mismatch | **Multi-currency conversion**: Converted to INR at import time using a fixed exchange rate of **₹83.00 / USD**. |
| 11 | Parasailing refund = **-30 USD** | Negative amount | **Refund credit**: Stored as a negative-split expense, which correctly reduces the active balances. |
| 12 | "Dev's friend Kabir" in split_with (Parasailing) | Non-member, one-time guest, not a registered user | **Flagged as guest** → Wizard lets user choose to **absorb Kabir's share into Dev's** (Dev pays 40%, others 20%) OR create guest User `Kabir`. |
| 13 | `Mar-14` date format (Airport cab) | Inconsistent date format vs `DD-MM-YYYY` | **Parsed & Normalized**: Detected and parsed alternate month-based format into ISO `2026-03-14`. |
| 14 | `04-05-2026` — "is this April 5 or May 4?" | Ambiguous date | **Flagged as ambiguous date** → Wizard allows the user to explicitly select April 5 or May 4 (context suggests May 4). |
| 15 | `"rohan "` — trailing whitespace | Whitespace casing issue | **Parsed & Normalized**: Trimmed trailing spaces and capitalized to canonical `Rohan`. |
| 16 | Missing currency (Groceries DMart, 15-03) | `currency` column empty | **Flagged as missing currency** → Default policy sets currency to group home currency **INR**. |
| 17 | "Dinner order Swiggy" = ₹0, note says "counted twice earlier - fixing later" | Zero-amount, looks like a placeholder/junk row | **Flagged as zero-amount** → Default action is **Skip** (keeps database clean). |
| 18 | "Furniture for common room" — `split_type=equal` but `split_details` has share values | Contradictory fields | **Flagged as contradictory split** → Default policy is **use shares** specified in `split_details` (Aisha 1, Rohan 1, Priya 1, Sam 1). |
| 19 | Stale membership — rows after Meera left (end-March) still include her in `split_with` (e.g. 02-04-2026 Groceries) | Membership/expense date mismatch | **Flagged as stale membership** → Default action is **Exclude and redistribute** (removes Meera and splits share among remaining active users). |
| 20 | "Sam deposit share" (08-04) — paid_by=Sam, split_with=Aisha only, looks like a deposit/payment | Mislabeled settlement | **Auto-detected as settlement** → Stored as `Settlement` transaction from Sam to Aisha. |

## 2. Database Schema Details

We use **Prisma 7** over **SQLite** (via LibSQL driver) to enforce relational integrity. The models, fields, and definitions are detailed below:

### A. User Model
Tracks individual flatmates and guests. Registered users have login credentials.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `name` | String | `@unique` | Canonical name of the flatmate (normalized). |
| `email` | String? | `@unique` | Optional login email address. |
| `passwordHash` | String? | - | SHA-256 password hash for login. Null for guests. |
| `isGuest` | Boolean | `default(false)` | Flag to mark temporary guests (e.g. Kabir, Dev). |
| `createdAt` | DateTime | `default(now())` | Timestamp when the user profile was registered. |

### B. Group Model
Groups together separate flat share spaces or trips.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `name` | String | - | Name of the group (e.g. "Flat Share", "Goa Trip"). |
| `createdAt` | DateTime | `default(now())` | Date when group workspace was initialized. |

### C. GroupMember Model
Represents the **Time-Based Timeline Membership** mapping flatmates to groups.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `groupId` | String | Relation FK | Associated Group ID. |
| `userId` | String | Relation FK | Associated User ID. |
| `joinedAt` | DateTime | - | Start date of active flat share timeline membership. |
| `leftAt` | DateTime? | - | End date of membership. Null if currently active. |

### D. Expense Model
Stores shared expense transaction headers.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `groupId` | String | Relation FK | Group this bill belongs to. |
| `description` | String | - | Label of the expense (e.g. "Rent"). |
| `amount` | Float | - | Original bill amount logged. |
| `currency` | String | - | Currency (INR/USD). |
| `amountInInr` | Float | - | Normalised value in base INR (converted if USD). |
| `exchangeRateUsed`| Float | - | Rate used for INR conversion (default 1.00; 83.00 for USD). |
| `paidById` | String | Relation FK | User who paid the bill. |
| `splitType` | String | - | Split method (`equal`, `unequal`, `percentage`, `share`). |
| `expenseDate` | DateTime | - | Calendar date of the expense (used for timeline checks). |
| `source` | String | - | Transaction source (`manual` or `csv_import`). |
| `importBatchId` | String? | Relation FK | Reference to parent CSV import batch. |
| `status` | String | - | Row status (`active`, `flagged`, `archived`). |
| `notes` | String? | - | Optional extra details. |

### E. ExpenseSplit Model
Stores individual user share allocations per expense.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `expenseId` | String | Relation FK | Associated parent Expense. |
| `userId` | String | Relation FK | Target user allocated for the split. |
| `shareValue` | Float | - | Raw split ratio (e.g., 30% percentage, 1.5 shares, ₹500 unequal). |
| `computedAmountInr`| Float | - | Final rounded amount in INR (adjusted for rounding remainder). |

### F. Settlement Model
Tracks direct peer-to-peer payments chukana (e.g. Rohan paid Aisha back).
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `groupId` | String | Relation FK | Associated Group ID. |
| `fromUserId` | String | Relation FK | Debtor roommate sending the money. |
| `toUserId` | String | Relation FK | Creditor roommate receiving the money. |
| `amount` | Float | - | Raw settlement amount sent. |
| `currency` | String | - | Currency (INR/USD). |
| `amountInInr` | Float | - | Total converted value in INR. |
| `note` | String? | - | Optional note detail. |
| `settledAt` | DateTime | - | Date when settlement payment took place. |
| `source` | String | - | Transaction source (`manual` or `csv_import`). |

### G. ImportBatch Model
Groups CSV upload collections.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `groupId` | String | Relation FK | Associated Group ID. |
| `filename` | String | - | Name of imported CSV spreadsheet. |
| `importedAt` | DateTime | `default(now())` | Import timestamp. |
| `status` | String | - | Batch state (`pending`, `completed`, `failed`). |

### H. ImportAnomaly Model
Stores detected CSV import data issues for staging approval.
| Field | Type | Attributes | Description |
|---|---|---|---|
| `id` | String | `@id` | Unique UUID primary key. |
| `importBatchId` | String | Relation FK | Associated parent ImportBatch. |
| `rowNumber` | Int | - | CSV row index where anomaly was found. |
| `rawRowData` | String | - | JSON string of the raw CSV columns. |
| `anomalyType` | String | - | Category (e.g. `duplicate`, `stale_membership`). |
| `description` | String | - | Detail of why this row is flagged. |
| `suggestedAction` | String | - | Recommended resolution strategy. |
| `userDecision` | String? | - | Final action chosen by the user in the wizard. |
| `resolved` | Boolean | `default(false)` | Whether the anomaly has been reviewed. |

