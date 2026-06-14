import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import crypto from "crypto";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

console.log("Debug - DATABASE_URL env:", process.env.DATABASE_URL);
console.log("Debug - libsql url:", process.env.DATABASE_URL || "file:dev.db");

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.importAnomaly.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const hashPassword = (pwd: string) => crypto.createHash("sha256").update(pwd).digest("hex");
  const defaultHash = hashPassword("password123");

  // Create users
  const aisha = await prisma.user.create({
    data: { name: "Aisha", email: "aisha@example.com", passwordHash: defaultHash },
  });
  const rohan = await prisma.user.create({
    data: { name: "Rohan", email: "rohan@example.com", passwordHash: defaultHash },
  });
  const priya = await prisma.user.create({
    data: { name: "Priya", email: "priya@example.com", passwordHash: defaultHash },
  });
  const meera = await prisma.user.create({
    data: { name: "Meera", email: "meera@example.com", passwordHash: defaultHash },
  });
  const sam = await prisma.user.create({
    data: { name: "Sam", email: "sam@example.com", passwordHash: defaultHash },
  });
  const dev = await prisma.user.create({
    data: { name: "Dev", email: "dev@example.com", isGuest: true, passwordHash: null },
  });
  const kabir = await prisma.user.create({
    data: { name: "Kabir", email: "kabir@example.com", isGuest: true, passwordHash: null },
  });

  console.log("Users created:", {
    aisha: aisha.id,
    rohan: rohan.id,
    priya: priya.id,
    meera: meera.id,
    sam: sam.id,
    dev: dev.id,
    kabir: kabir.id,
  });

  // Create Group
  const group = await prisma.group.create({
    data: {
      name: "Flat Share",
    },
  });

  console.log("Group created:", group.name, group.id);

  // Define memberships (time-based)
  // Aisha: Joined Feb 1, 2026
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: aisha.id,
      joinedAt: new Date("2026-02-01T00:00:00Z"),
    },
  });

  // Rohan: Joined Feb 1, 2026
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: rohan.id,
      joinedAt: new Date("2026-02-01T00:00:00Z"),
    },
  });

  // Priya: Joined Feb 1, 2026
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: priya.id,
      joinedAt: new Date("2026-02-01T00:00:00Z"),
    },
  });

  // Meera: Joined Feb 1, 2026, Left March 31, 2026
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: meera.id,
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: new Date("2026-03-31T23:59:59Z"),
    },
  });

  // Sam: Joined April 8, 2026 (when he paid his deposit)
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: sam.id,
      joinedAt: new Date("2026-04-08T00:00:00Z"),
    },
  });

  // Dev: Guest for Goa trip (March 8 to March 14, 2026)
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: dev.id,
      joinedAt: new Date("2026-03-08T00:00:00Z"),
      leftAt: new Date("2026-03-14T23:59:59Z"),
    },
  });

  // Kabir: Dev's friend, Guest for Goa parasailing day (March 11, 2026)
  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: kabir.id,
      joinedAt: new Date("2026-03-11T00:00:00Z"),
      leftAt: new Date("2026-03-11T23:59:59Z"),
    },
  });

  console.log("Group memberships seeded successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
