const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'licenses.json');
const API_KEYS_FILE = path.join(__dirname, 'apikeys.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
if (!fs.existsSync(API_KEYS_FILE)) fs.writeFileSync(API_KEYS_FILE, JSON.stringify([]));

function getLicenses() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveLicenses(licenses) {
    fs.writeFileSync(DB_FILE, JSON.stringify(licenses, null, 2));
}

function getApiKeys() {
    return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
}
function saveApiKeys(keys) {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// 1. Verify License with Expiry Check
app.get('/api/verify-license', (req, res) => {
    const key = req.query.key;
    const licenses = getLicenses();
    const found = licenses.find(l => l.key === key);

    if (!found) {
        return.json({ valid: false, message: "License key not found!" });
    }

    // Check if expired
    if (found.expiresAt && new Date() > new Date(found.expiresAt)) {
        return.json({ valid: false, message: "License key has expired!" });
    }

    if (found.active) {
        return res.json({ valid: true, message: "License Verified Successfully!" });
    } else {
        return res.json({ valid: false, message: "License is disabled!" });
    }
});

// 2. Download Theme Endpoint
app.get('/api/download-theme', (req, res) => {
    const key = req.query.key;
    const licenses = getLicenses();
    const found = licenses.find(l => l.key === key && l.active);

    if (!found || (found.expiresAt && new Date() > new Date(found.expiresAt))) {
        return res.status(403).send("Unauthorized or Expired License");
    }

    const themePath = path.join(__dirname, 'themes', 'arix.zip');
    if (fs.existsSync(themePath)) {
        res.download(themePath, 'arix.zip');
    } else {
        res.status(404).send("Theme File Not Found!");
    }
});

// 3. Admin API: Create License with Expiry Duration
app.post('/api/admin/create-license', (req, res) => {
    const { username, password, key, durationDays } = req.body;
    
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({ error: "Invalid Admin Credentials!" });
    }

    const licenses = getLicenses();
    const newKey = key || 'ARIX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    let expiresAt = null;
    if (durationDays && durationDays !== "lifetime") {
        const days = parseInt(durationDays);
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + days);
        expiresAt = expDate.toISOString();
    }

    licenses.push({ key: newKey, active: true, expiresAt: expiresAt, createdAt: new Date() });
    saveLicenses(licenses);

    res.json({ success: true, licenseKey: newKey, expiresAt: expiresAt || "Lifetime" });
});

// 4. Admin API: Generate Bot Hosting API Key
app.post('/api/admin/create-apikey', (req, res) => {
    const { username, password, botName } = req.body;

    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({ error: "Invalid Admin Credentials!" });
    }

    const apiKeys = getApiKeys();
    const apiKey = 'BOTAPI-' + Math.random().toString(36).substring(2, 15).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    apiKeys.push({ botName: botName || "My Bot", apiKey: apiKey, createdAt: new Date() });
    saveApiKeys(apiKeys);

    res.json({ success: true, apiKey: apiKey });
});

// 5. Bot API Endpoint for hosting integration
app.get('/api/bot/verify', (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.apikey;
    const apiKeys = getApiKeys();
    const found = apiKeys.find(k => k.apiKey === apiKey);

    if (found) {
        return res.json({ status: "online", botName: found.botName, message: "Bot API Authenticated Successfully!" });
    } else {
        return res.status(403).json({ status: "error", message: "Invalid Bot API Key!" });
    }
});

// Serve Shell Script
app.get('/install.sh', (req, res) => {
    const host = req.protocol + '://' + req.get('host');
    let scriptContent = fs.readFileSync(path.join(__dirname, 'public', 'script.sh'), 'utf8');
    scriptContent = scriptContent.replace(/{{HOST_URL}}/g, host);
    res.setHeader('Content-Type', 'text/x-shellscript');
    res.send(scriptContent);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});