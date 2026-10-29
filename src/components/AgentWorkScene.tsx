import {
  Check,
  Circle,
  CircleAlert,
  CircleHelp,
  Clock3,
  LoaderCircle,
  Pause,
  Workflow,
} from "lucide-react";
import type { AgentActivityStatus } from "../agent-monitor-types";
import { activityLabels } from "../lib/agent-activity";
import "./agent-work-scene.css";

const sceneLabels = {
  running: "At work",
  waiting: "Waiting for your input",
  queued: "Ready when the task starts",
  completed: "Work complete",
  failed: "Work needs attention",
  interrupted: "Work interrupted",
  unknown: "Activity unavailable",
} satisfies Record<AgentActivityStatus, string>;

const steps = [
  "Selected notes",
  "Read source passages",
  "Draft a revision summary",
];

type StepState =
  | "complete"
  | "queued"
  | "running"
  | "waiting"
  | "failed"
  | "interrupted"
  | "unknown"
  | "upcoming";
const progress: Record<AgentActivityStatus, StepState[]> = {
  queued: ["complete", "queued", "upcoming"],
  running: ["complete", "complete", "running"],
  waiting: ["complete", "complete", "waiting"],
  completed: ["complete", "complete", "complete"],
  failed: ["complete", "failed", "upcoming"],
  interrupted: ["complete", "interrupted", "upcoming"],
  unknown: ["complete", "unknown", "upcoming"],
};
const previewProgress: StepState[][] = [
  ["complete", "queued", "upcoming"],
  ["complete", "running", "upcoming"],
  ["complete", "complete", "running"],
  ["complete", "complete", "waiting"],
];
const stepStatus: Record<StepState, string> = {
  complete: "Done",
  queued: "Queued",
  running: "In progress",
  waiting: "Your review",
  failed: "Needs attention",
  interrupted: "Interrupted",
  unknown: "Unavailable",
  upcoming: "Next",
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "complete") return <Check aria-hidden="true" />;
  if (state === "queued") return <Clock3 aria-hidden="true" />;
  if (state === "running") return <LoaderCircle aria-hidden="true" />;
  if (state === "waiting") return <Circle aria-hidden="true" />;
  if (state === "failed") return <CircleAlert aria-hidden="true" />;
  if (state === "interrupted") return <Pause aria-hidden="true" />;
  if (state === "unknown") return <CircleHelp aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

export function AgentWorkScene({
  name,
  status,
  motion,
  stage,
}: {
  name: string;
  status: AgentActivityStatus;
  motion: boolean;
  stage?: number;
}) {
  return (
    <figure
      className="agent-work-scene"
      data-state={status}
      data-motion={motion ? "on" : "off"}
      aria-label={`${name} activity animation: ${activityLabels[status]}`}
    >
      <div className="agent-scene-heading">
        <span className="agent-scene-icon">
          <Workflow size={15} aria-hidden="true" />
        </span>
        <span className="agent-scene-title">Study partner</span>
        <span className="agent-scene-state">
          <i aria-hidden="true" />
          {activityLabels[status]}
        </span>
      </div>
      <ol className="agent-scene-steps" aria-label="Example task progress">
        {steps.map((label, index) => {
          const state =
            stage === undefined
              ? progress[status][index]
              : previewProgress[
                  Math.max(0, Math.min(stage, previewProgress.length - 1))
                ][index];
          return (
            <li key={label} data-step-state={state}>
              <span className="agent-scene-marker">
                <StepIcon state={state} />
              </span>
              <span className="agent-scene-step-label">{label}</span>
              <span className="agent-scene-step-status">
                {stepStatus[state]}
              </span>
            </li>
          );
        })}
      </ol>
      <figcaption>{sceneLabels[status]}</figcaption>
    </figure>
  );
}
