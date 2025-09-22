const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
// Allow configuring CORS origins via env (comma-separated); default to localhost
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : 'http://localhost:3000';
app.use(cors({ origin: corsOrigin }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const { encryptData, decryptData } = require('./fhe-demo');
const { encryptWithRelayer, decryptWithRelayer, getRelayerStatus, ensureRelayer } = require('./fhe-relayer');
const wantsRelayer = (req) => {
  const { available } = getRelayerStatus();
  if (!available) return false;
  if (String(req.headers['x-relayer'] || '') !== '1') return false;
  const pub = req.headers['x-public-key'];
  const prv = req.headers['x-private-key'];
  return typeof pub === 'string' && pub.length > 0 && typeof prv === 'string' && prv.length > 0;
};

// Relayer availability status (so frontend can show a badge)
app.get('/relayer-status', async (req, res) => {
  await ensureRelayer();
  const s = getRelayerStatus();
  res.json({ relayerAvailable: s.available, relayerEndpoint: s.endpoint, relayerInitError: s.initError, moduleLoaded: s.moduleLoaded });
});

// Verify provided keys can round-trip a small payload using Relayer
app.post('/relayer-selfcheck', async (req, res) => {
  if (!relayerAvailable) return res.status(503).json({ ok: false, error: 'Relayer unavailable' });
  const pub = req.headers['x-public-key'];
  const prv = req.headers['x-private-key'];
  if (!pub || !prv) return res.status(400).json({ ok: false, error: 'Missing keys' });
  const msg = '42';
  try {
    const enc = await encryptWithRelayer(msg, pub);
    const dec = await decryptWithRelayer(enc, prv);
    const ok = dec === msg;
    return res.json({ ok });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Relayer roundtrip failed' });
  }
});

app.post('/api/upload', async (req, res) => {
  // Encrypted payload is received
  const { data } = req.body;
  // Demo: we don't persist; in a real app, you might store it
  // Optionally verify decrypt step for connectivity (not required)
  if (wantsRelayer(req)) {
    try {
      const decrypted = await decryptWithRelayer(data, req.headers['x-private-key']);
      if (typeof decrypted !== 'string') { /* ignore */ }
    } catch (e) { /* ignore errors in upload step */ }
  }
  res.json({ message: 'Encrypted data received.' });
});

// Analiz talebi
app.post('/api/analyze', async (req, res) => {
  // Perform analysis over encrypted data (demo: decrypt -> analyze -> encrypt)
  const { data } = req.body;
  let plain = '';
  try {
    if (wantsRelayer(req)) {
      plain = await decryptWithRelayer(data, req.headers['x-private-key']);
    } else {
      plain = decryptData(data) || '';
    }
  } catch (e) {
    // fallback to base64 demo if relayer fails
    try { plain = decryptData(data) || ''; } catch { plain = ''; }
  }

  // Basic metrics
  const characters = plain.length;
  const lineArr = plain.length ? plain.split(/\r\n|\r|\n/) : [];
  const lines = lineArr.length || 0;
  const wordTokens = (plain.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const words = wordTokens.length;

  // Stopword list (EN + TR minimal)
  const stopwords = new Set([
    'the','a','an','and','or','of','to','in','on','for','with','as','is','are','be','this','that','it','at','by','from','was','were','will','can','could','should','than','then','there','here','have','has','had','not','no','yes','you','your','we','our','they','their','i','me','my',
    've','veya','bir','bu','şu','o','için','ile','da','de','mi','mı','mu','mü','ama','fakat','ki','ya','yada','her','çok','az','en','sen','ben','biz','siz','onlar'
  ]);

  // Top words (exclude stopwords, short tokens)
  const freq = new Map();
  for (const t of wordTokens) {
    if (t.length < 2) continue;
    if (stopwords.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const topWords = Array.from(freq.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  // JSON detection/summary
  let jsonSummary = null;
  try {
    const parsed = JSON.parse(plain);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        jsonSummary = {
          type: 'array',
          length: parsed.length,
          sample: parsed.slice(0, 3)
        };
      } else {
        const keys = Object.keys(parsed);
        jsonSummary = {
          type: 'object',
          keysCount: keys.length,
          sampleKeys: keys.slice(0, 10)
        };
      }
    }
  } catch (e) {
    // not JSON
  }

  // CSV detection/summary (heuristic)
  let csvSummary = null;
  if (!jsonSummary && lines > 0) {
    const firstLine = lineArr[0] || '';
    const comma = (firstLine.match(/,/g) || []).length;
    const semicolon = (firstLine.match(/;/g) || []).length;
    const tab = (firstLine.match(/\t/g) || []).length;
    let delimiter = null;
    if (comma || semicolon || tab) {
      delimiter = comma >= semicolon && comma >= tab ? ',' : (semicolon >= tab ? ';' : '\t');
    }
    if (delimiter) {
      const headers = firstLine.split(delimiter).map(s => s.trim());
      const rowCount = Math.max(lines - 1, 0);
      csvSummary = {
        delimiter: delimiter === '\t' ? 'tab' : delimiter,
        columns: headers.length,
        headers: headers.slice(0, 20),
        rows: rowCount
      };
    }
  }

  const resultObj = {
    meta: { characters, words, lines },
    topWords,
    json: jsonSummary,
    csv: csvSummary
  };

  let payload = JSON.stringify(resultObj);
  try {
    if (wantsRelayer(req)) {
      const enc = await encryptWithRelayer(payload, req.headers['x-public-key']);
      return res.json({ result: enc });
    }
  } catch (e) {
    // fall back to demo
  }
  const encryptedResult = encryptData(payload);
  res.json({ result: encryptedResult });
});

// Analyze client-extracted features (A step scaffold for FHE-friendly flow)
app.post('/api/analyze-features', async (req, res) => {
  // Accept either plaintext features or an encrypted features blob
  const { features, encryptedFeatures } = req.body || {};

  let feats = features;
  if (!feats && encryptedFeatures) {
    try {
      if (wantsRelayer(req)) {
        const decrypted = await decryptWithRelayer(encryptedFeatures, req.headers['x-private-key'] || 'demo-private-key');
        feats = JSON.parse(decrypted);
      } else {
        const decrypted = decryptData(encryptedFeatures);
        feats = JSON.parse(decrypted);
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid encryptedFeatures payload' });
    }
  }

  if (!feats || typeof feats !== 'object') {
    return res.status(400).json({ error: 'Missing features object' });
  }

  const characters = Number(feats.characters || 0);
  const words = Number(feats.words || 0);
  const lines = Number(feats.lines || 0);
  // Optional client-provided word length bins, e.g., { '1': 3, '2': 10, '3': 7 }
  const wordLenHist = feats.wordLenHist && typeof feats.wordLenHist === 'object' ? feats.wordLenHist : null;

  // Derived metrics (server-side compute; FHE-targetable in future)
  const wordsPerLine = lines > 0 ? +(words / lines).toFixed(2) : null;
  const charsPerLine = lines > 0 ? +(characters / lines).toFixed(2) : null;
  const avgWordLen = words > 0 ? +(characters / Math.max(words, 1)).toFixed(2) : null;

  const resultObj = {
    derived: { wordsPerLine, charsPerLine, avgWordLen },
    echo: { characters, words, lines },
    histogram: wordLenHist || null
  };

  const payload = JSON.stringify(resultObj);

  try {
    if (wantsRelayer(req)) {
      const enc = await encryptWithRelayer(payload, req.headers['x-public-key']);
      return res.json({ result: enc });
    }
  } catch (e) {
    // fall back below
  }

  const enc = encryptData(payload);
  res.json({ result: enc });
});

// PoC: encrypted array sum (accepts plaintext numbers[] or encItems[])
app.post('/api/sum-array', async (req, res) => {
  const { numbers, encItems } = req.body || {};
  const pub = req.headers['x-public-key'];
  const prv = req.headers['x-private-key'];

  let arr = numbers;
  if (!arr && Array.isArray(encItems)) {
    try {
      const tmp = [];
      for (const it of encItems) {
        if (typeof it !== 'string') return res.status(400).json({ error: 'Invalid encItems entry' });
        if (wantsRelayer(req)) {
          const d = await decryptWithRelayer(it, prv);
          tmp.push(Number(d));
        } else {
          tmp.push(Number(decryptData(it)));
        }
      }
      arr = tmp;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid encItems payload' });
    }
  }

  if (!Array.isArray(arr)) return res.status(400).json({ error: 'Missing numbers array' });
  const sum = arr.reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0);
  const payload = String(sum);

  try {
    if (wantsRelayer(req)) {
      const enc = await encryptWithRelayer(payload, pub);
      return res.json({ result: enc });
    }
  } catch (e) {}

  const enc = encryptData(payload);
  res.json({ result: enc });
});

app.post('/api/add', async (req, res) => {
  const { encA, encB, a, b } = req.body || {};
  const pub = req.headers['x-public-key'];
  const prv = req.headers['x-private-key'];

  let n1, n2;
  try {
    if (typeof encA === 'string' && typeof encB === 'string') {
      if (wantsRelayer(req)) {
        const d1 = await decryptWithRelayer(encA, prv);
        const d2 = await decryptWithRelayer(encB, prv);
        n1 = Number(d1);
        n2 = Number(d2);
      } else {
        n1 = Number(decryptData(encA));
        n2 = Number(decryptData(encB));
      }
    } else {
      n1 = Number(a);
      n2 = Number(b);
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
    return res.status(400).json({ error: 'Inputs must be numbers' });
  }

  const sum = n1 + n2;
  const payload = String(sum);

  try {
    if (wantsRelayer(req)) {
      const enc = await encryptWithRelayer(payload, pub);
      return res.json({ result: enc });
    }
  } catch (e) {
    // fallback below
  }
  const enc = encryptData(payload);
  res.json({ result: enc });
});

// If running on Vercel (serverless), export the app; otherwise start a local server
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    const s = getRelayerStatus();
    console.log(`[Relayer] available=${s.available} endpoint=${s.endpoint}${s.initError ? ` error=${s.initError}` : ''}`);
  });
}
