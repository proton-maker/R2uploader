require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand, GetObjectCommand, ListObjectsV2Command   } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const cors = require('cors');
const https = require('https');

const app = express();
const upload = multer({ dest: "uploads/" });

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY,
  R2_SECRET_KEY,
  R2_BUCKET_NAME
} = process.env;

const LOG_FILE = path.join(__dirname, "log.txt");

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error(" Failed to write log:", err.message);
  });
}

// Validate required environment variables early to avoid opaque 500 errors
const missingEnv = [];
if (!R2_ACCOUNT_ID) missingEnv.push('R2_ACCOUNT_ID');
if (!R2_ACCESS_KEY) missingEnv.push('R2_ACCESS_KEY');
if (!R2_SECRET_KEY) missingEnv.push('R2_SECRET_KEY');
if (!R2_BUCKET_NAME) missingEnv.push('R2_BUCKET_NAME');
if (missingEnv.length) {
  const msg = `Missing required environment variables: ${missingEnv.join(', ')}`;
  console.error(msg);
  writeLog(msg);
  // Exit so developer fixes env instead of seeing cryptic SDK errors
  process.exit(1);
}


// Track progress + completed status + upload stage
const uploadStatus = {}; // { "file.zip": { percent, completed, uploadStage } }

const endpointUrl = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Use a Node https.Agent with explicit TLS minimum to avoid handshake mismatches on some Windows/OpenSSL builds
const httpsAgent = new https.Agent({ keepAlive: true, minVersion: 'TLSv1.2' });
const httpHandler = new NodeHttpHandler({ httpsAgent });

const r2 = new S3Client({
  region: "auto",
  endpoint: endpointUrl,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
  requestHandler: httpHandler,
  // allow a few attempts at the underlying HTTP layer; we also wrap calls in sendWithRetry above
  maxAttempts: 3,
});

// small retry helper for transient network/SSL errors
async function sendWithRetry(client, command, retries = 2, delayMs = 250) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await client.send(command);
    } catch (err) {
      lastErr = err;
  const note = `sendWithRetry attempt ${i} failed: ${err.stack || err.message}`;
  console.error(note);
  writeLog(note);
      // if last attempt, break and rethrow
      if (i === retries) break;
      // short backoff before retry
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

app.use(express.static(__dirname));
app.use(cors());

app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    writeLog("No file received from frontend.");
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileStream = fs.createReadStream(file.path);
  const originalFileName = file.originalname;
  const fileName = path.basename(originalFileName);

  // Initialize upload status
  uploadStatus[fileName] = {
    percent: 0,
    completed: false,
    uploadStage: "r2"
  };

  // Immediately respond to frontend
  res.status(200).json({
    message: "Upload initiated with AWS SDK v3!",
    completed: true,
    fileName: fileName
  });

  fileStream.on("error", (err) => {
    writeLog(`File stream error while reading ${fileName}: ${err.message}`);
  });

  try {
    const parallelUpload = new Upload({
      client: r2,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: file.mimetype
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false
    });

    parallelUpload.on("httpUploadProgress", (progress) => {
      if (progress.total) {
        const percent = Math.floor((progress.loaded / progress.total) * 100);
        uploadStatus[fileName].uploadStage = "r2";
        uploadStatus[fileName].percent = percent;
      }
    });

    await parallelUpload.done();

    fs.unlinkSync(file.path);
    uploadStatus[fileName].percent = 100;
    uploadStatus[fileName].completed = true;
    uploadStatus[fileName].uploadStage = "done";

    setTimeout(() => {
      delete uploadStatus[fileName];
    }, 10000);

  } catch (err) {
    writeLog(`Upload failed for ${fileName}: ${err.stack || err.message}`);
    fs.unlink(file.path, () => {});
    delete uploadStatus[fileName];
  }
});

// Endpoint Progress
app.get("/progress", (req, res) => {
  const filename = req.query.file;
  const status = uploadStatus[filename] || {
    percent: 0,
    completed: false,
    uploadStage: "lokal"
  };
  res.json(status);
});

// POST abort a specific multipart upload
app.post("/abort", express.json(), async (req, res) => {
  const { Key, UploadId } = req.body;
  if (!Key || !UploadId) {
    return res.status(400).json({ error: "Missing Key or UploadId" });
  }

  try {
    await r2.send(
      new AbortMultipartUploadCommand({
        Bucket: R2_BUCKET_NAME,
        Key,
        UploadId
      })
    );
    writeLog(` Aborted multipart upload: ${Key}`);
    res.json({ success: true });
  } catch (err) {
    writeLog(` Failed to abort ${Key}: ${err.message}`);
    res.status(500).json({ error: "Abort failed" });
  }
});

app.get("/uploads", async (req, res) => {
  try {
    const result = await r2.send(
      new ListMultipartUploadsCommand({
        Bucket: R2_BUCKET_NAME
      })
    );
    res.json(result.Uploads || []);
  } catch (err) {
    writeLog(` Failed to list multipart uploads: ${err.message}`);
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

app.get("/download-file", async (req, res) => {
  const filename = req.query.filename;
  if (!filename) {
    return res.status(400).send("Filename is required");
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filename
    });

    const response = await r2.send(command);

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", response.ContentType || "application/octet-stream");

    response.Body.pipe(res);
  } catch (err) {
    writeLog(`Download failed for ${filename}: ${err.message}`);
    res.status(500).send("Download failed.");
  }
});

app.get("/files", async (req, res) => {
  console.log('GET /files requested, using endpoint', endpointUrl);
  writeLog(`GET /files requested, endpoint=${endpointUrl}`);
  try {
  const result = await sendWithRetry(r2, new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME }));
    res.json(result.Contents || []);
  } catch (err) {
  writeLog(`Failed to list files: ${err.stack || err.message}`);
  console.error('List files error:', err);
  res.status(500).json({ error: "Failed to get files", details: err.message });
  }
});

// Generate presigned URL for GET (download) with expiry (seconds)
app.get('/generate-url', async (req, res) => {
  const filename = req.query.file;
  let expiry = parseInt(req.query.expiry, 10) || 3600;
  // Clamp expiry between 1 second and 7 days (604800)
  if (Number.isNaN(expiry) || expiry < 1) expiry = 3600;
  const MAX_EXPIRY = 7 * 24 * 60 * 60; // 7 days
  if (expiry > MAX_EXPIRY) expiry = MAX_EXPIRY;

  if (!filename) return res.status(400).json({ error: 'Missing file parameter' });

  try {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: filename });
  // Ensure object exists first (reduce chance of presign failure)
  await sendWithRetry(r2, new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: filename, MaxKeys: 1 }));
  const url = await getSignedUrl(r2, command, { expiresIn: expiry });
    res.json({ url });
  } catch (err) {
  writeLog(`Failed to generate signed URL for ${filename}: ${err.stack || err.message}`);
  console.error('Generate URL error:', err);
  res.status(500).json({ error: 'Failed to generate signed URL', details: err.message });
  }
});

app.listen(3000, () => {
  console.log(" Server running at http://localhost:3000");
});
