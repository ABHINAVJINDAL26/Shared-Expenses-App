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

---

## 2. Database Schema

We use **Prisma** over **SQLite** (relational, file-based). The models are:

*   **`User`**: System users (Aisha, Rohan, Priya, Meera, Sam, Dev, Kabir). Contains `isGuest` flag to differentiate permanent roommates from one-time trip guests.
*   **`Group`**: Shared spaces (e.g., "Flat Share").
*   **`GroupMember`**: Time-based membership mapping. Holds `joinedAt` and `leftAt` (nullable) dates per user, allowing queries to dynamically filter who is active.
*   **`Expense`**: Shared expense records. Stores details, currency, raw amount, and computed INR amount.
*   **`ExpenseSplit`**: User-specific splits of an expense, holding both the raw `shareValue` (e.g., 30%, 1 share) and `computedAmountInr` (final rounded INR share).
*   **`Settlement`**: direct debt payment between roommates (e.g., Rohan paid Aisha back).
*   **`ImportBatch`**: Tracks CSV imports, recording upload timestamp and completion status.
*   **`ImportAnomaly`**: Staging area for rows flagged as anomalous. Stores raw row JSON, anomaly type, descriptions, suggested actions, and the user's chosen decision.
