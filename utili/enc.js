const crypto = require("crypto");
const secretKey = "123"; // Replace with your secret key

function encryptId(id) {
  const cipher = crypto.createCipher("aes256", secretKey);
  let encrypted = cipher.update(id, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decryptId(encryptedId) {
  const decipher = crypto.createDecipher("aes256", secretKey);
  let decrypted = decipher.update(encryptedId, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = {
  encryptId,
  decryptId,
};
