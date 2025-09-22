
import React, { useEffect, useRef, useState } from 'react';
import './App.css';
// Auto-detect API base: use same-origin in prod; in CRA dev (port 3000) target backend at 3001
const API_BASE = process.env.REACT_APP_API_BASE || (
  typeof window !== 'undefined' && window.location && window.location.port === '3000'
    ? 'http://localhost:3001'
    : ''
);
// Mock encryption helpers (UTF-8 safe base64)
function encryptData(data) {
  // Accepts string or ArrayBuffer/Uint8Array and returns base64
  let bytes;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (data?.buffer instanceof ArrayBuffer) {
    // e.g., Uint8Array
    bytes = new Uint8Array(data.buffer);
  } else {
    bytes = new TextEncoder().encode(String(data ?? ''));
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function decryptData(b64) {
  // Converts base64 back to UTF-8 string (used for server's analysis message)
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Fallback: return binary if decoding fails
    return binary;
  }
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [summary, setSummary] = useState(null);
  const [featureSummary, setFeatureSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const fileInputRef = useRef(null);
  const [addA, setAddA] = useState('');
  const [addB, setAddB] = useState('');
  const [addResult, setAddResult] = useState('');
  const [relayerOn, setRelayerOn] = useState(false);
  const [relayerStatus, setRelayerStatus] = useState(null);
  const [pubKey, setPubKey] = useState('');
  const [prvKey, setPrvKey] = useState('');
  const [relayerCheck, setRelayerCheck] = useState(null);
  const [listInput, setListInput] = useState('1,2,3');
  const [listSum, setListSum] = useState('');

  useEffect(() => {
    // probe relayer availability on mount
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/relayer-status`);
        const j = await res.json().catch(() => ({}));
        setRelayerStatus(Boolean(j.relayerAvailable));
      } catch {
        setRelayerStatus(false);
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightMode);
  }, [lightMode]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult('');
    setOkMsg('');
    setErrorMsg('');
    setSummary(null);
    setFeatureSummary(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      // Encrypt bytes safely (UTF-8/binary safe)
      const encrypted = encryptData(arrayBuffer);
      
      try {
        setLoading(true);
        // Small timeout helper for fetch
        const withTimeout = (url, options = {}, ms = 10000) => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), ms);
          return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
        };

        const res = await withTimeout(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(relayerOn ? { 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey } : {}) },
          body: JSON.stringify({ data: encrypted })
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Upload failed (${res.status} ${res.statusText}) ${text}`.trim());
        }
        await res.json().catch(() => ({}));
        // Analysis request
        const analyzeRes = await withTimeout(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(relayerOn ? { 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey } : {}) },
          body: JSON.stringify({ data: encrypted })
        });
        if (!analyzeRes.ok) {
          const text = await analyzeRes.text().catch(() => '');
          throw new Error(`Analyze failed (${analyzeRes.status} ${analyzeRes.statusText}) ${text}`.trim());
        }
        const analyzeResult = await analyzeRes.json();
        // Decode main analysis result
        const decrypted = decryptData(analyzeResult.result);
        // Try to parse structured JSON; fallback to plain text
        try {
          const parsed = JSON.parse(decrypted);
          setSummary(parsed);
          setResult('');
        } catch {
          setSummary(null);
          setResult(decrypted);
        }

        // A) Client-extracted features flow (FHE-friendly scaffold)
        try {
          const textContent = new TextDecoder().decode(new Uint8Array(arrayBuffer));
          const lineArr = textContent.length ? textContent.split(/\r\n|\r|\n/) : [];
          const wordTokens = (textContent.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
          // Simple word-length histogram (bin by length 1..10+, cap at 10)
          const hist = {};
          for (const w of wordTokens) {
            const len = Math.min(10, w.length);
            hist[len] = (hist[len] || 0) + 1;
          }
          const features = { characters: textContent.length, words: wordTokens.length, lines: lineArr.length, wordLenHist: hist };

          // If relayerOn, simulate end-to-end encrypted features by base64-encoding the JSON
          const payload = relayerOn
            ? { encryptedFeatures: encryptData(JSON.stringify(features)) }
            : { features };

          const featuresRes = await withTimeout(`${API_BASE}/api/analyze-features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(relayerOn ? { 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey } : {}) },
            body: JSON.stringify(payload)
          });
          if (featuresRes.ok) {
            const fr = await featuresRes.json();
            const fdec = decryptData(fr.result);
            try {
              const fparsed = JSON.parse(fdec);
              setFeatureSummary(fparsed);
            } catch {
              setFeatureSummary(null);
            }
          } else {
            setFeatureSummary(null);
          }
        } catch {
          setFeatureSummary(null);
        }
        setOkMsg('Analysis completed successfully.');
        setErrorMsg('');
      } catch (err) {
        setResult('');
        const msg = err?.name === 'AbortError'
          ? 'Request timed out. Please check the server and try again.'
          : `Network error: ${err?.message || 'Unable to reach the server.'}`;
        setErrorMsg(msg);
        setOkMsg('');
        setFeatureSummary(null);
      } finally {
        setLoading(false);
      }
  };
  // Read as ArrayBuffer to keep full fidelity for any charset
  reader.readAsArrayBuffer(file);
  };

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div className="name">Content FHE</div>
        </div>
        <button className="themeToggle" onClick={() => setLightMode(v => !v)}>
          {lightMode ? 'Dark theme' : 'Light theme'}
        </button>
      </div>

    <div className="card">
  <div className="title">Private Content Analytics</div>
  <div className="subtitle">Encrypt your content locally; the server analyzes it while it remains encrypted.</div>

        <div
          className={`dropzone ${dragOver ? 'drag' : ''}`}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        >
          Drag & drop your file here, or choose below.
        </div>

        <div className="row">
          {/* Visually hidden native input to avoid localized UI; controlled via custom button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            aria-label="Select file"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', clip: 'rect(1px, 1px, 1px, 1px)', whiteSpace: 'nowrap', border: 0, padding: 0, margin: -1 }}
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            Choose file
          </button>
          {!file && <span className="fileLabel" aria-live="polite">No file chosen</span>}
            <button className="btn" onClick={handleUpload} disabled={!file || loading}>
            {loading ? (<><span className="spinner" />Processing…</>) : 'Upload & Analyze'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setFile(null); setResult(''); }} disabled={loading}>
            Clear
          </button>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge" title="Relayer availability">Relayer: {relayerStatus == null ? '...' : (relayerStatus ? 'Available' : 'Unavailable')}</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={relayerOn} onChange={(e) => setRelayerOn(e.target.checked)} disabled={!relayerStatus} />
                Use Relayer
              </label>
              {relayerOn && (
                <>
                  <input className="file" type="text" placeholder="Public key" value={pubKey} onChange={(e) => setPubKey(e.target.value)} style={{ minWidth: 220 }} />
                  <input className="file" type="text" placeholder="Private key" value={prvKey} onChange={(e) => setPrvKey(e.target.value)} style={{ minWidth: 220 }} />
                  <button className="btn btn-secondary" disabled={!pubKey || !prvKey || !relayerStatus} onClick={async () => {
                    try {
                      const r = await fetch(`${API_BASE}/relayer-selfcheck`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey }
                      });
                      const j = await r.json().catch(() => ({}));
                      setRelayerCheck(j.ok === true ? 'OK' : 'FAIL');
                    } catch {
                      setRelayerCheck('FAIL');
                    }
                  }}>Self‑check</button>
                  {relayerCheck && <span className={`badge ${relayerCheck === 'OK' ? 'code' : ''}`}>Check: {relayerCheck}</span>}
                </>
              )}
            </div>
        </div>

        {file && (
          <div className="fileinfo">
            <span className="badge">{file.name}</span>
            <span className="badge">{(file.size/1024).toFixed(1)} KB</span>
            {file.type && <span className="badge code">{file.type}</span>}
          </div>
        )}

        <div className="result" style={{ marginTop: 16 }}>
          <div className="heading"><span className="icon" /> Encrypted add (PoC)</div>
          <div className="desc">Enter two numbers. We’ll send them to the server and return the (encrypted) sum.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="file" type="number" placeholder="A" value={addA} onChange={(e) => setAddA(e.target.value)} />
            <input className="file" type="number" placeholder="B" value={addB} onChange={(e) => setAddB(e.target.value)} />
            <button className="btn" disabled={loading || addA === '' || addB === ''} onClick={async () => {
              setAddResult('');
              setErrorMsg('');
              try {
                // Encrypt inputs client-side (demo base64). If Relayer is enabled later,
                // we can switch to relayer.encrypt here.
                const encA = encryptData(String(Number(addA)));
                const encB = encryptData(String(Number(addB)));
                const res = await fetch(`${API_BASE}/api/add`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(relayerOn ? { 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey } : {}) },
                  body: JSON.stringify({ encA, encB })
                });
                if (!res.ok) throw new Error(`Add failed (${res.status})`);
                const j = await res.json();
                const dec = decryptData(j.result);
                setAddResult(dec);
              } catch (e) {
                setErrorMsg(`Add error: ${e.message}`);
              }
            }}>Compute</button>
          </div>
          {addResult !== '' && (
            <div style={{ marginTop: 8 }}><strong>Sum:</strong> {addResult}</div>
          )}
        </div>

        <div className="result">
          <div className="heading"><span className="icon" /> Encrypted list sum (PoC)</div>
          <div className="desc">Provide a comma‑separated list of numbers. We’ll encrypt each and sum on the server.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="file" type="text" placeholder="e.g., 1,2,3,4" value={listInput} onChange={(e) => setListInput(e.target.value)} />
            <button className="btn" disabled={loading || !listInput.trim()} onClick={async () => {
              setListSum('');
              setErrorMsg('');
              try {
                const nums = listInput.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
                if (nums.length === 0) throw new Error('No valid numbers');
                const encItems = nums.map(n => encryptData(String(n)));
                const res = await fetch(`${API_BASE}/api/sum-array`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(relayerOn ? { 'x-relayer': '1', 'x-public-key': pubKey, 'x-private-key': prvKey } : {}) },
                  body: JSON.stringify({ encItems })
                });
                if (!res.ok) throw new Error(`Sum failed (${res.status})`);
                const j = await res.json();
                const dec = decryptData(j.result);
                setListSum(dec);
              } catch (e) {
                setErrorMsg(`Sum error: ${e.message}`);
              }
            }}>Compute</button>
          </div>
          {listSum !== '' && (
            <div style={{ marginTop: 8 }}><strong>Total:</strong> {listSum}</div>
          )}
        </div>

        <div className="result">
          <div className="heading"><span className="icon" /> Result</div>
          <div className="desc">Encrypted-content analysis output from the server.</div>
          <div style={{ marginTop: 8 }}>
            {summary ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Metrics:</strong> {summary.meta?.characters ?? 0} chars · {summary.meta?.words ?? 0} words · {summary.meta?.lines ?? 0} lines
                </div>
                {summary.topWords?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Top words:</strong> {summary.topWords.map(t => `${t.word} (${t.count})`).join(', ')}
                  </div>
                )}
                {summary.json && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>JSON:</strong> {summary.json.type === 'array' ? `array length=${summary.json.length}` : `object keys=${summary.json.keysCount}`} 
                  </div>
                )}
                {summary.csv && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>CSV:</strong> delimiter={summary.csv.delimiter} · columns={summary.csv.columns} · rows={summary.csv.rows}
                  </div>
                )}
                {featureSummary?.derived && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Derived:</strong> W/line={featureSummary.derived.wordsPerLine ?? '-'} · Chars/line={featureSummary.derived.charsPerLine ?? '-'} · Avg word len={featureSummary.derived.avgWordLen ?? '-'}
                  </div>
                )}
                {featureSummary?.histogram && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Word length hist:</strong> {Object.entries(featureSummary.histogram).map(([k,v]) => `${k}:${v}`).join(' ')}
                  </div>
                )}
              </div>
            ) : (
              result || 'No file selected yet.'
            )}
          </div>
        </div>

        {okMsg && <div className="alert success"><button className="close" onClick={() => setOkMsg('')}>×</button>{okMsg}</div>}
        {errorMsg && <div className="alert error"><button className="close" onClick={() => setErrorMsg('')}>×</button>{errorMsg}</div>}
  <div className="footer">Privacy note: This demo simulates FHE flow. Use real FHE (Zama) for production.</div>
      </div>
    </div>
  );
}


export default App;
