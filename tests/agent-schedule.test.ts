import test from "node:test";
import assert from "node:assert/strict";
import { nextWeekdayTime, weekdayRunReady } from "../src/lib/agent-schedule.ts";
import { taskInput } from "../src/agent-types.ts";

const schedule = {
  kind: "weekdays" as const,
  time: "08:00",
  timeZone: "Europe/Berlin",
};
const next = (value: string) =>
  new Date(nextWeekdayTime(Date.parse(value), schedule)).toISOString();
test("weekday mornings skip weekends and preserve 08:00 in Berlin through both daylight-saving transitions", () => {
  assert.equal(next("2026-10-16T06:00:00Z"), "2026-10-19T06:00:00.000Z");
  assert.equal(next("2026-10-23T06:00:00Z"), "2026-10-26T07:00:00.000Z");
  assert.equal(next("2026-03-27T07:00:00Z"), "2026-03-30T06:00:00.000Z");
  assert.equal(next("2026-10-12T05:59:30Z"), "2026-10-12T06:00:00.000Z");
});
test("weekday recovery waits through weekends and early mornings, then catches up once", () => {
  assert.equal(
    weekdayRunReady(Date.parse("2026-10-17T10:00:00Z"), schedule),
    false,
  );
  assert.equal(
    weekdayRunReady(Date.parse("2026-10-19T05:00:00Z"), schedule),
    false,
  );
  assert.equal(
    weekdayRunReady(Date.parse("2026-10-19T06:00:00Z"), schedule),
    true,
  );
  assert.equal(
    weekdayRunReady(Date.parse("2026-10-19T12:00:00Z"), schedule),
    true,
  );
});
test("schedule validation rejects bad clocks, time zones and conflicting interval repetition", () => {
  const task = {
    notebookId: "n",
    title: "Brief",
    prompt: "Summarize",
    skillId: "weekly-briefing",
    sourceIds: ["s"],
    dueAt: 0,
    schedule,
  };
  assert.equal(taskInput.safeParse(task).success, true);
  assert.equal(
    taskInput.safeParse({ ...task, schedule: { ...schedule, time: "25:00" } })
      .success,
    false,
  );
  assert.equal(
    taskInput.safeParse({
      ...task,
      schedule: { ...schedule, timeZone: "Invalid/Zone" },
    }).success,
    false,
  );
  assert.equal(
    taskInput.safeParse({ ...task, repeatHours: 24 }).success,
    false,
  );
});
