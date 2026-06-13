# How to Complete the "Shared Expenses App" Assignment — Complete Guide

This is a DIFFERENT and harder assignment than the generic Splitwise clone. The core of this assignment is **handling messy real-world data deliberately** — not building a pretty UI. Read this guide fully before starting.

---

## 0. What Makes This Assignment Different

- The CSV is the star of the show. Everything else (UI, schema, features) exists to **serve the CSV import + correct balance calculation**.
- You are NOT being asked to build every Splitwise feature. You're asked to support **only the split types that appear in the CSV** (equal, unequal, percentage, share — turns out all 4 appear, but verify yourself).
- **Time-based group membership is mandatory** — Meera leaves end of March, Sam joins mid-April, Dev/Kabir are one-time guests. Your schema and balance logic MUST respect this.
- **Multi-currency (INR + USD) is mandatory** — not optional like before.
- New deliverables replace AI_CONTEXT.md/BUILD_PLAN.md: **SCOPE.md, DECISIONS.md, AI_USAGE.md, Import Report**.
- **45-minute live session** — you will trace specific CSV rows through your code live. Practice this yourself before submitting.

---

## 1. Step 1 — Anomaly Catalog (Do This First, By Hand, Before Any Coding)

I went through the CSV row by row. Here are the anomalies I found (likely close to the "12+ deliberate problems" mentioned — go through it yourself too to make sure you can defend each one):

| # | Row / Issue | Description | Suggested Policy (you decide & document in SCOPE.md) |
|---|---|---|---|
| 1 | "Dinner at Marina Bites" vs "dinner - marina bites" (08-02) | Exact duplicate — same date, payer, amount, split | **Flag as duplicate** during import → show both to user → user picks one to keep, other gets skipped/archived (not silently deleted — Meera wants approval) |
| 2 | "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450) (11-03) | Same event, both logged it, amounts differ, notes say one is "wrong" | **Flag as likely duplicate but NOT identical** → require manual user decision (keep one/both/neither) — don't auto-resolve |
| 3 | `"1,200"` — comma-formatted number (Electricity Feb) | Parsing issue | **Strip commas during parse**, treat as 1200. Document as a formatting normalization rule. |
| 4 | `899.995` — 3 decimal places (Cylinder refill) | Sub-paisa precision | **Round to 2 decimals** (standard currency precision) — document rounding rule (round-half-up or banker's rounding — pick one) |
| 5 | "Priya S" vs "Priya" vs "priya" | Same person, inconsistent naming/casing | **Normalize names during import**: case-insensitive match + a manual mapping table for known aliases (build a small "name alias" lookup, e.g. "Priya S" → "Priya") |
| 6 | "Rohan paid Aisha back" (25-02) — `split_type` empty, looks like a settlement | This is a payment, not an expense | **Detect rows with empty split_type + single split_with + note suggesting payment** → import as a **settlement/payment record**, not an expense |
| 7 | "House cleaning supplies" — `paid_by` empty | Missing payer | **Flag as "unresolved payer"** → require user to assign before import completes (or import as "unknown payer" placeholder, excluded from balance calc until resolved — Meera approval angle) |
| 8 | Pizza Friday percentages = 30+30+30+20 = **110%** | Doesn't sum to 100% | **Detect mismatch, surface to user** → policy options: (a) normalize proportionally (divide each by 1.1), or (b) reject row and ask user to fix. Document which you picked and why. |
| 9 | Weekend brunch — same 30/30/30/20 = 110% issue | Same as #8 | Same policy as #8 — consistency matters |
| 10 | USD expenses (Goa villa 540 USD, Beach shack 84 USD, Parasailing 150 USD, refund -30 USD) | Currency mismatch — sheet treats $ as ₹ | **Convert to INR at import time** using a fixed exchange rate (pick one, e.g. ₹83/USD, document source/date) OR store dual currency + convert at display time. Either is defensible — document the tradeoff. |
| 11 | Parasailing refund = **-30 USD** | Negative amount | **Treat as a refund/credit**, not an error → reduces the original expense's effective amount OR creates a reverse-split entry. Document which approach. |
| 12 | "Dev's friend Kabir" in split_with (Parasailing) | Non-member, one-time guest, not a registered user | **Policy**: either (a) create a lightweight "guest" user with no login who participates in this one split only, or (b) exclude Kabir's share and redistribute among real members, or (c) absorb Kabir's share into Dev's. Pick one and document reasoning. |
| 13 | `Mar-14` date format (Airport cab) | Inconsistent date format vs `DD-MM-YYYY` everywhere else | **Detect and parse** alternate date formats during import; normalize to ISO (YYYY-MM-DD). Flag in import report as "date format corrected". |
| 14 | `04-05-2026` — "is this April 5 or May 4?" | Ambiguous date | **Surface explicitly to user** — don't guess silently. Given the row is right after Meera's farewell (28-03) and before April rent (01-04), context suggests it's likely a data entry error — but DOCUMENT your reasoning and let user confirm during import review. |
| 15 | `"rohan "` — trailing whitespace | Same person, whitespace issue | **Trim whitespace** during name normalization (same fix as #5) |
| 16 | Missing currency (Groceries DMart, 15-03) | `currency` column empty | **Default to INR** (the group's home currency) when empty — document this default rule |
| 17 | "Dinner order Swiggy" = ₹0, note says "counted twice earlier - fixing later" | Zero-amount, looks like a placeholder/junk row | **Flag as zero-amount** → policy: skip importing (no balance impact) but log in import report as "skipped — zero amount, likely placeholder" — show to user for confirmation |
| 18 | "Furniture for common room" — `split_type=equal` but `split_details` has share values | Contradictory fields | **split_details overrides split_type when present and non-empty** — OR flag as anomaly and ask user which to honor. Document your precedence rule. |
| 19 | Stale membership — rows after Meera left (end-March) still include her in `split_with` (e.g. 02-04-2026 Groceries) | Membership/expense date mismatch | **This is THE core time-based membership problem.** Policy: at import, cross-check each expense's date against each member's membership window (joined_at/left_at). If a member listed in split_with wasn't active on that date, **flag it** — options: (a) auto-remove them from split and redistribute, or (b) keep as-is but warn, or (c) reject row for manual fix. This directly answers Sam's complaint. |
| 20 | "Sam deposit share" (08-04) — paid_by=Sam, split_with=Aisha only, looks like a deposit/payment | Possibly another settlement-like entry | **Flag**: is this an expense (Sam owes part of deposit split with Aisha) or a payment from Sam to Aisha? Likely the latter → treat as settlement/payment, not expense — document reasoning |

**That's 20 issues I found** — more than the "at least 12" mentioned, which is good (better to over-detect and document than miss real ones). Go through the CSV yourself line by line too — you need to be able to explain EVERY row in the live session.

---

## 2. The Big Design Decisions You Must Make (→ go in DECISIONS.md)

For each of these, write: **the decision, 2-3 options you considered, why you picked this one, and what you'd do differently with more time.**

### Decision 1: Time-based Group Membership
- Schema: `group_members` table needs `joined_at` and `left_at` (nullable = still active) per (group, user) pair.
- When calculating balances or validating an expense's split_with, **check membership window against expense date**.
- Sam's complaint is directly solved by this — March electricity expense's split_with should exclude Sam (he wasn't a member then), even if your UI lets you add him to the group later.

### Decision 2: Multi-Currency Handling
- Two real approaches:
  - **(A) Convert at import**: store everything in INR, keep original currency+amount as metadata for transparency (Rohan's "show me the math" need).
  - **(B) Store native currency + rate, convert at display/balance-calc time**.
- Either works — (A) is simpler for a 2-day build, document it as your choice with a fixed exchange rate (pick a real rate around the CSV dates, e.g. look up USD-INR rate for March 2026, or just pick a round number and state it's an assumption).

### Decision 3: Duplicate Detection & Resolution
- Detection: match on (date, amount, payer, similar description) using simple heuristics (e.g. Levenshtein distance on description, or normalized string match).
- Resolution: **Meera wants approval** — so the import flow must be: **detect → show anomaly list to user → user approves/chooses action per anomaly → THEN commit to DB**. Don't auto-delete anything silently.

### Decision 4: Settlement vs Expense Detection
- Rows like "Rohan paid Aisha back" and "Sam deposit share" look like settlements mislabeled as expenses.
- Heuristic: `split_type` empty/single-person split_with + description containing words like "paid back", "deposit", "settled" → flag as **possible settlement**, let user confirm during import review.

### Decision 5: Rounding Rule
- Equal splits often don't divide evenly (e.g. ₹3200 ÷ 4 = ₹800 exactly, fine; but ₹899.995 ÷ 4 = ₹224.99875).
- Pick a rule: round each share to 2 decimals, give the rounding remainder (paise) to the payer (common real-world approach) or to the first person alphabetically. Document it — you'll be asked to "change the rounding rule live" per the evaluation note, so know exactly where this logic lives in your code.

### Decision 6: Split Types to Support
From the CSV, these split types appear:
- `equal`
- `unequal` (explicit amounts, e.g. "Aisha birthday cake")
- `percentage` (e.g. "Pizza Friday")
- `share` (e.g. "Scooter rentals", "April rent")
- (blank — for the settlement row)

So you need all 4 proper split types + a way to represent settlements (which aren't really a "split type" at all — they're a different transaction type entirely).

### Decision 7: Guest/Non-Member Participants (Kabir)
- Document your choice (lightweight guest record vs exclude vs absorb into host's share) and why.

### Decision 8: Name Normalization Strategy
- A simple alias map (`{"priya s": "priya", "rohan ": "rohan", ...}`) built by inspecting the CSV — document that this is manual/curated, not algorithmic, and why that's an acceptable tradeoff for a known, finite dataset.

---

## 3. Database Schema (Design Notes)

Core tables — same idea as before, but with these key additions:

```
users
  id, name, email, password_hash, created_at

groups
  id, name, created_by, created_at

group_members
  id, group_id, user_id, joined_at, left_at (nullable), role

expenses
  id, group_id, description, amount, currency, amount_in_inr (converted),
  exchange_rate_used (nullable), paid_by_user_id, split_type, expense_date,
  created_at, source ('manual' | 'csv_import'), import_batch_id (nullable),
  status ('active' | 'flagged' | 'archived')

expense_splits
  id, expense_id, user_id, share_value (amount/percentage/shares depending on split_type),
  computed_amount (final INR amount owed by this person)

settlements
  id, group_id, from_user_id, to_user_id, amount, currency, note,
  settled_at, source ('manual' | 'csv_import')

import_batches
  id, group_id, filename, imported_by, imported_at, status

import_anomalies
  id, import_batch_id, row_number, raw_row_data (JSON/text),
  anomaly_type, description, suggested_action, user_decision, resolved (bool)
```

`import_anomalies` table is critical — it's how you generate the **Import Report** (deliverable #6) and shows Meera's approval workflow is real, not hand-waved.

---

## 4. The Import Flow (Step by Step — this IS the app's main feature)

1. User uploads `expenses_export.csv` via UI.
2. Backend parses CSV row by row:
   - Normalize names, dates, currencies, numbers (per your documented rules).
   - For each row, run anomaly checks (duplicate detection, percentage sum check, membership window check, settlement-vs-expense heuristic, etc.).
   - Rows with NO anomalies → staged for import.
   - Rows WITH anomalies → logged in `import_anomalies` with a **suggested action**, NOT yet committed.
3. UI shows a **review screen**: list of anomalies, each with the raw row, the detected issue, and the suggested action — with buttons for user to **approve / change / skip**.
4. User reviews all anomalies, makes decisions.
5. On "Confirm Import": commit approved rows to `expenses`/`settlements`/`expense_splits`, write final decisions back to `import_anomalies.user_decision`.
6. Generate the **Import Report** — a page/PDF/markdown showing: total rows processed, X imported cleanly, Y anomalies found, Z resolved how.

This entire flow directly answers Meera's requirement ("I want to approve anything the app deletes or changes").

---

## 5. Balance Calculation (Must Satisfy Aisha + Rohan + Sam)

- **Aisha** wants: one number per pair of people — "Sam owes Aisha ₹X, done." → A simple **net balance summary screen** (pairwise, netted across all expenses+settlements in INR).
- **Rohan** wants: drill-down — clicking "you owe ₹2,300" shows the **list of expenses that sum to that number**, each with its split breakdown. So your balance calc must be traceable back to individual `expense_splits` rows, not just a precomputed black-box number.
- **Sam** wants: expenses dated before his `joined_at` should NOT appear in his balance at all — enforced via the membership-window check at import AND at balance-calc time (defense in depth).

Practice computing one person's balance **by hand** from the CSV before the live session — you'll be asked to do exactly this.

---

## 6. Deliverables — What Goes in Each File

### README.md
- Project description, live URL, tech stack, AI tool used, setup instructions (same structure as before).

### SCOPE.md
- **Anomaly log**: every issue from your table in Section 1 — what it is, why it's a problem, the policy you chose.
- **Database schema**: full schema with explanation of each table/field, especially `joined_at`/`left_at`, `import_anomalies`, currency fields.

### DECISIONS.md
- One entry per decision in Section 2 (and any others you make). Format per entry:
  ```markdown
  ## Decision: [Title]
  **Context**: [why this came up]
  **Options considered**: 1) ... 2) ... 3) ...
  **Decision**: [what you chose]
  **Reasoning**: [why]
  **Tradeoffs / what I'd change with more time**: ...
  ```

### Import Report (generated by the app)
- Not a static file you write — your **app must produce this** when CSV is imported. Could be an on-screen summary or downloadable. Should list: total rows, rows imported cleanly, each anomaly + how it was resolved, final counts of expenses/settlements created.

### AI_USAGE.md
- Which AI tool(s), key prompts (can reuse a PROMPTS.md-style log).
- **At least 3 concrete cases where AI got something wrong** — be specific:
  - What you asked
  - What the AI produced (wrong code/logic/assumption)
  - How you noticed it was wrong (testing? manual review? a CSV row that broke it?)
  - What you changed
  - Good candidates: AI might initially miss the time-based membership issue, might naively sum percentages without checking they total 100%, might silently drop the USD rows or treat $ as ₹, might mishandle the negative refund amount, might not catch the duplicate rows. Watch for these specifically — they're "designed" traps.

---

## 7. Git Commit History — Don't Forget This

The PDF explicitly flags "a single bulk commit is a red flag." Plan for **incremental, meaningful commits**:
- `feat: initial project setup + schema`
- `feat: auth module`
- `feat: group + time-based membership model`
- `feat: CSV parser with normalization rules`
- `feat: anomaly detection (duplicates, percentage sums, membership checks)`
- `feat: import review UI + approval flow`
- `feat: expense CRUD + 4 split types`
- `feat: balance calculation (pairwise + drill-down)`
- `feat: settlements`
- `docs: SCOPE.md, DECISIONS.md, AI_USAGE.md`
- `fix: ...` commits showing real iteration (good — shows you debugged things)

Commit as you go, don't squash everything at the end.

---

## 8. Build Order (2 Days)

### Day 1
1. Project setup, schema (Postgres + Prisma recommended), auth.
2. Groups with time-based membership (`joined_at`/`left_at`).
3. CSV parser — normalization functions (names, dates, numbers, currency) — write these as **unit-testable functions**, test against the actual CSV rows.
4. Anomaly detection logic — one function per anomaly type, each returning a structured "anomaly" object.
5. `import_anomalies` table + basic review UI (even a simple table with approve/skip buttons is fine).

### Day 2
1. Commit-import flow → creates expenses/settlements/splits from approved rows.
2. Import Report generation.
3. Expense CRUD (manual add, for completeness) with all 4 split types.
4. Balance calculation — pairwise net + drill-down view.
5. Settlements (manual record payment).
6. Deploy.
7. Write SCOPE.md, DECISIONS.md, AI_USAGE.md, README.md — these should mostly write themselves if you kept notes as you went (keep a running scratch notes file from Day 1!).
8. **Practice the live session**: pick 3-4 random CSV rows, trace them through your code end to end, and practice explaining your balance calc by hand for one person (e.g. Sam — easiest since he has the fewest expenses).

---

## 9. Final Pre-Submission Checklist

- [ ] Deployed app works in incognito; CSV import flow is fully functional end-to-end
- [ ] Import produces a visible Import Report
- [ ] Every anomaly from your SCOPE.md log is actually detected by the running app (don't document things your code doesn't do)
- [ ] You can explain, for ANY row in the CSV, what happens to it and why
- [ ] You can compute Sam's balance by hand and your app matches it
- [ ] Git history shows incremental commits with meaningful messages
- [ ] DECISIONS.md covers at least: time-based membership, multi-currency, duplicate handling, settlement detection, rounding, split types, guest handling, name normalization
- [ ] AI_USAGE.md has 3+ real "AI was wrong, here's what I fixed" examples
- [ ] You wrote/reviewed every line — no blind-pasted AI code you can't explain

Good luck — the key mindset shift from the old assignment: **this one rewards you for finding problems and being transparent about imperfect handling, not for hiding messiness behind a polished UI.**
