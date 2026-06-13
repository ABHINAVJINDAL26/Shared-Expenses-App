import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

declare global {
  var prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

const url = process.env.DATABASE_URL || "file:dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (process.env.NODE_ENV === "production") {
  const adapter = new PrismaLibSql({
    url,
    authToken,
  });
  prisma = new PrismaClient({ adapter });
} else {
  if (!global.prisma) {
    const adapter = new PrismaLibSql({
      url,
      authToken,
    });
    global.prisma = new PrismaClient({ adapter });
  }
  prisma = global.prisma;
}

export default prisma;
