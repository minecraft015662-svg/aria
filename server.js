const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", true);

const SECRET = process.env.LICENSE_SECRET;
if (!SECRET) { console.error("Set LICENSE_SECRET environment variable"); process.exit(1); }

const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
const toChars = (buf, n) => Array.from(buf.slice(0, n), b => CH[b % 32]).join("");
const sign = id => toChars(crypto.createHmac("sha256", SECRET).update(id).digest(), 8);

function makeKey() {
  const id = toChars(crypto.randomBytes(8), 8);
  const raw = id + sign(id);
  return raw.match(/.{4}/g).join("-");
}
function validKey(key) {
  if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key || "")) return false;
  const raw = key.replace(/-/g, "");
  const good = Buffer.from(sign(raw.slice(0, 8)));
  const got = Buffer.from(raw.slice(8));
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
const base = req => `https://${req.get("host")}`;

// simple rate limit: 10 new licenses per IP per hour
const hits = new Map();
app.post("/api/license", (req, res) => {
  const now = Date.now(), ip = req.ip;
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 10) return res.status(429).json({ error: "Too many requests. Try later." });
  list.push(now); hits.set(ip, list);
  const key = makeKey();
  res.json({ key, command: `curl -fsSL ${base(req)}/install.sh | sudo bash -s -- ${key}` });
});

app.get("/install.sh", (req, res) => {
  const s = fs.readFileSync(path.join(__dirname, "install.sh"), "utf8").replace("__BASE__", base(req));
  res.type("text/plain").send(s);
});

app.get("/download", (req, res) => {
  if (!validKey(req.query.key)) return res.status(403).send("Invalid license key");
  res.download(path.join(__dirname, "private", "theme.zip"), "theme.zip");
});

app.use(express.static(path.join(__dirname, "public")));
app.listen(process.env.PORT || 3000, () => console.log("Running"));
