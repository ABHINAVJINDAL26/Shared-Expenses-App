# AI Usage Report

This document log details the AI tools used, key prompts, and concrete instances where the AI collaborator generated incorrect code or configurations, including how they were caught and corrected.

---

## 1. AI Tooling and Prompts
*   **AI Collaborator:** Gemini 3.5 Flash (Medium) via Antigravity IDE.
*   **Key Prompts:**
    *   "Verify database schema for SQLite in Prisma 7."
    *   "Write custom CSV parser with anomaly detection."
    *   "Compute net pairwise balances and trace contributing items."

---

## 2. Concrete Cases of AI Corrections

### Case 1: Prisma 7 Datasource URL Validation Failure
*   **What was asked:** "Generate a Prisma schema with SQLite for our models."
*   **What the AI produced:**
    ```prisma
    datasource db {
      provider = "sqlite"
      url      = "file:./dev.db"
    }
    ```
*   **How we caught it:** When running `npx prisma migrate dev`, the CLI failed with:
    `error: The datasource property url is no longer supported in schema files. Move connection URLs for Migrate to prisma.config.ts...`
*   **What was changed:** Prisma 7 deprecates the `url` property inside the schema file when a config file is present. We removed `url = "file:./dev.db"` from `prisma/schema.prisma` and configured it dynamically in `prisma.config.ts`.

---

### Case 2: Staging Database URL Undefined at Runtime
*   **What was asked:** "Write a Prisma seed script to populate users and memberships."
*   **What the AI produced:**
    ```typescript
    import { PrismaClient } from "@prisma/client";
    import { PrismaLibSql } from "@prisma/adapter-libsql";
    import { createClient } from "@libsql/client";

    const libsql = createClient({ url: "file:dev.db" });
    const adapter = new PrismaLibSql(libsql);
    const prisma = new PrismaClient({ adapter });
    ```
*   **How we caught it:** Running `npx prisma db seed` crashed with:
    `URL_INVALID: The URL 'undefined' is not in a valid format`
    We printed the environment variables in the script and found `process.env.DATABASE_URL` was `undefined`.
*   **What was changed:** Unlike older Prisma versions, Prisma 7 doesn't automatically load `.env` files inside application runtimes (like `tsx`). We explicitly imported `import "dotenv/config";` at the very top of `seed.ts` to load the variables. We also updated the LibSQL adapter call to accept the configuration object directly (`new PrismaLibSql({ url: "file:dev.db" })`) per Prisma 7 client conventions.

---

### Case 3: Case-Sensitivity Mismatch in LibSQL Adapter Imports
*   **What was asked:** "Initialize PrismaClient with the LibSQL driver adapter."
*   **What the AI produced:**
    ```typescript
    import { PrismaLibSQL } from "@prisma/adapter-libsql";
    ```
*   **How we caught it:** Executing the script crashed with:
    `TypeError: import_adapter_libsql.PrismaLibSQL is not a constructor`
*   **What was changed:** We inspected the exports of `@prisma/adapter-libsql` by running a Node.js shell command. We discovered that the class is exported as `PrismaLibSql` (with a lowercase 'q' and 'l' in 'Sql') rather than `PrismaLibSQL`. We modified the import to `PrismaLibSql` to fix the compilation error.

---

### Case 4: Reference Variable Typo in Integration Test Suite
*   **What was asked:** "Write a comprehensive integration test to verify the transaction imports pipeline."
*   **What the AI produced:**
    ```typescript
    transactionActions.push(
      prisma.importBatch.update({
        where: { id: importBatchId },
        data: { status: "completed" },
      })
    );
    ```
*   **How we caught it:** When running `npx tsx src/tests/integration.test.ts`, the TS compiler/runtime crashed with a reference error stating `importBatchId` was not defined.
*   **What was changed:** We reviewed the test and saw that the generated batch was stored in the `importBatch` object. We corrected the lookup key from `importBatchId` to `importBatch.id` on line 426, which allowed the test to execute and verify the full transactional pipeline cleanly.

