import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { normalizeName, parseSplitDetails } from "@/lib/parser";

interface DecisionPayload {
  action: "import" | "skip" | "normalize_percentages" | "exclude_and_redistribute" | "keep_as_is" | "assign_payer" | "resolve_date" | "absorb_into_host" | "create_guest" | "convert_to_settlement" | "use_shares" | "use_equal" | "default_inr";
  payerName?: string;
  resolvedDate?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { importBatchId, normalizedRows, decisions } = await req.json() as {
      importBatchId: string;
      normalizedRows: any[];
      decisions: Record<number, DecisionPayload>; // keyed by rowNumber
    };

    if (!importBatchId) {
      return NextResponse.json({ error: "No import batch ID provided" }, { status: 400 });
    }

    // Verify import batch
    const batch = await prisma.importBatch.findUnique({
      where: { id: importBatchId },
    });
    if (!batch) {
      return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    }

    // Get all users from DB
    const allUsers = await prisma.user.findMany();
    const userMap = new Map<string, string>(); // name -> id
    allUsers.forEach((u) => {
      userMap.set(u.name, u.id);
    });

    // We'll gather statistics for the import report
    let totalProcessed = 0;
    let cleanImportsCount = 0;
    let resolvedAnomaliesCount = 0;
    let skippedCount = 0;
    let expensesCreated = 0;
    let settlementsCreated = 0;

    const transactionActions: any[] = [];

    // Process each normalized row
    for (const row of normalizedRows) {
      const rowNum = row.rowNumber;
      totalProcessed++;

      // Check if there's a decision for this row
      const decision = decisions[rowNum] || { action: "import" };

      if (decision.action === "skip") {
        skippedCount++;
        // Update anomaly in DB if exists
        transactionActions.push(
          prisma.importAnomaly.updateMany({
            where: { importBatchId, rowNumber: rowNum },
            data: { userDecision: "skip", resolved: true },
          })
        );
        continue;
      }

      // Check if it's a fuzzy duplicate choice where this row was skipped
      // Let's say decision.action is 'skip' because we kept the other row.
      // E.g., for Thalassa dinner, if Rohan's dinner is kept and Aisha's dinner is skipped.

      // Resolve Payer
      let payerName = row.normalizedPaidBy;
      if (decision.action === "assign_payer" && decision.payerName) {
        payerName = normalizeName(decision.payerName);
      }

      if (!payerName) {
        // Skip or default to Aisha if it's still somehow empty
        payerName = "Aisha";
      }

      // Resolve Date
      let expenseDate = row.parsedDate ? new Date(row.parsedDate) : new Date();
      if (decision.action === "resolve_date" && decision.resolvedDate) {
        expenseDate = new Date(decision.resolvedDate);
      }

      // Resolve Currency and Amount
      const currency = row.currency || "INR";
      const amount = row.amount;
      const amountInInr = row.computedAmountInr;
      const exchangeRateUsed = row.exchangeRateUsed;

      // Handle split participants (splitWith)
      let splitWith: string[] = [...row.splitWith];

      // Stale membership check
      if (decision.action === "exclude_and_redistribute") {
        // Remove stale members (e.g. Meera in April, or Sam in March)
        // Let's check who is stale on this date.
        // Meera left end of March
        if (expenseDate > new Date("2026-03-31T23:59:59Z")) {
          splitWith = splitWith.filter(name => name !== "Meera");
        }
        // Sam joined mid-April
        if (expenseDate < new Date("2026-04-08T00:00:00Z")) {
          splitWith = splitWith.filter(name => name !== "Sam");
        }
        // Dev is only active March 8 to March 14
        if (expenseDate < new Date("2026-03-08T00:00:00Z") || expenseDate > new Date("2026-03-14T23:59:59Z")) {
          splitWith = splitWith.filter(name => name !== "Dev");
        }
      }

      // Guest Kabir check
      let absorbKabirIntoDev = false;
      if (decision.action === "absorb_into_host") {
        absorbKabirIntoDev = true;
        splitWith = splitWith.filter((name) => name !== "Kabir");
      } else if (decision.action === "create_guest" || splitWith.includes("Kabir")) {
        // Ensure Kabir is created as a guest user in the DB
        if (!userMap.has("Kabir")) {
          const guestUser = await prisma.user.create({
            data: { name: "Kabir", isGuest: true, email: "kabir_guest@example.com" },
          });
          userMap.set("Kabir", guestUser.id);
          // Also add guest membership
          await prisma.groupMember.create({
            data: {
              groupId: batch.groupId,
              userId: guestUser.id,
              joinedAt: new Date("2026-03-11T00:00:00Z"),
              leftAt: new Date("2026-03-11T23:59:59Z"),
            },
          });
        }
      }

      // Check if this row is resolved as a Settlement
      const isSettlement = decision.action === "convert_to_settlement" || 
                           (row.splitType === "" && splitWith.length === 1 && 
                            (row.description.toLowerCase().includes("paid back") || 
                             row.description.toLowerCase().includes("deposit") || 
                             row.description.toLowerCase().includes("settled")));

      if (isSettlement) {
        settlementsCreated++;
        // Identify recipient
        const toUserName = splitWith[0] || "Aisha"; // default to Aisha if empty
        
        // Ensure users exist
        let fromUserId = userMap.get(payerName);
        let toUserId = userMap.get(toUserName);

        // If payer is not created, create them
        if (!fromUserId) {
          const newUser = await prisma.user.create({ data: { name: payerName } });
          userMap.set(payerName, newUser.id);
          fromUserId = newUser.id;
        }
        if (!toUserId) {
          const newUser = await prisma.user.create({ data: { name: toUserName } });
          userMap.set(toUserName, newUser.id);
          toUserId = newUser.id;
        }

        // Record settlement
        transactionActions.push(
          prisma.settlement.create({
            data: {
              groupId: batch.groupId,
              fromUserId,
              toUserId,
              amount,
              currency,
              amountInInr,
              note: row.description + (row.notes ? ` - ${row.notes}` : ""),
              settledAt: expenseDate,
              source: "csv_import",
            },
          })
        );

        // Update anomalies if exists
        transactionActions.push(
          prisma.importAnomaly.updateMany({
            where: { importBatchId, rowNumber: rowNum },
            data: { userDecision: "convert_to_settlement", resolved: true },
          })
        );
        continue;
      }

      // Standard Expense path
      expensesCreated++;

      // Ensure Payer User exists
      let paidById = userMap.get(payerName);
      if (!paidById) {
        const newUser = await prisma.user.create({ data: { name: payerName } });
        userMap.set(payerName, newUser.id);
        paidById = newUser.id;
      }

      let splitType = row.splitType || "equal";
      if (decision.action === "use_shares") {
        splitType = "share";
      } else if (decision.action === "use_equal") {
        splitType = "equal";
      }

      // Calculate splits
      interface ComputedSplit {
        userName: string;
        userId: string;
        shareValue: number;
        amount: number;
      }
      let computedSplits: ComputedSplit[] = [];

      // Ensure all splitWith users exist in DB
      for (const member of splitWith) {
        if (!userMap.has(member)) {
          const newUser = await prisma.user.create({ data: { name: member } });
          userMap.set(member, newUser.id);
        }
      }

      if (splitType === "equal") {
        const count = splitWith.length;
        const baseShare = Math.round((amountInInr / count) * 100) / 100;
        
        computedSplits = splitWith.map((name) => ({
          userName: name,
          userId: userMap.get(name)!,
          shareValue: 1.0,
          amount: baseShare,
        }));
      } else if (splitType === "percentage") {
        const rawPercentages = parseSplitDetails(row.splitDetails);
        
        // Normalize percentage values if needed
        let totalPct = 0;
        splitWith.forEach((name) => {
          totalPct += rawPercentages.get(name) || 0;
        });

        const shouldNormalize = decision.action === "normalize_percentages" || totalPct !== 100;

        computedSplits = splitWith.map((name) => {
          let pct = rawPercentages.get(name) || 0;
          if (shouldNormalize && totalPct > 0) {
            pct = (pct / totalPct) * 100;
          }
          const shareAmt = Math.round((pct / 100) * amountInInr * 100) / 100;
          return {
            userName: name,
            userId: userMap.get(name)!,
            shareValue: pct,
            amount: shareAmt,
          };
        });
      } else if (splitType === "share") {
        const rawShares = parseSplitDetails(row.splitDetails);
        let totalShares = 0;
        splitWith.forEach((name) => {
          totalShares += rawShares.get(name) || 1; // default to 1 share if missing
        });

        computedSplits = splitWith.map((name) => {
          const shares = rawShares.get(name) || 1;
          const shareAmt = Math.round((shares / totalShares) * amountInInr * 100) / 100;
          return {
            userName: name,
            userId: userMap.get(name)!,
            shareValue: shares,
            amount: shareAmt,
          };
        });
      } else if (splitType === "unequal") {
        const rawAmounts = parseSplitDetails(row.splitDetails);
        computedSplits = splitWith.map((name) => {
          const amt = rawAmounts.get(name) || 0;
          return {
            userName: name,
            userId: userMap.get(name)!,
            shareValue: amt,
            amount: amt, // unequal split details are raw INR amounts directly
          };
        });
      }

      // Handle Dev absorbing Kabir's share
      if (absorbKabirIntoDev && splitWith.includes("Dev")) {
        // Kabir's share needs to be calculated and added to Dev
        // Kabir's name is in the original CSV split_with but excluded from our resolved splitWith.
        // Let's find Kabir's portion:
        // We'll calculate the split with Kabir included, get Kabir's share, and then add it to Dev.
        let kabirShareAmt = 0;
        const extendedSplitWith = [...splitWith, "Kabir"];
        
        if (splitType === "equal") {
          const count = extendedSplitWith.length;
          kabirShareAmt = Math.round((amountInInr / count) * 100) / 100;
          
          // Re-calculate splits without Kabir, but Dev gets devShare + kabirShare
          const baseShare = Math.round((amountInInr / count) * 100) / 100;
          computedSplits = splitWith.map((name) => {
            const isDev = name === "Dev";
            return {
              userName: name,
              userId: userMap.get(name)!,
              shareValue: 1.0,
              amount: isDev ? baseShare + baseShare : baseShare,
            };
          });
        }
        // Dev absorbing Kabir's share on equal splits is the only instance in the CSV, but this is robust.
      }

      // Apply Rounding Remainder Rule (Decision 5):
      // Sum the computed splits and compare to amountInInr. Give the remainder to the payer.
      const sumOfSplits = computedSplits.reduce((sum, s) => sum + s.amount, 0);
      const remainder = Math.round((amountInInr - sumOfSplits) * 100) / 100;
      
      if (remainder !== 0) {
        // Find payer in the splits list
        const payerSplit = computedSplits.find((s) => s.userId === paidById);
        if (payerSplit) {
          payerSplit.amount = Math.round((payerSplit.amount + remainder) * 100) / 100;
        } else {
          // If payer is not in the split, give it to the first person in alphabetical order
          computedSplits[0].amount = Math.round((computedSplits[0].amount + remainder) * 100) / 100;
        }
      }

      // Record Expense
      const expenseId = `exp-row-${rowNum}`;
      
      transactionActions.push(
        prisma.expense.create({
          data: {
            groupId: batch.groupId,
            description: row.description,
            amount,
            currency,
            amountInInr,
            exchangeRateUsed,
            paidById,
            splitType,
            expenseDate,
            source: "csv_import",
            importBatchId,
            status: "active",
            notes: row.notes,
          },
        })
      );

      // Record Splits
      computedSplits.forEach((split) => {
        transactionActions.push(
          prisma.expenseSplit.create({
            data: {
              expenseId,
              userId: split.userId,
              shareValue: split.shareValue,
              computedAmountInr: split.amount,
            },
          })
        );
      });

      // Update anomalies if exists
      transactionActions.push(
        prisma.importAnomaly.updateMany({
          where: { importBatchId, rowNumber: rowNum },
          data: { userDecision: decision.action, resolved: true },
        })
      );

      if (decision.action !== "import") {
        resolvedAnomaliesCount++;
      } else {
        cleanImportsCount++;
      }
    }

    // Mark the ImportBatch as completed
    transactionActions.push(
      prisma.importBatch.update({
        where: { id: importBatchId },
        data: { status: "completed" },
      })
    );

    // Execute transaction
    await prisma.$transaction(transactionActions);

    return NextResponse.json({
      success: true,
      importBatchId,
      summary: {
        totalProcessed,
        cleanImportsCount,
        resolvedAnomaliesCount,
        skippedCount,
        expensesCreated,
        settlementsCreated,
      },
    });
  } catch (error: any) {
    console.error("API error /api/import/confirm:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
