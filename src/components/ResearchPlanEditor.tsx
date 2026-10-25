import type { ResearchPlan } from "../workspace-types";
import type { ResearchModelCatalog } from "../research-model-types";
import { ResearchInstructions } from "./ResearchInstructions";

export function ResearchPlanEditor({
  plan,
  onChange,
  models,
}: {
  plan: ResearchPlan;
  onChange: (plan: ResearchPlan) => void;
  models?: ResearchModelCatalog;
}) {
  const update = (
    index: number,
    changes: Partial<ResearchPlan["agents"][number]>,
  ) =>
    onChange({
      ...plan,
      agents: plan.agents.map((a, i) =>
        i === index ? { ...a, ...changes } : a,
      ),
    });
  return (
    <fieldset className="research-plan-editor">
      <legend>Review team assignments</legend>
      <p className="agent-fine">Instructions apply to this task.</p>
      {plan.agents.map((agent, index) => (
        <article
          className="agent-form"
          key={agent.id}
          aria-label={`Assignment ${index + 1}`}
        >
          <label className="field-label">
            Agent name
            <input
              aria-label={`Agent ${index + 1} name`}
              value={agent.name}
              maxLength={100}
              onChange={(e) => update(index, { name: e.target.value })}
            />
          </label>
          <p>
            {agent.role === "reviewer"
              ? "Critical reviewer · final report"
              : "Researcher"}
          </p>
          <label className="field-label">
            Task assignment
            <textarea
              aria-label={`Agent ${index + 1} assignment`}
              value={agent.assignment}
              maxLength={2000}
              placeholder="Describe this agent’s goal, sources, and expected output…"
              rows={3}
              onChange={(e) =>
                update(index, {
                  assignment: e.target.value,
                  ...(agent.modelProfileId
                    ? {
                        modelSelection: "manual",
                        modelReason:
                          "Model retained after editing the assignment; reviewed in the plan.",
                      }
                    : {}),
                })
              }
            />
          </label>
          <ResearchInstructions
            name={agent.name}
            content={agent.instructions ?? ""}
            onChange={(instructions) => update(index, { instructions })}
          />
          <>
            <label className="field-label">
              Assigned model
              <select
                aria-label={`Agent ${index + 1} model`}
                value={agent.modelProfileId ?? "default"}
                onChange={(e) =>
                  update(index, {
                    modelProfileId: e.target.value,
                    modelSelection: "manual",
                    modelReason: "Selected manually in the reviewed plan.",
                  })
                }
              >
                {models?.profiles.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.tested}>
                    {p.name} · {p.model}
                    {p.tested ? "" : " (test required)"}
                  </option>
                ))}
              </select>
            </label>
            <p className="agent-fine">
              {agent.modelSelection === "manual"
                ? "Manual choice"
                : "Planner suggestion"}
              {agent.modelReason
                ? ` · ${agent.modelReason}`
                : " · Uses the current agent connection"}
            </p>
          </>
          {agent.role !== "reviewer" && (
            <button
              type="button"
              className="secondary-button"
              disabled={plan.agents.length <= 2}
              onClick={() =>
                onChange({
                  ...plan,
                  agents: plan.agents.filter((a) => a.id !== agent.id),
                })
              }
            >
              Remove researcher
            </button>
          )}
        </article>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={plan.agents.length >= 5}
        onClick={() =>
          onChange({
            ...plan,
            agents: [
              ...plan.agents.slice(0, -1),
              {
                id: crypto.randomUUID(),
                name: "Additional researcher",
                assignment: "",
                role: "researcher",
              },
              plan.agents.at(-1)!,
            ],
          })
        }
      >
        Add researcher
      </button>
    </fieldset>
  );
}
