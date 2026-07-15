const { spawn } = require('child_process');
const https = require('https');
const { readFileSync, existsSync } = require('fs');

const envPath = __dirname + '/.env';
if (!process.env.VERCEL_TOKEN && existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*VERCEL_TOKEN\s*=\s*(.+)\s*$/);
    if (m) { process.env.VERCEL_TOKEN = m[1].trim(); break; }
  }
}

const CLOUDFLARED_PATH = process.env.CLOUDFLARED_PATH || 'cloudflared.exe';
const TUNNEL_URL = process.env.TUNNEL_URL || 'http://localhost:5001';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const VERCEL_DEPLOY_HOOK = process.env.VERCEL_DEPLOY_HOOK;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60000');

let currentUrl = null;

function fetchJson(url, options) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function testTunnelUrl(url) {
  try {
    const u = new URL(url);
    return new Promise((resolve) => {
      const req = https.get(`${url}/health`, { timeout: 10000 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  } catch { return false; }
}

async function updateVercelEnv(newUrl) {
  if (!VERCEL_TOKEN) { console.log('[watcher] No VERCEL_TOKEN set, skipping Vercel update'); return false; }
  if (!VERCEL_PROJECT_ID) { console.log('[watcher] No VERCEL_PROJECT_ID set, skipping Vercel update'); return false; }
  const baseUrl = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}`;

  const headers = {
    Authorization: `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const fullApiUrl = `${newUrl}/api`;
  if (fullApiUrl === process.env._lastSetUrl) {
    console.log('[watcher] VITE_API_BASE_URL already up to date');
    return true;
  }

  try {
    const listRes = await fetchJson(`${baseUrl}/env`, { headers });
    const prod = (listRes.data?.envs || []).find(
      (e) => e.key === 'VITE_API_BASE_URL' && e.target?.includes?.('production')
    );
    if (!prod) {
      console.log('[watcher] Could not find production VITE_API_BASE_URL env var');
      return false;
    }

    const patchUrl = VERCEL_TEAM_ID
      ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${prod.id}?teamId=${VERCEL_TEAM_ID}`
      : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${prod.id}`;

    const patchRes = await fetchJson(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ value: fullApiUrl, type: 'sensitive' }),
    });
    if (patchRes.status >= 400) {
      console.log(`[watcher] Failed to update env var: ${patchRes.status} ${JSON.stringify(patchRes.data)}`);
      return false;
    }

    process.env._lastSetUrl = fullApiUrl;
    console.log(`[watcher] VITE_API_BASE_URL updated to ${fullApiUrl}`);

    if (VERCEL_DEPLOY_HOOK) {
      const hookRes = await fetchJson(VERCEL_DEPLOY_HOOK, { method: 'POST' });
      console.log(`[watcher] Deploy hook triggered: ${hookRes.status}`);
    } else {
      console.log('[watcher] No VERCEL_DEPLOY_HOOK set, skipping deploy trigger');
      console.log('[watcher] Create one at https://vercel.com/jeffs-projects/lend-pro/settings/git');
    }
    return true;
  } catch (err) {
    console.log(`[watcher] Vercel update error: ${err.message}`);
    return false;
  }
}

async function checkTunnel() {
  const testUrl = currentUrl;
  if (!testUrl) return;
  const alive = await testTunnelUrl(testUrl);
  if (alive) {
    const full = `${testUrl}/api`;
    if (VERCEL_TOKEN && full !== process.env._lastVerified) {
      process.env._lastVerified = full;
      await updateVercelEnv(testUrl);
    }
  } else {
    console.log(`[watcher] Tunnel ${testUrl} appears down, waiting for new URL from cloudflared...`);
  }
}

function start() {
  console.log(`[watcher] Starting cloudflared tunnel to ${TUNNEL_URL}`);
  const child = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', TUNNEL_URL], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  function stripAnsi(s) { return s.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\([A-Z])/g, ''); }

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    const text = stripAnsi(data.toString());
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const newUrl = match[0].replace(/\/+$/, '');
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        console.log(`[watcher] Detected tunnel URL: ${currentUrl}`);
        updateVercelEnv(currentUrl);
      }
    }
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    const text = stripAnsi(data.toString());
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const newUrl = match[0].replace(/\/+$/, '');
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        console.log(`[watcher] Detected tunnel URL: ${currentUrl}`);
        updateVercelEnv(currentUrl);
      }
    }
  });

  child.on('exit', (code) => {
    console.log(`[watcher] cloudflared exited with code ${code}, restarting in 3s...`);
    setTimeout(start, 3000);
  });
}

setInterval(checkTunnel, CHECK_INTERVAL);
start();
