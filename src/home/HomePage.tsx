import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Highlighter,
  Layers,
  LockKeyhole,
  Plus,
  Quote,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { ProductPreview } from "./ProductPreview";
import "./home.css";

const features = [
  {
    icon: Highlighter,
    title: "Leave your mark.",
    text: "Highlight, underline, draw, and bookmark. Read PDFs and lecture slides in the layout that feels right to you.",
    tag: "READ & ANNOTATE",
  },
  {
    icon: Quote,
    title: "Follow the thread.",
    text: "Ask about a passage or your whole notebook. Follow citations back to the source and inspect the supporting excerpts.",
    tag: "GROUNDED ANSWERS",
  },
  {
    icon: Layers,
    title: "Turn notes into knowing.",
    text: "Make flashcards, quizzes, study guides, and mind maps from your sources. Give good ideas another way to stick.",
    tag: "STUDY STUDIO",
  },
  {
    icon: Workflow,
    title: "A little help with the work.",
    text: "Share selected notes with an agent, plan revision or synthesize research, and review proposed actions before approval.",
    tag: "AGENTS, WITH CONTROL",
  },
  {
    icon: Sparkles,
    title: "Build your own team.",
    text: "Connect a NemoClaw runtime to manage agents, assign models and Markdown roles, and see what each one is doing.",
    tag: "MODELS & ROLES",
  },
  {
    icon: LockKeyhole,
    title: "Keep your work close.",
    text: "Notebooks stay in your browser. Export your notes as Markdown, or back up and restore your whole notebook as a ZIP.",
    tag: "LOCAL NOTEBOOKS",
  },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="home-page">
      <a className="home-skip" href="#home-main">
        Skip to content
      </a>
      <header className="home-header">
        <a className="home-logo" href="/" aria-label="NemoDoc home">
          <span className="home-logomark" aria-hidden="true">
            N
          </span>
          NemoDoc<span className="home-logo-period">.</span>
        </a>
        <button
          type="button"
          className="home-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="home-nav"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? (
            <X size={20} />
          ) : (
            <span>
              Menu <Plus size={15} />
            </span>
          )}
          <span className="home-visually-hidden">Toggle navigation</span>
        </button>
        <nav
          id="home-nav"
          className={menuOpen ? "is-open" : ""}
          aria-label="Main navigation"
        >
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Features
          </a>
          <a
            href="https://github.com/Agneypraseed/NemoDoc"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowRight size={12} className="home-external-arrow" />
          </a>
        </nav>
        <a className="home-nav-cta" href="/app">
          Open NemoDoc <ArrowRight size={14} />
        </a>
      </header>
      <main id="home-main">
        <section className="home-hero">
          <div className="home-hero-eyebrow">
            <span />A little space for deeper thinking
          </div>
          <h1>
            Less collecting.
            <br />
            More <em>understanding.</em>
          </h1>
          <p>
            Your PDFs, your questions, your next good idea.
            <br className="home-desktop-break" /> Read, connect the dots, and
            keep what matters — all in one notebook.
          </p>
          <div className="home-hero-actions">
            <a className="home-primary-link" href="/app">
              Open your notebook <ArrowRight size={17} />
            </a>
            <a className="home-secondary-link" href="#explore">
              Take a look inside <ArrowDown size={15} />
            </a>
          </div>
          <span className="home-hero-note">
            <LockKeyhole size={12} /> Start reading without an account. Connect
            AI when you’re ready.
          </span>
          <div className="home-hero-doodle" aria-hidden="true">
            <svg viewBox="0 0 130 95">
              <path d="M10 30q45-40 57 7t43 3m-2-14 10 16-18 5" />
              <path d="m8 65 18 6m-15 6 10-5" />
            </svg>
            <span>
              Make room
              <br />
              for the good stuff.
            </span>
          </div>
        </section>
        <ProductPreview />
        <section
          className="home-how home-section"
          id="how-it-works"
          aria-labelledby="home-how-title"
        >
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">From a document to an idea</span>
              <h2 id="home-how-title">Find your flow.</h2>
            </div>
            <p>
              A few simple steps.
              <br />A much better way to read.
            </p>
          </div>
          <div className="home-steps">
            {[
              {
                title: "Bring a good read.",
                text: "Add a PDF or lecture slides to your notebook. Your sources stay together, ready when you are.",
              },
              {
                title: "Stay curious.",
                text: "Select a word, a sentence, a passage. Highlight it, leave a note, or ask a question in context.",
              },
              {
                title: "Take something with you.",
                text: "Save useful answers, return to their sources, and turn what you’ve learned into study material.",
              },
            ].map((item, index) => (
              <article key={item.title}>
                <span className="home-step-number">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="home-how-foot">
            Pick up where you left off. Your notebook stays on this device.
          </p>
        </section>
        <section
          className="home-features home-section"
          id="features"
          aria-labelledby="home-features-title"
        >
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">Everything has its place</span>
              <h2 id="home-features-title">
                Made for the way
                <br />
                your mind works.
              </h2>
            </div>
            <p>
              A reader, a thinking partner, a study space.
              <br />
              One less place to lose a good idea.
            </p>
          </div>
          <div className="home-feature-grid">
            {features.map(({ icon: Icon, title, text, tag }) => (
              <article key={title}>
                <div className="home-feature-top">
                  <Icon size={22} strokeWidth={1.4} />
                  <span>{tag}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="home-privacy">
          <div className="home-privacy-icon">
            <ShieldCheck size={29} strokeWidth={1.3} />
          </div>
          <div>
            <h2>A notebook of your own.</h2>
            <p>
              Reading and annotation work without AI credentials. When you
              connect a hosted model, relevant text or selected page images are
              sent to that provider. You choose what to share with your agents.
            </p>
          </div>
          <a href="/app">
            Make yourself at home <ArrowRight size={16} />
          </a>
        </section>
        <section
          className="home-faq home-section"
          aria-labelledby="home-faq-title"
        >
          <div>
            <span className="home-eyebrow">A few things you might wonder</span>
            <h2 id="home-faq-title">Good questions.</h2>
          </div>
          <div className="home-faq-items">
            {[
              [
                "Do I need an account to get started?",
                "No. Open the notebook and start with the included sample, or add your own PDF. Reading, annotation, and local notes work without signing in.",
              ],
              [
                "How do the AI features work?",
                "Connect a supported model provider in Settings to use contextual answers and study tools. NemoDoc uses NVIDIA Nemotron by default. Hosted providers receive the context needed for your request; model access and costs depend on your provider.",
              ],
              [
                "Can I use different models for my agents?",
                "Yes. Agents can use the notebook connection or a separate tested model connection. With a configured NemoClaw/OpenClaw runtime, you can assign a primary model, ordered fallbacks, and Markdown role instructions to each agent.",
              ],
              [
                "Can an agent send me a revision summary?",
                "You can schedule tasks and configure delivery through your existing SMTP mailbox or a WhatsApp Business connection. Share selected sources and notes, configure your recipient, and review the delivery settings. These connections require setup; nothing is sent from this homepage.",
              ],
              [
                "How do I keep a copy of my work?",
                "Export your authored notes as Markdown, or download a ZIP backup of your notebook. Restore that backup to bring your documents, notes, and annotations into another browser. Device sync is not automatic.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={17} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="home-last-call">
          <span className="home-eyebrow">
            Your next good idea is in there somewhere
          </span>
          <h2>Give it a little room.</h2>
          <a className="home-primary-link" href="/app">
            Open your notebook <ArrowRight size={17} />
          </a>
          <p>Start with the sample. Make it your own.</p>
        </section>
      </main>
      <footer className="home-footer">
        <a className="home-logo" href="/" aria-label="NemoDoc home">
          <span className="home-logomark" aria-hidden="true">
            N
          </span>
          NemoDoc<span className="home-logo-period">.</span>
        </a>
        <span>A quiet space for your ideas.</span>
        <a
          href="https://github.com/Agneypraseed/NemoDoc"
          target="_blank"
          rel="noreferrer"
        >
          Explore the source <ArrowRight size={13} />
        </a>
      </footer>
    </div>
  );
}
