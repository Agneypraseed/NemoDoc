import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./upgrade.css";
import "./components/agent.css";
import "./chat-dock.css";
import "./appearance.css";

createRoot(document.getElementById("root")!).render(<App />);
