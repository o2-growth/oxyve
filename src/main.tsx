import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "@/lib/sentry";

// Sprint 3 — DEC-006: inicializa Sentry antes do mount.
// No-op se VITE_SENTRY_DSN não estiver configurado.
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
