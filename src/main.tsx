import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import HomePage from "./home/HomePage";
import { NotebookLoading } from "./components/NotebookLoading";
import "./styles.css";
import "./upgrade.css";
import "./components/agent.css";
import "./chat-dock.css";
import "./appearance.css";
import "./reading-space.css";
import "./chat-rendering.css";
import "./settings.css";
import "./glass.css";

const App = lazy(() => import("./App"));
const NotebookLibraryPage = lazy(
  () => import("./components/NotebookLibraryPage"),
);
const libraryRequested =
  /^\/notebooks\/?$/.test(window.location.pathname) ||
  (window.location.pathname === "/app" &&
    new URLSearchParams(window.location.search).get("library") === "1");
if (libraryRequested && window.location.pathname !== "/notebooks")
  window.history.replaceState(window.history.state, "", "/notebooks");

createRoot(document.getElementById("root")!).render(
  window.location.pathname === "/" ? (
    <HomePage />
  ) : libraryRequested ? (
    <Suspense fallback={<p role="status">Loading notebooks…</p>}>
      <NotebookLibraryPage />
    </Suspense>
  ) : (
    <Suspense fallback={<NotebookLoading />}>
      <App />
    </Suspense>
  ),
);
