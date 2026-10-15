export function select(selector, root = document) {
	return root.querySelector(selector);
}

export function selectAll(selector, root = document) {
	return [...root.querySelectorAll(selector)];
}
