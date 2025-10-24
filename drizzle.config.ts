import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const required = [
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE"
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env variable ${key}`);
  }
}

const host = process.env.MYSQL_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host,
    port,
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!
  }
});
