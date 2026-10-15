import { initExampleModule } from "./app/example-module.js";
import { initTabs } from "./modules/tabs.js";
import { initReveal } from "./modules/reveal.js";

const initApp = () => {
	initExampleModule();
	initTabs();
	initReveal();
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
	initApp();
}
