import { spawnSync } from "node:child_process";
import { availableParallelism, totalmem, platform } from "node:os";
import { statfsSync } from "node:fs";

// This only inspects the host. It never installs software, starts a sandbox,
// reads application credentials or claims that containment has been verified.
let ready = true;
function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "CHECK"} ${label}: ${detail}`);
  if (!ok) ready = false;
}
function command(binary, args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 128 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Print only known version fields, never raw CLI diagnostics or environment.
  return result.status === 0 ? result.stdout.trim() : "";
}
const [major, minor] = process.versions.node.split(".").map(Number);
report(
  "Node.js",
  major > 22 || (major === 22 && minor >= 19),
  process.versions.node,
);
const npm = command("npm", ["--version"]);
report(
  "npm",
  Number(npm.split(".")[0]) >= 10,
  /^\d+(\.\d+)+$/.test(npm) ? npm : "not available",
);
report(
  "platform",
  platform() === "linux",
  `${platform()} (see NVIDIA's supported-host prerequisites)`,
);
const cpu = availableParallelism();
report("CPU", cpu >= 4, `${cpu} available logical CPUs; recommended minimum 4`);
const memory = totalmem() / 1024 ** 3;
report("memory", memory >= 8, `${memory.toFixed(1)} GiB; minimum 8`);
try {
  const disk = statfsSync(process.cwd());
  const available = (disk.bavail * disk.bsize) / 1024 ** 3;
  report(
    "disk",
    available >= 20,
    `${available.toFixed(1)} GiB available here; allow 20 GiB on the runtime disk`,
  );
} catch {
  report("disk", false, "check 20 GiB available on the runtime disk");
}
const docker = command("docker", ["info", "--format", "{{.ServerVersion}}"]);
report(
  "Docker daemon",
  !!docker,
  /^\d[\w.+-]*$/.test(docker)
    ? docker
    : "not reachable using the current Docker context",
);
for (const binary of ["nemoclaw", "openshell"]) {
  const version = command(binary, ["--version"]);
  report(
    binary,
    !!version,
    version
      ? "installed (check supported versions with NVIDIA's installer)"
      : "not installed or not working",
  );
}
console.log(
  "\nHost prerequisites only. Sandbox containment and gateway tool support are separate checks.",
);
console.log(
  "Follow docs/NEMOCLAW.md; run the native sandbox doctor on the runtime host and test the gateway in Agents → Connections.",
);
process.exitCode = ready ? 0 : 1;
