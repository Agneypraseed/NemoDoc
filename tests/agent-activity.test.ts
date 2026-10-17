import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentActivity,
  filterActivity,
  isActivityFilter,
} from "../src/lib/agent-activity.ts";
import type { RuntimeActivity } from "../src/agent-monitor-types.ts";
const rows: RuntimeActivity[] = [
  {
    id: "a",
    agentId: "study",
    title: "Morning notes",
    summary: "Checking citations",
    status: "running",
    updatedAt: 1,
  },
  {
    id: "b",
    agentId: "research",
    title: "Compare papers",
    summary: "Approval needed",
    status: "waiting",
    updatedAt: 3,
  },
  {
    id: "c",
    agentId: "study",
    title: "Evening review",
    summary: "Finished",
    status: "completed",
    updatedAt: 5,
  },
  {
    id: "d",
    agentId: "study",
    title: "New revision",
    summary: "Reading",
    status: "running",
    updatedAt: 4,
  },
];
test("current work takes priority over newer finished sessions; newest active session wins", () => {
  assert.equal(currentActivity(rows)?.id, "d");
  assert.equal(currentActivity([...rows].reverse())?.id, "d");
  assert.equal(currentActivity([]), undefined);
});
test("activity filters intersect, ignore surrounding whitespace, and never mutate snapshots", () => {
  const before = structuredClone(rows);
  assert.deepEqual(
    filterActivity(rows, {
      agentId: "study",
      status: "running",
      query: "  CITATIONS ",
    }).map((r) => r.id),
    ["a"],
  );
  assert.equal(
    filterActivity(rows, { agentId: "study", status: "waiting", query: "" })
      .length,
    0,
  );
  assert.deepEqual(
    filterActivity(rows, { agentId: "", status: "all", query: "" }).map(
      (r) => r.id,
    ),
    ["c", "d", "b", "a"],
  );
  assert.deepEqual(rows, before);
  for (const invalid of ["constructor", "__proto__", "idle", ""])
    assert.equal(isActivityFilter(invalid), false);
});
