import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("session_token")?.value;

    if (!userId) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, isGuest: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ user: null });
  }
}
