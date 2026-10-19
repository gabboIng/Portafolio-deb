import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/newsreader";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";

import { App } from "./App";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Falta #root en index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
