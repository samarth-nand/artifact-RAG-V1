import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import { Readable } from "stream";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const env = getEnv();
    s3Client = new S3Client({
      region: env.AWS_REGION,
    });
  }
  return s3Client;
}

export async function generatePresignedUploadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const env = getEnv();
    const client = getS3Client();

    const command = new PutObjectCommand({
      Bucket: env.AUDIO_BUCKET_NAME,
      Key: key,
      ContentType: "audio/webm",
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    logger.debug("Generated presigned upload URL", { key });
    return url;
  } catch (error) {
    logger.error("Failed to generate presigned URL", error);
    throw error;
  }
}

export async function downloadAudioFromS3(key: string): Promise<Buffer> {
  try {
    const env = getEnv();
    const client = getS3Client();

    const command = new GetObjectCommand({
      Bucket: env.AUDIO_BUCKET_NAME,
      Key: key,
    });

    const response = await client.send(command);
    const stream = response.Body as Readable;

    // Convert stream to buffer
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  } catch (error) {
    logger.error("Failed to download audio from S3", error);
    throw error;
  }
}

export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const env = getEnv();
    const client = getS3Client();

    const command = new GetObjectCommand({
      Bucket: env.AUDIO_BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    logger.debug("Generated presigned download URL", { key });
    return url;
  } catch (error) {
    logger.error("Failed to generate presigned download URL", error);
    throw error;
  }
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}): Promise<void> {
  const env = getEnv();
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: env.AUDIO_BUCKET_NAME,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  });

  await client.send(command);
}

export async function getSignedGetUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const env = getEnv();
  const client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.AUDIO_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}
