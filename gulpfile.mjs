import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { series, watch } from "gulp";
import stylus from "stylus";
import nunjucks from "nunjucks";
import { minify } from "terser";

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, "src");
const output = path.join(root, "build");
const modules = ["js/settings.js", "js/utils/dom.js", "js/app/example-module.js", "js/app.js"];

const templateEnvironment = new nunjucks.Environment(
	new nunjucks.FileSystemLoader(source, { noCache: true }),
	{ autoescape: true, throwOnUndefined: true },
);
async function clean() {
	fs.rmSync(output, { recursive: true, force: true });
}

async function compile() {
	fs.mkdirSync(path.join(output, "js"), { recursive: true });
	fs.mkdirSync(path.join(output, "css"), { recursive: true });

	const siteData = JSON.parse(fs.readFileSync(path.join(source, "data.json"), "utf8"));
	const pagesRoot = path.join(source, "pages");

	function findPageTemplates(directory) {
		return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) return findPageTemplates(entryPath);
			return entry.isFile() && entry.name.endsWith(".njk") ? [entryPath] : [];
		});
	}

	for (const templatePath of findPageTemplates(pagesRoot)) {
		const relativeTemplate = path.relative(pagesRoot, templatePath);
		const pageDataPath = templatePath.replace(/\.njk$/, ".json");
		const pageData = fs.existsSync(pageDataPath)
			? JSON.parse(fs.readFileSync(pageDataPath, "utf8"))
			: {};
		const context = { ...siteData, ...pageData };
		const templateName = path.relative(source, templatePath).split(path.sep).join("/");
		const html = templateEnvironment.render(templateName, context);
		const relativeOutput = relativeTemplate.replace(/\.njk$/, ".html");
		const outputPath =
			relativeOutput === "index.html"
				? path.join(output, "index.html")
				: path.join(output, "pages", relativeOutput);

		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, html);
	}

	const stylesheetPath = path.join(source, "styles/styles.styl");
	const renderStylesheet = (compress) =>
		new Promise((resolve, reject) => {
			stylus(fs.readFileSync(stylesheetPath, "utf8"))
				.set("filename", stylesheetPath)
				.set("compress", compress)
				.render((error, css) => (error ? reject(error) : resolve(css)));
		});

	const stylesheet = await renderStylesheet(false);
	fs.writeFileSync(path.join(output, "css/style.css"), stylesheet);

	const minifiedStylesheet = await renderStylesheet(true);
	fs.writeFileSync(path.join(output, "css/style.min.css"), minifiedStylesheet);

	const script = modules
		.map((file) => "\n/* " + file + " */\n" + fs.readFileSync(path.join(source, file), "utf8"))
		.join("\n");
	fs.writeFileSync(path.join(output, "js/app.js"), script);

	const bundle = await minify(script, {
		compress: true,
		mangle: true,
		format: { comments: false },
	});
	fs.writeFileSync(path.join(output, "js/app.min.js"), bundle.code);

	for (const folder of ["assets", "fonts"]) {
		const from = path.join(source, folder);
		if (fs.existsSync(from)) fs.cpSync(from, path.join(output, folder), { recursive: true });
	}
	const favicon = path.join(source, "favicon.svg");
	if (fs.existsSync(favicon)) fs.copyFileSync(favicon, path.join(output, "favicon.svg"));
}

export const build = series(clean, compile);

function runTask(task) {
	return new Promise((resolve, reject) => {
		task((error) => (error ? reject(error) : resolve()));
	});
}

function openBrowser(url) {
	if (process.env.BROWSER === "none") return;

	const [command, args] =
		process.platform === "win32"
			? ["cmd.exe", ["/c", "start", "", url]]
			: process.platform === "darwin"
				? ["open", [url]]
				: ["xdg-open", [url]];
	const browser = spawn(command, args, {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	browser.on("error", (error) => {
		console.warn("Не удалось автоматически открыть браузер:", error.message);
		console.log("Открой адрес вручную:", url);
	});
	browser.unref();
}

async function listenOnAvailablePort(server, port) {
	return new Promise((resolve, reject) => {
		const onListening = () => {
			cleanup();
			resolve(server.address().port);
		};
		const onError = (error) => {
			cleanup();
			if (error.code === "EADDRINUSE" && port !== 0) {
				console.warn("Порт " + port + " занят — выбираю свободный порт.");
				listenOnAvailablePort(server, 0).then(resolve, reject);
				return;
			}
			reject(error);
		};
		const cleanup = () => {
			server.off("listening", onListening);
			server.off("error", onError);
		};

		server.once("listening", onListening);
		server.once("error", onError);
		server.listen(port, "127.0.0.1");
	});
}

async function serveBuild() {
	const clients = new Set();
	const mimeTypes = {
		".css": "text/css; charset=utf-8",
		".html": "text/html; charset=utf-8",
		".ico": "image/x-icon",
		".js": "text/javascript; charset=utf-8",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".svg": "image/svg+xml",
		".webp": "image/webp",
		".woff": "font/woff",
		".woff2": "font/woff2",
	};

	const server = http.createServer((request, response) => {
		let pathname;
		try {
			pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
		} catch {
			response.writeHead(400).end("Bad request");
			return;
		}

		if (pathname === "/__live-reload") {
			response.writeHead(200, {
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"Content-Type": "text/event-stream; charset=utf-8",
			});
			response.write("retry: 1000\n\n");
			clients.add(response);
			request.on("close", () => clients.delete(response));
			return;
		}

		if (pathname === "/__live-reload.js") {
			response.writeHead(200, {
				"Cache-Control": "no-store",
				"Content-Type": "text/javascript; charset=utf-8",
			});
			response.end("new EventSource('/__live-reload').onmessage=()=>location.reload();");
			return;
		}

		const relativePath = pathname.replace(/^[/\\]+/, "") || "index.html";
		const target = path.resolve(output, relativePath);
		const relativeTarget = path.relative(output, target);
		if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
			response.writeHead(403).end("Forbidden");
			return;
		}

		fs.readFile(target, (error, contents) => {
			if (error) {
				response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
				return;
			}

			const extension = path.extname(target).toLowerCase();
			response.writeHead(200, {
				"Cache-Control": "no-store",
				"Content-Type": mimeTypes[extension] || "application/octet-stream",
			});
			if (extension === ".html") {
				const html = contents
					.toString("utf8")
					.replace(/<\/body>/i, '<script src="/__live-reload.js"></script></body>');
				response.end(html);
			} else {
				response.end(contents);
			}
		});
	});

	const requestedPort = Number(process.env.PORT || 4174);
	if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
		throw new Error("PORT должен быть числом от 0 до 65535.");
	}

	let actualPort;
	try {
		actualPort = await listenOnAvailablePort(server, requestedPort);
	} catch (error) {
		console.error("Ошибка локального сервера:", error.message);
		process.exitCode = 1;
		return;
	}

	server.on("error", (error) => console.error("Ошибка локального сервера:", error.message));

	const url = "http://127.0.0.1:" + actualPort;
	console.log("Локальный сервер:", url);
	console.log("Слежу за изменениями в src/; остановка — Ctrl+C.");
	openBrowser(url);
	let rebuildInProgress = false;
	let rebuildRequested = false;

	async function rebuildAndReload() {
		if (rebuildInProgress) {
			rebuildRequested = true;
			return;
		}

		rebuildInProgress = true;
		try {
			do {
				rebuildRequested = false;
				await runTask(build);
			} while (rebuildRequested);

			for (const client of clients) client.write("data: reload\n\n");
			console.log("Изменения собраны — страница обновлена.");
		} catch (error) {
			console.error("Ошибка сборки:", error);
		} finally {
			rebuildInProgress = false;
		}
	}
	const watcher = watch("src/**/*", { ignoreInitial: true }, rebuildAndReload);
	watcher.on("error", (error) => console.error("Ошибка отслеживания файлов:", error));
}

export async function start() {
	await runTask(build);
	await serveBuild();
}
