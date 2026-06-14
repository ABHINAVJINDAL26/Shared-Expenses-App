import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userName, email, isGuest, joinedAt, leftAt } = await req.json();

    if (!userName) {
      return NextResponse.json({ error: "Member name is required" }, { status: 400 });
    }

    const member = await prisma.$transaction(async (tx) => {
      // Find or create user
      let user = await tx.user.findUnique({
        where: { name: userName },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            name: userName,
            email: email || `${userName.toLowerCase().replace(/\s+/g, '_')}_guest@example.com`,
            isGuest: !!isGuest,
          },
        });
      }

      // Check if already in group
      const existingMember = await tx.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: user.id,
          },
        },
      });

      if (existingMember) {
        throw new Error("User is already a member of this group");
      }

      const m = await tx.groupMember.create({
        data: {
          groupId,
          userId: user.id,
          joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
          leftAt: leftAt ? new Date(leftAt) : null,
        },
        include: {
          user: true,
        },
      });

      return m;
    });

    return NextResponse.json({ success: true, member });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupMemberId, joinedAt, leftAt } = await req.json();

    if (!groupMemberId) {
      return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    const updated = await prisma.groupMember.update({
      where: { id: groupMemberId },
      data: {
        joinedAt: joinedAt ? new Date(joinedAt) : undefined,
        leftAt: leftAt ? new Date(leftAt) : null,
      },
      include: {
        user: true,
      },
    });

    return NextResponse.json({ success: true, member: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
