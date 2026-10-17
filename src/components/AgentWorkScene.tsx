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

export function AgentWorkScene({
  name,
  status,
  motion,
}: {
  name: string;
  status: AgentActivityStatus;
  motion: boolean;
}) {
  return (
    <figure
      className="agent-work-scene"
      data-state={status}
      data-motion={motion ? "on" : "off"}
      aria-label={`${name} activity animation: ${activityLabels[status]}`}
    >
      <svg viewBox="0 0 320 155" aria-hidden="true" focusable="false">
        <ellipse className="scene-shadow" cx="160" cy="143" rx="112" ry="6" />
        <path
          className="scene-backdrop"
          d="M26 130V35a13 13 0 0 1 13-13h242a13 13 0 0 1 13 13v95"
        />
        <path
          className="scene-grid"
          d="M26 67h268M26 101h268M80 22v108M240 22v108"
        />
        <rect
          className="scene-chair"
          x="85"
          y="93"
          width="56"
          height="41"
          rx="12"
        />
        <path className="scene-chair" d="M106 130v13m-14 0h28" />
        <g className="scene-bot">
          <rect
            className="scene-body"
            x="91"
            y="80"
            width="47"
            height="40"
            rx="15"
          />
          <g className="scene-head">
            <path className="scene-antenna" d="M114 41V31" />
            <circle className="scene-antenna-light" cx="114" cy="28" r="4" />
            <rect
              className="scene-body"
              x="80"
              y="42"
              width="67"
              height="45"
              rx="17"
            />
            <rect
              className="scene-face"
              x="89"
              y="50"
              width="49"
              height="27"
              rx="9"
            />
            <g className="scene-eyes">
              <rect x="100" y="58" width="5" height="9" rx="2.5" />
              <rect x="121" y="58" width="5" height="9" rx="2.5" />
            </g>
          </g>
          <path className="scene-arm scene-arm-left" d="M99 91q-12 16 20 19" />
          <path className="scene-arm scene-arm-right" d="M132 90q9 12 21 17" />
        </g>
        <path className="scene-desk-legs" d="M69 117v26m188-26v26" />
        <rect
          className="scene-desk"
          x="56"
          y="111"
          width="213"
          height="7"
          rx="3.5"
        />
        <path className="scene-keyboard" d="M121 107h46l8 4h-58z" />
        <g className="scene-monitor">
          <path className="scene-stand" d="M198 94v15m-13 0h27" />
          <rect
            className="scene-monitor-frame"
            x="160"
            y="48"
            width="78"
            height="49"
            rx="6"
          />
          <rect
            className="scene-screen"
            x="166"
            y="54"
            width="66"
            height="36"
            rx="2"
          />
          <g className="scene-code">
            <path className="scene-line line-one" d="M174 63h26" />
            <path className="scene-line line-two" d="M174 71h44" />
            <path className="scene-line line-three" d="M174 79h34" />
          </g>
          {status === "completed" && (
            <path className="scene-result" d="m185 72 9 8 17-18" />
          )}
          {(status === "failed" || status === "interrupted") && (
            <path className="scene-result" d="M198 61v12m0 7v1" />
          )}
          {(status === "waiting" || status === "queued") && (
            <g className="scene-clock">
              <circle cx="198" cy="72" r="12" />
              <path d="M198 64v8l5 3" />
            </g>
          )}
          {status === "unknown" && (
            <path
              className="scene-disconnected"
              d="m185 61 26 22m-26 0 26-22"
            />
          )}
        </g>
        <g className="scene-note">
          <rect x="42" y="63" width="20" height="25" rx="2" />
          <path d="M47 70h10m-10 5h10m-10 5h6" />
        </g>
        <g className="scene-mug">
          <path d="M247 94h13v15h-13zm13 3h4a4 4 0 0 1 0 7h-4" />
          <path className="scene-steam" d="M252 90q-4-4 0-8" />
        </g>
      </svg>
      <figcaption>{sceneLabels[status]}</figcaption>
    </figure>
  );
}
