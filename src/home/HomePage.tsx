import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { NotebookCreateDialog } from "../components/NotebookCreateDialog";
import { ProductPreview } from "./ProductPreview";
import "./home.css";

export default function HomePage() {
  const [createOpen, setCreateOpen] = useState(false);

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
          NemoDoc
        </a>
        <nav id="home-nav" aria-label="Main navigation">
          <a
            href="https://github.com/Agneypraseed/NemoDoc"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowRight size={12} className="home-external-arrow" />
          </a>
        </nav>
      </header>
      <main id="home-main">
        <section className="home-hero">
          <h1>Your personal notebook</h1>
          <div className="home-hero-actions">
            <a className="home-secondary-link" href="/notebooks">
              All notebooks
            </a>
            <button
              className="home-primary-link"
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              Create a notebook <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <ProductPreview />
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
                "Yes. Agents use the notebook connection or tested OpenAI-compatible model profiles. Research plans can assign different profiles and task-specific Markdown instructions to each agent.",
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
          NemoDoc
        </a>
        <a
          href="https://github.com/Agneypraseed/NemoDoc"
          target="_blank"
          rel="noreferrer"
        >
          Source code <ArrowRight size={13} />
        </a>
      </footer>
      {createOpen && (
        <NotebookCreateDialog
          className="home-create-modal"
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
