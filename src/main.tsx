import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import HomePage from "./home/HomePage";
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

createRoot(document.getElementById("root")!).render(
  window.location.pathname === "/" ? (
    <HomePage />
  ) : (
    <Suspense fallback={<p role="status">Opening your notebook…</p>}>
      <App />
    </Suspense>
  ),
);
