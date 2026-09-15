// サンプルCSV（public/samples/）を読み込んで初期データを投入する
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeCsvBytes, parseCsv } from "../src/lib/csv/parse";
import { validateCustomerCsv, validatePropertyCsv, formatRowError } from "../src/lib/csv/validate";

const prisma = new PrismaClient();

function readCsv(file: string) {
  const bytes = readFileSync(path.join(__dirname, "..", "public", "samples", file));
  return parseCsv(decodeCsvBytes(new Uint8Array(bytes)));
}

async function main() {
  const customers = validateCustomerCsv(readCsv("customers.csv"));
  const properties = validatePropertyCsv(readCsv("properties.csv"));
  const problems = [
    ...customers.fileErrors,
    ...customers.rowErrors.map(formatRowError),
    ...properties.fileErrors,
    ...properties.rowErrors.map(formatRowError),
  ];
  if (problems.length > 0) {
    console.error("サンプルCSVに問題があります:\n" + problems.join("\n"));
    process.exit(1);
  }

  const existing = (await prisma.customer.count()) + (await prisma.property.count());
  if (existing > 0) {
    console.log(`既にデータが存在するため seed をスキップしました（${existing}件）。初期化する場合は npm run db:reset を実行してください。`);
    return;
  }

  await prisma.$transaction([
    prisma.customer.createMany({ data: customers.records }),
    prisma.property.createMany({ data: properties.records }),
  ]);
  console.log(`seed 完了: 顧客 ${customers.records.length}件 / 物件 ${properties.records.length}件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
