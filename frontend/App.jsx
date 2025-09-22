import React, { useState } from 'react';
import { encryptDataWithRelayer, decryptDataWithRelayer } from './fhe-relayer-demo';

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const publicKey = 'demo-public-key';
  const privateKey = 'demo-private-key';

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const encrypted = await encryptDataWithRelayer(text, publicKey);
      const res = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-public-key': publicKey, 'x-private-key': privateKey },
        body: JSON.stringify({ data: encrypted })
      });
      await res.json();
      const analyzeRes = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-public-key': publicKey, 'x-private-key': privateKey },
        body: JSON.stringify({ data: encrypted })
      });
      const analyzeResult = await analyzeRes.json();
      const decrypted = await decryptDataWithRelayer(analyzeResult.result, privateKey);
      try {
        const parsed = JSON.parse(decrypted);
        setResult(JSON.stringify(parsed, null, 2));
      } catch {
        setResult(decrypted);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: 32 }}>
      <h1>Gizli Sağlık Analiz Platformu</h1>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload}>Yükle & Analiz Et</button>
      <div style={{ marginTop: 24 }}>
        <strong>Sonuç:</strong> {result}
      </div>
    </div>
  );
}

export default App;
