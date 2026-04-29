import { PrismaClient } from "../src/generated/prisma-pg/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";

const ca = fs.readFileSync(
  path.join(process.cwd(), "cert/global-bundle.pem")
).toString();

let prisma: PrismaClient;

export const getPrisma = () => {
  if (!prisma) {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
        ssl: {
          ca,
          rejectUnauthorized: true,
        }
      }),
    });
  }
  return prisma;
};
