import van from "vanjs-core";
import "@fontsource-variable/commissioner/wght.css";
import "@fontsource-variable/stix-two-text/wght-italic.css";
import "./styles.css";
import { App } from "./ui/app";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root element");
}

const app = App();

appRoot.replaceChildren();
van.add(appRoot, app);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
