import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { name }
        ]
      }
    });

    if (existing) {
      return NextResponse.json({ error: "User with this email or name already exists" }, { status: 400 });
    }

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

    // Start a transaction: Create User, and add to the default "Flat Share" group
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          isGuest: false,
        },
      });

      // Find standard group "Flat Share"
      const defaultGroup = await tx.group.findFirst({
        where: { name: "Flat Share" },
      });

      if (defaultGroup) {
        await tx.groupMember.create({
          data: {
            groupId: defaultGroup.id,
            userId: newUser.id,
            joinedAt: new Date(),
          },
        });
      }

      return newUser;
    });

    const response = NextResponse.json({
      success: true,
      user: { id: result.id, name: result.name, email: result.email },
    });

    // Set cookie
    response.cookies.set("session_token", result.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
