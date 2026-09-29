// Unified file storage for Manus and IDrive e2.
// IDrive is preferred when its project secrets are configured; Manus storage remains
// as a safe fallback for existing deployments and environments without IDrive.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

type StorageConfig = { baseUrl: string; apiKey: string };
type IdriveConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function getIdriveConfig(): IdriveConfig | null {
  const endpoint = process.env.IDRIVE_E2_ENDPOINT?.trim();
  const bucket = process.env.IDRIVE_E2_BUCKET?.trim();
  const accessKeyId = process.env.IDRIVE_E2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.IDRIVE_E2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    region: process.env.IDRIVE_E2_REGION?.trim() || "us-east-1",
    accessKeyId,
    secretAccessKey,
  };
}

function getIdriveClient(config: IdriveConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function publicAppFileUrl(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function manusStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: toFormData(data, contentType, key.split("/").pop() ?? key),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  return { key, url: (await response.json()).url };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const idrive = getIdriveConfig();
  if (!idrive) return manusStoragePut(key, data, contentType);

  const client = getIdriveClient(idrive);
  await client.send(
    new PutObjectCommand({
      Bucket: idrive.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      ...(typeof data === "string" ? {} : { ContentLength: data.length }),
    })
  );
  // Store a stable application URL, never an expiring signed URL.
  return { key, url: publicAppFileUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const idrive = getIdriveConfig();
  if (!idrive) {
    const downloadApiUrl = new URL(
      "v1/storage/downloadUrl",
      ensureTrailingSlash(getStorageConfig().baseUrl)
    );
    downloadApiUrl.searchParams.set("path", key);
    const response = await fetch(downloadApiUrl, {
      method: "GET",
      headers: buildAuthHeaders(getStorageConfig().apiKey),
    });
    return { key, url: (await response.json()).url };
  }
  const url = await getSignedUrl(
    getIdriveClient(idrive),
    new GetObjectCommand({ Bucket: idrive.bucket, Key: key }),
    { expiresIn: 300 }
  );
  return { key, url };
}

export function isIdriveConfigured(): boolean {
  return Boolean(getIdriveConfig());
}
