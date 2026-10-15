import { selectAll } from "../utils/dom.js";

export const initTabs = () => {
	for (const root of selectAll("[data-tabs]")) {
		const tabs = selectAll('[role="tab"]', root);
		if (!tabs.length) continue;

		const panels = tabs.map((tab) =>
			document.getElementById(tab.getAttribute("aria-controls")),
		);
		if (panels.some((panel) => !panel)) continue;

		const activate = (index, moveFocus = false) => {
			tabs.forEach((tab, tabIndex) => {
				const selected = tabIndex === index;
				tab.setAttribute("aria-selected", String(selected));
				tab.tabIndex = selected ? 0 : -1;
				panels[tabIndex].hidden = !selected;
			});
			if (moveFocus) tabs[index].focus();
		};

		tabs.forEach((tab, index) => {
			tab.addEventListener("click", () => activate(index));
			tab.addEventListener("keydown", (event) => {
				const keys = {
					ArrowRight: index + 1,
					ArrowLeft: index - 1,
					Home: 0,
					End: tabs.length - 1,
				};
				if (!(event.key in keys)) return;
				event.preventDefault();
				activate((keys[event.key] + tabs.length) % tabs.length, true);
			});
		});

		const selectedIndex = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
		activate(selectedIndex >= 0 ? selectedIndex : 0);
	}
};
