import { PrismaClient } from "@prisma/client";

const globalForPrisma=globalThis as unknown as { farmrentPrisma?: PrismaClient };
export const prisma=globalForPrisma.farmrentPrisma??new PrismaClient({log:process.env.NODE_ENV==="development"?["warn","error"]:["error"]});
if(process.env.NODE_ENV!=="production")globalForPrisma.farmrentPrisma=prisma;
