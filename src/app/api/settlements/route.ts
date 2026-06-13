import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { fromUserId, toUserId, amount, currency, note } = await req.json();

    if (!fromUserId || !toUserId || !amount || !currency) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const group = await prisma.group.findFirst();
    if (!group) {
      return NextResponse.json({ error: "No group found" }, { status: 404 });
    }

    // Convert USD to INR if needed
    let amountInInr = amount;
    if (currency === "USD") {
      amountInInr = amount * 83;
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId: group.id,
        fromUserId,
        toUserId,
        amount: parseFloat(amount),
        currency,
        amountInInr: Math.round(amountInInr * 100) / 100,
        note: note || "Manual settlement",
        settledAt: new Date(),
        source: "manual",
      },
    });

    return NextResponse.json({ success: true, settlement });
  } catch (error: any) {
    console.error("API error /api/settlements:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
