import test from "node:test";
import assert from "node:assert/strict";
import { mergeRectsByLine } from "../src/lib/evidence.ts";

test("glyph rectangles become one quiet marker per selected text line", () => {
  const merged = mergeRectsByLine([
    { x: 0.22, y: 0.2, width: 0.012, height: 0.012 },
    { x: 0.25, y: 0.202, width: 0.018, height: 0.012 },
    { x: 0.29, y: 0.201, width: 0.01, height: 0.012 },
    { x: 0.22, y: 0.25, width: 0.03, height: 0.012 },
  ]);
  assert.equal(merged.length, 2);
  assert.ok(Math.abs(merged[0].x - 0.22) < 1e-9);
  assert.ok(Math.abs(merged[0].y - 0.2) < 1e-9);
  assert.ok(Math.abs(merged[0].width - 0.08) < 1e-9);
  assert.ok(Math.abs(merged[0].height - 0.014) < 1e-9);
  assert.equal(merged[1].y, 0.25);
});
