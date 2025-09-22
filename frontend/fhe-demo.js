export function encryptData(data) {
  return btoa(data);
}

export function decryptData(encData) {
  return atob(encData);
}
