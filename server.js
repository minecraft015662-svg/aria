const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", true);
app.use(express.json());

const SECRET = process.env.LICENSE_SECRET;
const ADMIN = process.env.ADMIN_PASSWORD || "";
if (!SECRET) { console.error("Set LICENSE_SECRET environment variable"); process.exit(1); }

// ---- storage (JSON file). On Render, set DATA_DIR to a persistent disk path to keep data across restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "licenses.json");
let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));

// ---- keys: 8 random chars + 8 char HMAC signature
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const toChars = (buf, n) => Array.from(buf.slice(0, n), b => CH[b % 32]).join("");
const sign = id => toChars(crypto.createHmac("sha256", SECRET).update(id).digest(), 8);
function makeKey() {
  const id = toChars(crypto.randomBytes(8), 8);
  return (id + sign(id)).match(/.{4}/g).join("-");
}
function validKey(key) {
  if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key || "")) return false;
  const raw = key.replace(/-/g, "");
  const good = Buffer.from(sign(raw.slice(0, 8))), got = Buffer.from(raw.slice(8));
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
const base = req => `https://${req.get("host")}`;
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const isAdmin = req => ADMIN && crypto.timingSafeEqual(sha(req.get("x-admin-password") || ""), sha(ADMIN));
const adminOnly = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: "Wrong admin password" });

// ---- create license (10 per IP per hour)
const hits = new Map();
app.post("/api/license", (req, res) => {
  const now = Date.now(), ip = req.ip;
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 10) return res.status(429).json({ error: "Too many requests. Try later." });
  list.push(now); hits.set(ip, list);
  const key = makeKey();
  db[key] = { created: new Date().toISOString(), revoked: false, downloads: 0 };
  save();
  res.json({ key });
});

// ---- check license
app.get("/api/license/:key", (req, res) => {
  const key = req.params.key.toUpperCase();
  if (!validKey(key)) return res.json({ status: "invalid" });
  const r = db[key];
  res.json({ status: r && r.revoked ? "revoked" : "active", created: r && r.created, downloads: r ? r.downloads : 0 });
});

// ---- admin
app.get("/api/admin/licenses", adminOnly, (req, res) =>
  res.json(Object.entries(db).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.created.localeCompare(a.created))));
app.post("/api/admin/revoke", adminOnly, (req, res) => {
  const { key, revoked } = req.body || {};
  if (!db[key]) return res.status(404).json({ error: "Key not found" });
  db[key].revoked = !!revoked; save(); res.json({ ok: true });
});

// ---- script + download
app.get("/install.sh", (req, res) => {
  const s = fs.readFileSync(path.join(__dirname, "install.sh"), "utf8").split("__BASE__").join(base(req));
  res.type("text/plain").send(s);
});
app.get("/download", (req, res) => {
  const key = String(req.query.key || "").toUpperCase();
  if (!validKey(key)) return res.status(403).send("Invalid license key");
  if (db[key] && db[key].revoked) return res.status(403).send("License revoked");
  if (db[key]) { db[key].downloads++; save(); }
  res.download(path.join(__dirname, "private", "theme.zip"), "theme.zip");
});

app.use(express.static(path.join(__dirname, "public")));
app.listen(process.env.PORT || 3000, () => console.log("Running"));
