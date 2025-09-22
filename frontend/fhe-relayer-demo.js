import { Relayer } from '@zama-fhe/relayer-sdk';

const relayer = new Relayer({ endpoint: 'https://relayer.sepolia.zama.ai' });

export async function encryptDataWithRelayer(data, publicKey) {
  const encrypted = await relayer.encrypt({ data, publicKey });
  return encrypted;
}

export async function decryptDataWithRelayer(encryptedData, privateKey) {
  const decrypted = await relayer.decrypt({ encryptedData, privateKey });
  return decrypted;
}
