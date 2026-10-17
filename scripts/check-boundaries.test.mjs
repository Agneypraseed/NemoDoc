import { test } from "node:test";
import assert from "node:assert/strict";
import { violations } from "./check-boundaries.mjs";
const root = process.cwd();
test("browser boundary covers static, dynamic, re-export, require and type imports", () => {
  for (const source of [
    'import fs from "node:fs"',
    'export * from "../server/app"',
    'import("../server/app")',
    'require("fs")',
    'type Secret = import("../server/app").Secret',
    "import(path)",
  ])
    assert.ok(
      violations(source, `${root}/src/example.ts`, root).length,
      source,
    );
});
test("shared contracts reject UI dependencies but permit sibling contracts", () => {
  assert.ok(
    violations(
      'import { useState } from "react"',
      `${root}/src/example-types.ts`,
      root,
    ).length,
  );
  assert.deepEqual(
    violations(
      'import type { AgentDashboard } from "./agent-monitor-types"',
      `${root}/src/example-types.ts`,
      root,
    ),
    [],
  );
  assert.deepEqual(
    violations(
      'import { useState } from "react"',
      `${root}/src/components/Example.tsx`,
      root,
    ),
    [],
  );
});
