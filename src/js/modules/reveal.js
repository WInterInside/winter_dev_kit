import { SETTINGS } from "../settings.js";
import { selectAll } from "../utils/dom.js";

export const initReveal = () => {
	const elements = selectAll("[data-reveal]");
	if (!elements.length) return;

	if (
		!("IntersectionObserver" in window) ||
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	) {
		elements.forEach((element) => element.classList.add("is-visible"));
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add("is-visible");
				observer.unobserve(entry.target);
			});
		},
		{ threshold: SETTINGS.revealThreshold, rootMargin: SETTINGS.revealRootMargin },
	);

	elements.forEach((element) => observer.observe(element));
};
