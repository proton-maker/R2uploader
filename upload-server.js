require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand, GetObjectCommand, ListObjectsV2Command   } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

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

// Track progress + completed status + upload stage
const uploadStatus = {}; // { "file.zip": { percent, completed, uploadStage } }

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  }
});

app.use(express.static(__dirname));

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
  try {
    const result = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME
      })
    );
    res.json(result.Contents || []);
  } catch (err) {
    writeLog(`Failed to list files: ${err.message}`);
    res.status(500).json({ error: "Failed to get files" });
  }
});

app.listen(3000, () => {
  console.log(" Server running at http://localhost:3000");
});
