import * as crypto from "crypto";
import { getEnv } from "./env";
import { logger } from "./logger";

/**
 * RSA encryption for sensitive data (client secrets).
 * 
 * Public key is used server-side to encrypt.
 * Private key is held client-side to decrypt.
 * 
 * This prevents MITM attacks even over HTTPS by adding an additional
 * encryption layer that only the intended client can decrypt.
 */

/**
 * Encrypt data using RSA public key.
 * Returns base64-encoded encrypted data.
 */
export function encryptWithPublicKey(data: string, publicKey: string): string {
  try {
    const buffer = Buffer.from(data, "utf8");
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      buffer
    );
    return encrypted.toString("base64");
  } catch (error) {
    logger.error("RSA encryption failed", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt data using RSA private key (for testing/verification only).
 * In production, decryption happens client-side.
 */
export function decryptWithPrivateKey(encryptedData: string, privateKey: string): string {
  try {
    const buffer = Buffer.from(encryptedData, "base64");
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      buffer
    );
    return decrypted.toString("utf8");
  } catch (error) {
    logger.error("RSA decryption failed", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Generate a new RSA key pair for testing.
 * In production, generate once and store securely.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return { publicKey, privateKey };
}
