export interface WeekdaySchedule {
  kind: "weekdays";
  time: string;
  timeZone: string;
}

const minute = 60000;
const formatters = new Map<string, Intl.DateTimeFormat>();
function localTime(at: number, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 64) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    weekday: !["Sat", "Sun"].includes(parts.weekday),
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Walk UTC minutes, so local-clock changes neither shift 08:00 nor create a
// nonexistent wall-clock instant. The next matching minute is strictly later.
export function nextWeekdayTime(after: number, schedule: WeekdaySchedule) {
  const start = Math.floor(after / minute) * minute + minute;
  for (let at = start; at <= start + 8 * 24 * 60 * minute; at += minute) {
    const local = localTime(at, schedule.timeZone);
    if (local.weekday && local.time === schedule.time) return at;
  }
  throw new Error("Could not find the next weekday time. Check the schedule.");
}

// Catch up once on a weekday after the chosen time. Missed weekend runs and
// restarts before today's scheduled time wait for the next matching morning.
export function weekdayRunReady(now: number, schedule: WeekdaySchedule) {
  const local = localTime(now, schedule.timeZone);
  return local.weekday && local.time >= schedule.time;
}
