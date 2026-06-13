# Design Decisions and Tradeoffs

This document log details the significant architectural and product design decisions made while building the Shared Expenses App.

---

## Decision 1: Time-Based Group Membership

*   **Context**: Roommates join and leave the group over time. March Rent/Electricity should not affect Sam (joined April), and April Rent/Electricity should not affect Meera (left March).
*   **Options considered**:
    1.  *Static Group Lists*: Rely on manually removing/adding members to a group. Breaks historical balance audits (recalculating March rent would now exclude Meera, which is wrong).
    2.  *Dynamic Join/Leave Timelines (Chosen)*: Store `joinedAt` and `leftAt` in `GroupMember`. Cross-reference expense dates with membership windows.
*   **Reasoning**: This is the only way to satisfy Sam's complaint ("why would March electricity affect my balance?") without corrupting the historical database state. It matches real-world flat-sharing patterns.
*   **Tradeoffs / Future Improvements**: Date matching relies on date grain. If an expense is dated April 1st, but Sam's deposit was logged April 8th, Sam might be excluded from April Rent. A fine-grained manual overrides screen on membership could be added.

---

## Decision 2: Multi-Currency Handling

*   **Context**: Part of the Goa trip spending was in USD, but the roommates settle up in INR.
*   **Options considered**:
    1.  *Dual-Currency Balances*: Maintain separate balance sheets for USD and INR. Aisha would see "Rohan owes Aisha ₹2,300 AND $12". Breaks Aisha's request for "one number per person".
    2.  *Convert at Import (Chosen)*: Convert USD to INR at import time using a fixed exchange rate (**₹83.00 / USD**), but retain original currency and amount as metadata on the `Expense` model for transparency.
*   **Reasoning**: By converting at import time, we keep the database core unified in INR, which makes the pairwise balance netting extremely simple and yields a single debt summary. Retaining the raw USD amounts as metadata satisfies Rohan's need to "verify the math".
*   **Tradeoffs / Future Improvements**: A fixed exchange rate assumes stable currency. In a production app, we would query a live conversion API based on the `expenseDate` to get historical daily exchange rates.

---

## Decision 3: Duplicate Detection & Resolution

*   **Context**: Roommates logged exact duplicates (Marina Bites) and fuzzy duplicates (Thalassa dinner) by accident.
*   **Options considered**:
    1.  *Auto-Delete/Deduplicate*: Silently drop the duplicate row during import.
    2.  *Staging & Review Wizard (Chosen)*: Read rows into a staging batch, log anomalies in `ImportAnomaly`, render a review wizard, and write back user decisions before committing to the DB.
*   **Reasoning**: Directly addresses Meera's request: "Clean up the duplicates — but I want to approve anything the app deletes or changes."
*   **Tradeoffs / Future Improvements**: Staged imports require separate database tables (`ImportAnomaly`, `ImportBatch`), which increases schema complexity but is required for product compliance.

---

## Decision 4: Settlement vs Expense Detection

*   **Context**: Rows like "Rohan paid Aisha back" and "Sam deposit share" are logged as expenses but are actually debt settlements.
*   **Options considered**:
    1.  *Treat as Expenses*: Import as standard expenses, which creates splits and breaks the netting math.
    2.  *Auto-Detect & Convert (Chosen)*: Check for empty split_type, single split_with user, and settlement keywords (e.g. "paid back", "deposit", "settled") to route them as `Settlement` records.
*   **Reasoning**: Settlements are transactions of type "debt payment" that reduce the net balance between two people. By converting them, Rohan's payment to Aisha reduces his debt directly without creating splits.
*   **Tradeoffs / Future Improvements**: Heuristic-based detection can trigger false positives. The wizard mitigates this by letting the user choose "Import as shared expense" if the auto-detection was incorrect.

---

## Decision 5: Rounding Rule

*   **Context**: Splitting expenses doesn't always divide evenly (e.g. ₹3200 divided among 3 people = ₹1066.666...).
*   **Options considered**:
    1.  *Fractional Paise*: Store float shares and let display truncate. Leads to discrepancies where individual shares don't sum to the total.
    2.  *Payer Absorbs Remainder (Chosen)*: Round each split to 2 decimals. Sum the splits, calculate the remainder, and add/subtract the remainder (paise) to the payer's share.
*   **Reasoning**: In the real world, the person who paid absorbs the rounding differences (usually a few paise). This guarantees that the sum of all individual splits matches the total expense amount.
*   **Tradeoffs / Future Improvements**: The remainder could alternatively be distributed to the first person alphabetically. Since this logic is isolated in `confirm/route.ts`, changing the rule is simple.

---

## Decision 6: Split Types Supported

*   **Context**: The CSV contains equal splits, unequal splits, percentages, and shares.
*   **Decision**: Implemented full support for all 4 split types:
    *   `equal`: divides total amount equally.
    *   `unequal`: reads explicit amounts from `split_details`.
    *   `percentage`: reads percentages and calculates share.
    *   `share`: computes fraction based on total shares.
*   **Reasoning**: To import the CSV without failures, we must support all 4 split types natively in our parsing and split calculation engine.

---

## Decision 7: Guest Participants (Dev's friend Kabir)

*   **Context**: Kabir joined for parasailing. He is not a permanent group member.
*   **Options considered**:
    1.  *Absorb into Host (Chosen)*: Exclude Kabir from the group and add his share of the expense to Dev's share.
    2.  *Create Guest User*: Create a temporary user record for Kabir in the DB so he has a balance entry.
*   **Reasoning**: In a shared flat, guest expenses are typically absorbed by the person who invited them (Dev). The wizard supports both: default is absorbing into Dev's share, but the user can choose to create a temporary guest user.

---

## Decision 8: Name Aliases Mapping

*   **Context**: Inconsistent names like "Priya S" and "rohan " in the CSV.
*   **Decision**: Applied manual name alias mapping during parsing: `"Priya S"` and `"priya"` -> `"Priya"`, `"rohan "` -> `"Rohan"`.
*   **Reasoning**: A curated lookup table is highly reliable for a finite set of known flatmates.
