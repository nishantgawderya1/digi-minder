import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ServiceError } from "./service-error.server";
import { MAX_FILE_BYTES } from "./bills";

export function storageConfigured() {
  return [
    "AWS_ENDPOINT_URL_S3",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "S3_BUCKET",
  ].every((key) => Boolean(process.env[key]));
}
let client: S3Client | undefined;
function storage() {
  if (!storageConfigured())
    throw new ServiceError(
      "Document storage is unavailable. Please try again later.",
    );
  client ??= new S3Client({
    endpoint: process.env["AWS_ENDPOINT_URL_S3"]!,
    region: process.env["AWS_REGION"]!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env["AWS_ACCESS_KEY_ID"]!,
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket: process.env["S3_BUCKET"]! };
}
export function uploadKey(userId: string, id: string) {
  return `users/${encodeURIComponent(userId)}/pending/${id}`;
}

export async function signedUpload(
  key: string,
  contentType: string,
  size: number,
) {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
}
export function matchesFileSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf")
    return Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (contentType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png")
    return Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  if (contentType === "image/webp")
    return (
      Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
    );
  return false;
}
export async function finalizeUpload(
  key: string,
  finalKey: string,
  contentType: string,
  expectedSize: number,
) {
  const { client, bucket } = storage();
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength > MAX_FILE_BYTES ||
    head.ContentLength !== expectedSize ||
    head.ContentType !== contentType ||
    !head.ETag
  )
    throw new ServiceError(
      "The uploaded file doesn't match the selected file. Please upload it again.",
    );
  const data = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: "bytes=0-15",
      IfMatch: head.ETag,
    }),
  );
  if (
    !data.Body ||
    !matchesFileSignature(await data.Body.transformToByteArray(), contentType)
  )
    throw new ServiceError(
      "This file isn't a supported image or PDF. Choose a JPEG, PNG, WebP or PDF file.",
    );
  // A new private key keeps a still-valid upload URL from overwriting a saved original.
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: finalKey,
      CopySource: `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
      CopySourceIfMatch: head.ETag,
    }),
  );
}
export async function deleteStoredFile(key: string) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
export async function readStoredOriginal(key: string, contentType: string) {
  const { client, bucket } = storage();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (
    !response.Body ||
    !response.ContentLength ||
    response.ContentLength > MAX_FILE_BYTES
  )
    throw new ServiceError("The original document is unavailable.");
  const bytes = await response.Body.transformToByteArray();
  if (
    bytes.length > MAX_FILE_BYTES ||
    !matchesFileSignature(bytes, contentType)
  )
    throw new ServiceError("The stored original is invalid.");
  return bytes;
}
export async function signedDownload(
  key: string,
  filename: string,
  attachment = false,
) {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, "%27")}`,
    }),
    { expiresIn: 300 },
  );
}
