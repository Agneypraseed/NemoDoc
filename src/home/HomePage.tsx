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
    title: "Read and annotate",
    text: "Highlight text, add notes, draw and bookmark pages.",
    tag: "READ & ANNOTATE",
  },
  {
    icon: Quote,
    title: "Ask about your sources",
    text: "Ask about a passage or notebook. Open citations in the source.",
    tag: "GROUNDED ANSWERS",
  },
  {
    icon: Layers,
    title: "Study tools",
    text: "Create flashcards, quizzes, guides and mind maps from selected sources.",
    tag: "STUDY STUDIO",
  },
  {
    icon: Workflow,
    title: "Research tasks",
    text: "Assign research, review results and schedule tasks.",
    tag: "AGENTS, WITH CONTROL",
  },
  {
    icon: Sparkles,
    title: "Agent settings",
    text: "Choose models and write instructions for each agent.",
    tag: "MODELS & ROLES",
  },
  {
    icon: LockKeyhole,
    title: "Export and backup",
    text: "Export notes as Markdown. Back up and restore notebooks as ZIP files.",
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
          <h1>A notebook for your documents.</h1>
          <p>Read PDFs and slides, ask questions, and save notes.</p>
          <div className="home-hero-actions">
            <a className="home-primary-link" href="/app">
              Open your notebook <ArrowRight size={17} />
            </a>
            <a className="home-secondary-link" href="#explore">
              Preview <ArrowDown size={15} />
            </a>
          </div>
          <span className="home-hero-note">
            <LockKeyhole size={12} /> Reading and notes work without an account.
          </span>
        </section>
        <ProductPreview />
        <section
          className="home-how home-section"
          id="how-it-works"
          aria-labelledby="home-how-title"
        >
          <div className="home-section-heading">
            <div>
              <h2 id="home-how-title">Get started</h2>
            </div>
          </div>
          <div className="home-steps">
            {[
              {
                title: "Add documents",
                text: "Upload PDFs or lecture slides.",
              },
              {
                title: "Read and annotate",
                text: "Select text to highlight, annotate or ask a question.",
              },
              {
                title: "Save notes",
                text: "Save answers and create study material.",
              },
            ].map((item, index) => (
              <article key={item.title}>
                <span className="home-step-number">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="home-how-foot">Notebooks are stored in this browser.</p>
        </section>
        <section
          className="home-features home-section"
          id="features"
          aria-labelledby="home-features-title"
        >
          <div className="home-section-heading">
            <div>
              <h2 id="home-features-title">Features</h2>
            </div>
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
            <h2>Storage and sharing</h2>
            <p>
              Reading and annotation work without AI credentials. When you
              connect a hosted model, relevant text or selected page images are
              sent to that provider. You choose what to share with your agents.
            </p>
          </div>
          <a href="/app">
            Open notebook <ArrowRight size={16} />
          </a>
        </section>
        <section
          className="home-faq home-section"
          aria-labelledby="home-faq-title"
        >
          <div>
            <h2 id="home-faq-title">FAQ</h2>
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
      </main>
      <footer className="home-footer">
        <a className="home-logo" href="/" aria-label="NemoDoc home">
          <span className="home-logomark" aria-hidden="true">
            N
          </span>
          NemoDoc<span className="home-logo-period">.</span>
        </a>
        <span>PDFs, notes and source-linked answers.</span>
        <a
          href="https://github.com/Agneypraseed/NemoDoc"
          target="_blank"
          rel="noreferrer"
        >
          Source code <ArrowRight size={13} />
        </a>
      </footer>
    </div>
  );
}
