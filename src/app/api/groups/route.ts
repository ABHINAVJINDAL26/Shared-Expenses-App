import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: true
          }
        }
      }
    });
    return NextResponse.json({ success: true, groups });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, memberUserIds } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { name },
      });

      // Add creating user as member automatically
      await tx.groupMember.create({
        data: {
          groupId: g.id,
          userId,
          joinedAt: new Date(),
        },
      });

      // Add other selected members
      if (memberUserIds && Array.isArray(memberUserIds)) {
        for (const mId of memberUserIds) {
          if (mId !== userId) {
            // Check if user exists
            const userExists = await tx.user.findUnique({ where: { id: mId } });
            if (userExists) {
              await tx.groupMember.create({
                data: {
                  groupId: g.id,
                  userId: mId,
                  joinedAt: new Date(),
                },
              });
            }
          }
        }
      }

      return g;
    });

    return NextResponse.json({ success: true, group });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
