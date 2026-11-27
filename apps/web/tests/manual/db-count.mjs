import { Client } from "pg";

const url = process.env.DATABASE_URL || "postgresql://postgres@localhost:55433/inkwellio";
const client = new Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query("select count(*)::int as n from users where email like $1", [
    "%wp8drill%",
  ]);
  console.log("wp8drill users:", result.rows[0].n);
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name",
  );
  console.log("tables:", tables.rows.map((r) => r.table_name).join(","));
} finally {
  await client.end();
}