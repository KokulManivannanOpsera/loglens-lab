import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LogLensApp } from "./LogLensApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LogLensApp />
  </StrictMode>,
);
