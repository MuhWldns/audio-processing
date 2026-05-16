/**
 * Storage service - Backblaze B2 via S3-compatible API
 * Handles file upload, presigned URL generation, and deletion
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "https://s3.us-east-005.backblazeb2.com",
  region: process.env.S3_REGION || "us-east-005",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "rbxroyale-files";
const PRESIGNED_URL_EXPIRY = 300; // 5 minutes

/**
 * Upload a file to B2
 * @param {string} key - Object key (e.g. "scripts/ui-system/v1.0.0/script.rbxm")
 * @param {Buffer} buffer - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<{key: string, size: number}>}
 */
export async function uploadFile(key, buffer, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return {
    key,
    size: buffer.length,
  };
}

/**
 * Generate a presigned download URL (5 min expiry)
 * @param {string} key - Object key
 * @param {number} expiresIn - Expiry in seconds (default: 300)
 * @returns {Promise<string>} Presigned URL
 */
export async function getPresignedDownloadUrl(key, expiresIn = PRESIGNED_URL_EXPIRY) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from B2
 * @param {string} key - Object key
 */
export async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if a file exists in B2
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
export async function fileExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Generate a storage key for product files
 * @param {string} productSlug - Product slug
 * @param {string} version - File version
 * @param {string} fileName - Original file name
 * @returns {string} Storage key
 */
export function generateFileKey(productSlug, version, fileName) {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `scripts/${productSlug}/v${version}/${timestamp}-${safeName}`;
}
