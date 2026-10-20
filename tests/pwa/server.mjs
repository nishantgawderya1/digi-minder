import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const workerFile = new URL("../../.output/public/sw.js", import.meta.url);
const upstreamPort = 4181;
const serverPort = 4180;
let stopping = false;
const upstream = spawn(process.execPath, [".output/server/index.mjs"], {
  cwd: root,
  windowsHide: true,
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(upstreamPort),
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(upstreamPort),
  },
});

// Nitro's production asset metadata is fixed at build time. These tests replace
// only sw.js to simulate a second deployment; serve that file with fresh headers
// so its old Content-Length/ETag cannot truncate or hide the new worker bytes.
// Every app page, API and other asset still comes from the real production app.
const server = createServer(async (incoming, outgoing) => {
  const pathname = new URL(incoming.url || "/", "http://127.0.0.1").pathname;
  if (
    pathname === "/sw.js" &&
    (incoming.method === "GET" || incoming.method === "HEAD")
  ) {
    try {
      const body = await readFile(workerFile);
      outgoing.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      });
      outgoing.end(incoming.method === "HEAD" ? undefined : body);
    } catch {
      outgoing.writeHead(503).end("Test worker is unavailable");
    }
    return;
  }

  const forwarded = request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    },
  );
  forwarded.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end("Production test server is unavailable");
  });
  incoming.on("aborted", () => forwarded.destroy());
  incoming.pipe(forwarded);
});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  server.close();
  upstream.kill();
  process.exitCode = code;
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
process.once("exit", () => upstream.kill());
upstream.once("error", () => stop(1));
upstream.once("exit", (code) => {
  if (!stopping) stop(code || 1);
});

for (let attempt = 0; attempt < 150 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${upstreamPort}/`, {
      signal: AbortSignal.timeout(1000),
    });
    await response.body?.cancel();
    if (response.ok) {
      server.listen(serverPort, "127.0.0.1", () => {
        console.log(`PWA production tests: http://127.0.0.1:${serverPort}`);
      });
      break;
    }
  } catch {
    // Wait for the production app to bind its port before exposing the proxy.
  }
  if (attempt === 149) stop(1);
  else await setTimeout(200);
}
