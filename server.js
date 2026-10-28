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

// Simple JSON Database for Licenses
const DB_FILE = path.join(__dirname, 'licenses.json');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getLicenses() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveLicenses(licenses) {
    fs.writeFileSync(DB_FILE, JSON.stringify(licenses, null, 2));
}

// Admin Credentials Config (Environment Variable or Default)
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// 1. Verify License Endpoint
app.get('/api/verify-license', (req, res) => {
    const key = req.query.key;
    const licenses = getLicenses();
    const found = licenses.find(l => l.key === key && l.active);

    if (found) {
        return res.json({ valid: true, message: "License Verified Successfully!" });
    } else {
        return res.status(403).json({ valid: false, message: "Invalid or Expired License Key!" });
    }
});

// 2. Download Theme Endpoint
app.get('/api/download-theme', (req, res) => {
    const key = req.query.key;
    const licenses = getLicenses();
    const found = licenses.find(l => l.key === key && l.active);

    if (!found) {
        return res.status(403).send("Unauthorized");
    }

    const themePath = path.join(__dirname, 'themes', 'arix.zip');
    if (fs.existsSync(themePath)) {
        res.download(themePath, 'arix.zip');
    } else {
        res.status(404).send("Theme File Not Found! Please place arix.zip in themes directory.");
    }
});

// 3. Admin API to Create License with ID & Password
app.post('/api/admin/create-license', (req, res) => {
    const { username, password, key } = req.body;
    
    // Validate Admin ID & Password
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({ error: "Invalid Admin Username or Password!" });
    }

    const licenses = getLicenses();
    const newKey = key || 'ARIX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    licenses.push({ key: newKey, active: true, createdAt: new Date() });
    saveLicenses(licenses);

    res.json({ success: true, licenseKey: newKey });
});

// 4. Serve Dynamic Shell Script
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