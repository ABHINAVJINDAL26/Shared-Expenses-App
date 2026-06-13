import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const groupId = req.nextUrl.searchParams.get("groupId");
    
    // Fetch group
    const group = await prisma.group.findFirst();
    if (!group) {
      return NextResponse.json({ error: "No group found" }, { status: 404 });
    }

    const currentGroupId = groupId || group.id;

    // Fetch all users and their memberships for time-based checks
    const members = await prisma.groupMember.findMany({
      where: { groupId: currentGroupId },
      include: { user: true },
    });

    const memberMap = new Map<string, typeof members[0]>(); // userId -> member object
    members.forEach((m) => {
      memberMap.set(m.userId, m);
    });

    // Fetch all active expenses
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: currentGroupId,
        status: "active",
      },
      include: {
        paidBy: true,
        splits: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { expenseDate: "asc" },
    });

    // Fetch all settlements
    const settlements = await prisma.settlement.findMany({
      where: { groupId: currentGroupId },
      include: {
        fromUser: true,
        toUser: true,
      },
      orderBy: { settledAt: "asc" },
    });

    // Initialize balance matrix: owes[recipientId][payerId] = amount
    // E.g. owes[A][B] means B owes A this much.
    const owes: Record<string, Record<string, number>> = {};
    const userNames: Record<string, string> = {};

    members.forEach((m) => {
      owes[m.userId] = {};
      userNames[m.userId] = m.user.name;
      members.forEach((other) => {
        if (m.userId !== other.userId) {
          owes[m.userId][other.userId] = 0;
        }
      });
    });

    // Trace details for Rohan's requirement: key is user1Id_user2Id (alphabetical ordering of IDs)
    // E.g., for Aisha and Rohan, key is min(id1, id2)_max(id1, id2)
    interface TraceItem {
      type: "expense" | "settlement";
      id: string;
      description: string;
      date: string;
      amountInr: number;
      paidBy: string;
      payerId: string;
      yourShare: number; // share of user who owes, or settlement amount
    }
    const traces: Record<string, TraceItem[]> = {};

    const getTraceKey = (id1: string, id2: string) => {
      return id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`;
    };

    const addTraceItem = (id1: string, id2: string, item: TraceItem) => {
      const key = getTraceKey(id1, id2);
      if (!traces[key]) {
        traces[key] = [];
      }
      traces[key].push(item);
    };

    // 1. Process Expenses
    expenses.forEach((exp) => {
      const payerId = exp.paidById;
      const payerName = exp.paidBy.name;
      const expDate = new Date(exp.expenseDate);

      // Verify if payer was active on expense date
      const payerMem = memberMap.get(payerId);
      if (payerMem) {
        const joined = new Date(payerMem.joinedAt);
        const left = payerMem.leftAt ? new Date(payerMem.leftAt) : null;
        if (expDate < joined || (left && expDate > left)) {
          // Payer was not active, skip expense calculations
          return;
        }
      }

      exp.splits.forEach((split) => {
        const participantId = split.userId;
        const participantName = split.user.name;
        const shareAmount = split.computedAmountInr;

        if (participantId === payerId) {
          // Payer doesn't owe themselves
          return;
        }

        // Verify if participant was active on expense date (Sam's timeline constraint)
        const partMem = memberMap.get(participantId);
        if (partMem) {
          const joined = new Date(partMem.joinedAt);
          const left = partMem.leftAt ? new Date(partMem.leftAt) : null;
          if (expDate < joined || (left && expDate > left)) {
            // Participant was not active, they don't owe for this expense!
            return;
          }
        }

        // Participant owes Payer shareAmount
        if (owes[payerId] && owes[payerId][participantId] !== undefined) {
          owes[payerId][participantId] += shareAmount;
        }

        // Add to drill-down trace
        addTraceItem(payerId, participantId, {
          type: "expense",
          id: exp.id,
          description: exp.description,
          date: expDate.toLocaleDateString(),
          amountInr: exp.amountInInr,
          paidBy: payerName,
          payerId,
          yourShare: shareAmount,
        });
      });
    });

    // 2. Process Settlements
    settlements.forEach((set) => {
      const fromId = set.fromUserId;
      const toId = set.toUserId;
      const amount = set.amountInInr;
      const setDate = new Date(set.settledAt);

      // fromId paid toId (reduces what fromId owes toId, i.e. increases what toId owes fromId)
      if (owes[toId] && owes[toId][fromId] !== undefined) {
        owes[toId][fromId] -= amount; // reduces the debt
      }

      // Add to drill-down trace
      addTraceItem(fromId, toId, {
        type: "settlement",
        id: set.id,
        description: set.note || "Settlement / Payment",
        date: setDate.toLocaleDateString(),
        amountInr: amount,
        paidBy: set.fromUser.name,
        payerId: fromId,
        yourShare: amount,
      });
    });

    // 3. Compute net pairwise balances (Aisha's requirement)
    interface PairwiseBalance {
      fromUserId: string;
      fromUserName: string;
      toUserId: string;
      toUserName: string;
      amount: number;
      traceKey: string;
    }
    const pairwiseBalances: PairwiseBalance[] = [];

    const userIds = Object.keys(owes);
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const u1 = userIds[i];
        const u2 = userIds[j];

        // u2 owes u1 (u1 paid, u2 split)
        const u2OwesU1 = owes[u1][u2] || 0;
        // u1 owes u2 (u2 paid, u1 split)
        const u1OwesU2 = owes[u2][u1] || 0;

        const net = u2OwesU1 - u1OwesU2;
        const roundedNet = Math.round(net * 100) / 100;

        if (roundedNet > 0) {
          // u2 owes u1
          pairwiseBalances.push({
            fromUserId: u2,
            fromUserName: userNames[u2],
            toUserId: u1,
            toUserName: userNames[u1],
            amount: roundedNet,
            traceKey: getTraceKey(u1, u2),
          });
        } else if (roundedNet < 0) {
          // u1 owes u2
          pairwiseBalances.push({
            fromUserId: u1,
            fromUserName: userNames[u1],
            toUserId: u2,
            toUserName: userNames[u2],
            amount: Math.abs(roundedNet),
            traceKey: getTraceKey(u1, u2),
          });
        }
      }
    }

    // Sort pairwise balances by amount descending
    pairwiseBalances.sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      success: true,
      pairwiseBalances,
      traces,
      expensesCount: expenses.length,
      settlementsCount: settlements.length,
    });
  } catch (error: any) {
    console.error("API error /api/balances:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
