import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      description,
      amount,
      currency,
      exchangeRateUsed,
      paidById,
      splitType,
      expenseDate,
      splits, // Array of { userId: string, shareValue: number }
      notes,
    } = await req.json();

    if (!description || !amount || !paidById || !splitType || !expenseDate || !splits || splits.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Convert amount to INR
    const rate = exchangeRateUsed || (currency === "USD" ? 83.00 : 1.00);
    const amountInInr = amount * rate;

    // Apply Rounding Rule: Payer absorbs remainder
    let computedSplits = [];
    if (splitType === "equal") {
      const count = splits.length;
      const baseShare = Math.round((amountInInr / count) * 100) / 100;
      computedSplits = splits.map((s: any) => ({
        userId: s.userId,
        shareValue: 1.0,
        amount: baseShare,
      }));
    } else if (splitType === "percentage") {
      const totalPct = splits.reduce((sum: number, s: any) => sum + s.shareValue, 0);
      computedSplits = splits.map((s: any) => {
        let pct = s.shareValue;
        if (totalPct !== 100 && totalPct > 0) {
          pct = (pct / totalPct) * 100;
        }
        const shareAmt = Math.round((pct / 100) * amountInInr * 100) / 100;
        return {
          userId: s.userId,
          shareValue: pct,
          amount: shareAmt,
        };
      });
    } else if (splitType === "share") {
      const totalShares = splits.reduce((sum: number, s: any) => sum + s.shareValue, 0);
      computedSplits = splits.map((s: any) => {
        const shareAmt = Math.round((s.shareValue / totalShares) * amountInInr * 100) / 100;
        return {
          userId: s.userId,
          shareValue: s.shareValue,
          amount: shareAmt,
        };
      });
    } else if (splitType === "unequal") {
      computedSplits = splits.map((s: any) => ({
        userId: s.userId,
        shareValue: s.shareValue,
        amount: s.shareValue,
      }));
    }

    const sumOfSplits = computedSplits.reduce((sum: number, s: any) => sum + s.amount, 0);
    const remainder = Math.round((amountInInr - sumOfSplits) * 100) / 100;

    if (remainder !== 0) {
      const payerSplit = computedSplits.find((s: any) => s.userId === paidById);
      if (payerSplit) {
        payerSplit.amount = Math.round((payerSplit.amount + remainder) * 100) / 100;
      } else {
        computedSplits[0].amount = Math.round((computedSplits[0].amount + remainder) * 100) / 100;
      }
    }

    const updatedExpense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id },
        data: {
          description,
          amount,
          currency,
          amountInInr,
          exchangeRateUsed: rate,
          paidById,
          splitType,
          expenseDate: new Date(expenseDate),
          notes,
        },
      });

      // Clear old splits and insert new splits
      await tx.expenseSplit.deleteMany({
        where: { expenseId: id },
      });

      for (const split of computedSplits) {
        await tx.expenseSplit.create({
          data: {
            expenseId: id,
            userId: split.userId,
            shareValue: split.shareValue,
            computedAmountInr: split.amount,
          },
        });
      }

      return exp;
    });

    return NextResponse.json({ success: true, expense: updatedExpense });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        splits: true,
      },
    });
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, expense });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.expense.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
