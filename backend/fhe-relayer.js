let relayer = null;
let available = false; // true when SDK loads and instance creates
let initError = null;
let moduleLoaded = false; // whether SDK module was imported
let endpointUsed = process.env.RELAYER_ENDPOINT || 'https://relayer.sepolia.zama.ai';

const ready = (async () => {
  try {
    // Dynamic import to support ESM-only packages under CommonJS
    const mod = await import('@zama-fhe/relayer-sdk/node');
    const Relayer = mod?.Relayer || mod?.default || null;
    if (!Relayer) {
      initError = 'Relayer class not found in SDK';
      available = false;
      return;
    }
    try {
      relayer = new Relayer({ endpoint: endpointUsed });
      available = true;
      moduleLoaded = true;
    } catch (e2) {
      relayer = null;
      initError = String(e2 && e2.message ? e2.message : e2);
      available = false;
    }
  } catch (e) {
    initError = String(e && e.message ? e.message : e);
    available = false;
  }
})();

async function encryptWithRelayer(data, publicKey) {
  try { await ready; } catch { /* ignore */ }
  if (!relayer) {
    return Buffer.from(String(data), 'utf-8').toString('base64');
  }
  return await relayer.encrypt({ data, publicKey });
}

async function decryptWithRelayer(encryptedData, privateKey) {
  try { await ready; } catch { /* ignore */ }
  if (!relayer) {
    return Buffer.from(String(encryptedData), 'base64').toString('utf-8');
  }
  return await relayer.decrypt({ encryptedData, privateKey });
}

function getRelayerStatus() {
  return {
    available: Boolean(relayer),
    moduleLoaded,
    initError,
    endpoint: endpointUsed,
  };
}
async function ensureRelayer() {
  try { await ready; } catch { /* ignore */ }
  if (relayer) return true;
  // Try CommonJS require first, then ESM dynamic import as a fallback
  try {
    let Relayer = null;
    try {
      const modReq = require('@zama-fhe/relayer-sdk');
      Relayer = modReq?.Relayer || modReq?.default || null;
      moduleLoaded = Boolean(Relayer || modReq);
    } catch (e1) {
      try {
        const mod = await import('@zama-fhe/relayer-sdk');
        Relayer = mod?.Relayer || mod?.default || null;
        moduleLoaded = Boolean(Relayer || mod);
      } catch (e2) {
        initError = String(e2 && e2.message ? e2.message : e2);
        return false;
      }
    }
    if (!Relayer) {
      initError = 'Relayer class not found in SDK';
      return false;
    }
    try {
      relayer = new Relayer({ endpoint: endpointUsed });
    } catch (e3) {
      initError = String(e3 && e3.message ? e3.message : e3);
      relayer = null;
      return false;
    }
    return true;
  } catch (e) {
    initError = String(e && e.message ? e.message : e);
    return false;
  }
}

module.exports = { encryptWithRelayer, decryptWithRelayer, getRelayerStatus, ensureRelayer };
