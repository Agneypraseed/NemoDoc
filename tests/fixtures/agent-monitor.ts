export const runtimeRoster = [
  {
    id: "nemodoc",
    identityName: "Study partner",
    identityEmoji: "📚",
    model: "nvidia/nemotron-study",
    isDefault: false,
    workspace: "/sandbox/private-path",
    apiKey: "never-return-this-field",
  },
  {
    id: "research",
    name: "Research scout",
    model: "nvidia/nemotron-research",
    isDefault: false,
  },
  {
    id: "main",
    name: "Coordinator",
    model: "nvidia/nemotron-main",
    isDefault: true,
  },
];
export const runtimeSessions = {
  hasMore: false,
  sessions: [
    {
      key: "agent:nemodoc:study",
      label: "Morning revision",
      status: "running",
      hasActiveRun: true,
      updatedAt: 1792231200000,
      model: "nvidia/nemotron-study",
      totalTokens: 1200,
      observerDigest: {
        headline: "Reading selected notes and checking citations",
        health: "on-track",
      },
    },
    {
      key: "agent:research:papers",
      label: "Compare research papers",
      status: "running",
      hasActiveRun: true,
      updatedAt: 1792231100000,
      observerDigest: {
        headline: "Waiting for your choice of papers",
        health: "waiting-on-user",
      },
    },
    {
      key: "agent:main:briefing",
      label: "Last briefing",
      status: "failed",
      hasActiveRun: false,
      updatedAt: 1792220000000,
      lastRunError: "private gateway diagnostic",
    },
  ],
};
export const runtimeReader = async (args: string[]) =>
  JSON.stringify(args.includes("agents") ? runtimeRoster : runtimeSessions);
