import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
    });

    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return NextResponse.json({ users, groups });
  } catch (error: any) {
    console.error("API error /api/users:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
