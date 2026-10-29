import "@fontsource-variable/geist";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/controls.css";
import "./styles/field.css";
import "./styles/chip.css";
import "./styles/tooltip.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
