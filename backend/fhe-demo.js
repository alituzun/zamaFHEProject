function encryptData(data) {
  return Buffer.from(data).toString('base64');
}

function decryptData(encData) {
  return Buffer.from(encData, 'base64').toString('utf-8');
}

module.exports = { encryptData, decryptData };
