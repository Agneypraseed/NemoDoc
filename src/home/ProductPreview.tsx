import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  FileText,
  Highlighter,
  Layers,
  LockKeyhole,
  MessageSquare,
  Plus,
  Pause,
  Play,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { AgentWorkScene } from "../components/AgentWorkScene";
import type { AgentActivityStatus } from "../agent-monitor-types";
type PreviewMode = "read" | "ask" | "study" | "agents";
const modes = [
  { id: "read", label: "Read & annotate", icon: BookOpen },
  { id: "ask", label: "Chat", icon: MessageSquare },
  { id: "study", label: "Study tools", icon: Layers },
  { id: "agents", label: "Agents", icon: Workflow },
] as const;
const agentSteps = [
  { label: "Selected notes are ready", status: "queued" },
  { label: "Reading selected notes", status: "running" },
  { label: "Drafting a revision summary", status: "running" },
  { label: "Ready for your review", status: "waiting" },
] satisfies { label: string; status: AgentActivityStatus }[];

export function ProductPreview() {
  const [mode, setMode] = useState<PreviewMode>("read");
  const [highlighted, setHighlighted] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [sourcePage, setSourcePage] = useState<2 | 4>(2);
  const [motion, setMotion] = useState(true);
  const [step, setStep] = useState(0);
  return (
    <section
      className="home-preview-section"
      id="explore"
      aria-label="Interactive product preview"
    >
      <div
        className="home-preview-controls"
        role="group"
        aria-label="Explore NemoDoc features"
      >
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="home-product-window">
        <div className="home-product-toolbar">
          <span className="home-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            My reading notebook <ChevronRight size={12} /> The art of paying
            attention
          </span>
          <span className="home-example-label">Interactive example</span>
        </div>
        <div className="home-product-body">
          <aside
            className="home-product-sidebar"
            aria-label="Example notebook sources"
          >
            <div className="home-mini-brand">
              N<span> / </span> My workspace
            </div>
            <span className="home-mini-label">SOURCES</span>
            <div className="home-demo-source">
              <FileText size={16} />
              <span>
                The art of paying
                <br />
                attention.pdf
              </span>
              <Check size={12} />
            </div>
            <div className="home-demo-muted">
              <Plus size={13} /> Your next good read
            </div>
            <div className="home-sidebar-notes">
              <Bookmark size={14} />
              <span>Ideas worth keeping</span>
            </div>
            <div className="home-mini-note">
              “Understanding starts when you slow down enough to notice.”
              <span>My notes · Page 02</span>
            </div>
            <div className="home-sidebar-foot">
              <LockKeyhole size={12} /> A little space of your own
            </div>
          </aside>
          <div className="home-demo-reader">
            <div className="home-reader-bar">
              <span>
                <FileText size={13} /> The art of paying attention
              </span>
              <span>
                <Search size={13} />
                <BookOpen size={13} />
              </span>
            </div>
            <article className="home-demo-paper" aria-label="Example document">
              <div className="home-paper-overline">
                FIELD NOTES{" "}
                <span> / {String(sourcePage).padStart(2, "0")}</span>
              </div>
              <h2>
                {sourcePage === 4 ? (
                  "Keep the context."
                ) : (
                  <>
                    The art of
                    <br />
                    paying attention.
                  </>
                )}
              </h2>
              <p className="home-paper-deck">
                On reading slowly, and taking something with you.
              </p>
              <div className="home-paper-illustration" aria-hidden="true">
                <div />
                <div />
                <div />
                <span />
              </div>
              <h3>A little room to think</h3>
              <p>
                Some ideas need more than a quick glance. They need a pause, a
                question, a connection to something you already know.
              </p>
              <p>
                <mark className={highlighted ? "is-highlighted" : ""}>
                  A useful note keeps the thought and the context that gave it
                  meaning.
                </mark>{" "}
                Come back to the source. See what you notice the second time.
              </p>
              <div className="home-paper-footer">
                <span>NEMODOC FIELD NOTES</span>
                <span>{String(sourcePage).padStart(2, "0")}</span>
              </div>
            </article>
          </div>
          <aside className="home-demo-panel" aria-label="Example feature panel">
            <div className="home-panel-heading">
              <span>
                {mode === "read"
                  ? "In the margins"
                  : mode === "ask"
                    ? "A good question"
                    : mode === "study"
                      ? "Your study space"
                      : "Your study partner"}
              </span>
              <span className="home-panel-dot" />
            </div>
            {mode === "read" && (
              <div className="home-demo-content">
                <span className="home-demo-kicker">
                  <Quote size={14} /> A thought worth keeping
                </span>
                <blockquote>
                  “A useful note keeps the thought and the context that gave it
                  meaning.”
                </blockquote>
                <p>
                  Highlight a passage, add your own words, and keep a path back
                  to the page.
                </p>
                <button
                  className="home-demo-button"
                  type="button"
                  aria-pressed={highlighted}
                  onClick={() => setHighlighted((value) => !value)}
                >
                  <Highlighter size={14} />
                  {highlighted ? "Remove highlight" : "Highlight passage"}
                </button>
                <span className="home-demo-page">
                  Linked to page {String(sourcePage).padStart(2, "0")}
                </span>
              </div>
            )}
            {mode === "ask" && (
              <div className="home-demo-content">
                <div className="home-demo-question">
                  Why keep a note’s original context?
                </div>
                <span className="home-demo-kicker">
                  <Sparkles size={14} /> An answer you can revisit
                </span>
                <p>
                  Context gives you a way to check your interpretation. Keeping
                  the original passage and page lets you trace a thought back to
                  the source.
                </p>
                <button
                  type="button"
                  className="home-demo-citation"
                  onClick={() => {
                    setSourcePage(4);
                    setHighlighted(true);
                    setMode("read");
                  }}
                >
                  The art of paying attention · p. 04 <ArrowRight size={12} />
                </button>
                <span className="home-demo-page">
                  Example answer · Try the source link
                </span>
              </div>
            )}
            {mode === "study" && (
              <div className="home-demo-content">
                <span className="home-demo-kicker">
                  <Layers size={14} /> Flashcard 01 / 08
                </span>
                <div className="home-demo-flashcard">
                  <span>{revealed ? "THE ANSWER" : "A LITTLE RECALL"}</span>
                  <h3>
                    {revealed
                      ? "It makes the idea traceable."
                      : "Why does context make a note more useful?"}
                  </h3>
                  {revealed && (
                    <p>
                      You can return to the original passage, check the
                      interpretation, and build on it.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="home-demo-button"
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? "Show question" : "Reveal answer"}
                  <ArrowRight size={14} />
                </button>
                <span className="home-demo-page">
                  Also in Studio: quizzes, guides & mind maps
                </span>
              </div>
            )}
            {mode === "agents" && (
              <div className="home-demo-content home-agent-demo">
                <span className="home-demo-kicker">
                  <ShieldCheck size={14} /> You choose what’s shared
                </span>
                <AgentWorkScene
                  name="Example study partner"
                  status={agentSteps[step].status}
                  motion={motion}
                />
                <button
                  type="button"
                  className="home-demo-motion"
                  aria-label="Preview animations"
                  aria-pressed={motion}
                  onClick={() => setMotion((value) => !value)}
                >
                  {motion ? <Pause size={12} /> : <Play size={12} />}
                  {motion ? "Pause motion" : "Play motion"}
                </button>
                <p className="home-agent-step" role="status">
                  {agentSteps[step].label}
                </p>
                <button
                  type="button"
                  className="home-demo-button"
                  onClick={() =>
                    setStep((value) => (value + 1) % agentSteps.length)
                  }
                >
                  {step === 0
                    ? "Preview a workflow"
                    : step === 3
                      ? "Restart preview"
                      : "Next step"}
                  <ArrowRight size={14} />
                </button>
                <span className="home-demo-page">
                  Illustration only · No agent or email is started
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
