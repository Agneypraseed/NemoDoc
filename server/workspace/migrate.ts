import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { Pool } from "pg";

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72461938)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS workspace_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL("./migrations/", import.meta.url);
    for (const name of readdirSync(directory)
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = readFileSync(new URL(name, directory), "utf8").replace(
        /\r\n/g,
        "\n",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const result = await client.query(
        "SELECT checksum FROM workspace_migrations WHERE name=$1",
        [name],
      );
      if (result.rows.length) {
        if (result.rows[0].checksum !== checksum)
          throw new Error(`Migration ${name} changed after application.`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO workspace_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
