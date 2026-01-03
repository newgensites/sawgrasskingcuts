const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data.json");
const DEFAULT_STATE = {
  bookings: {},
  overrides: {},
  queue: [],
  gallery: [],
};

function loadState() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (err) {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function ensureDatabaseFile() {
  if (!fs.existsSync(DB_FILE)) {
    saveState(DEFAULT_STATE);
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath);
  switch (ext) {
    case ".html":
      return "text/html";
    case ".css":
      return "text/css";
    case ".js":
      return "application/javascript";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function sendJSON(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function handleAPI(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJSON(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const state = loadState();
    sendJSON(res, 200, state);
    return true;
  }

  if (url.pathname.startsWith("/api/state/") && req.method === "POST") {
    const key = url.pathname.replace("/api/state/", "");
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_STATE, key)) {
      sendJSON(res, 400, { error: "Invalid state key" });
      return true;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const state = loadState();
        state[key] = parsed.data ?? DEFAULT_STATE[key];
        saveState(state);
        sendJSON(res, 200, { ok: true });
      } catch (err) {
        sendJSON(res, 400, { error: "Invalid JSON" });
      }
    });
    return true;
  }

  return false;
}

function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(__dirname, url.pathname.split("?")[0]);

  if (url.pathname === "/") {
    filePath = path.join(__dirname, "index.html");
  }

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    res.end(data);
  });
}

function start() {
  ensureDatabaseFile();

  const server = http.createServer((req, res) => {
    if (handleAPI(req, res)) return;
    handleStatic(req, res);
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
