<div align="center">
  <img src="https://storage.bosmudasky.com/wp-content/uploads/2025/07/image.png" alt="UploaderCloudflareR2 Logo" width="1000" />

  <br />

  <img src="https://skillicons.dev/icons?i=nodejs,express,javascript,html,css" alt="Tech Stack Icons" />
</div>

# UploaderCloudflareR2

UploaderCloudflareR2 is a lightweight backend application built with Node.js and Express that allows users to upload large files (up to 5GB or more) from a web frontend directly to **Cloudflare R2**, using AWS SDK v3's presigned multipart upload streaming capability.

## Features

* Direct file upload via browser-based UI
* Multipart upload to **Cloudflare R2** (streamed, memory-efficient)
* Real-time progress tracking (local and R2 stages)
* Upload status endpoint for each file
* Temporary local storage with auto-cleanup after success
* Background upload process (frontend receives immediate response)
* Basic validation and error handling

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourname/UploaderCloudflareR2.git
cd UploaderCloudflareR2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file with your Cloudflare R2 credentials:

```env
R2_ACCESS_KEY=your-access-key
R2_SECRET_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_ACCOUNT_ID=your-account-id
```

You can find this information on the Cloudflare Dashboard > R2 > Buckets > API Keys section.

## Usage

### Run the Server

```bash
node index.js
```

Or use `nodemon` for live-reloading:

```bash
npx nodemon index.js
```

Visit:

```
http://localhost:3000
```

### Uploading a File

1. Open the web interface.
2. Select a `.zip` file to upload.
3. Monitor real-time progress.
4. Once local upload reaches 100%, the file will begin uploading to R2 in the background.

### Verifying on R2

The uploaded file will appear in your R2 bucket with the generated filename:

```
{filename}.zip
```

## API Endpoints

### POST `/upload`

Upload a file using form-data. Required field:

* `file` (type: `.zip`)

**Response:**

```json
{
  "message": "Upload success with AWS SDK v3!",
  "completed": true,
  "fileName": "abc123.zip"
}
```

### GET `/progress/:fileName`

Check the upload status:

```json
{
  "percent": 78,
  "completed": false,
  "uploadStage": "r2"
}
```

## Project Structure

```
UploaderCloudflareR2/
├── index.js          # Main server logic
├── uploader.js       # Cloudflare R2 upload logic
├── public/           # Frontend UI
├── uploads/          # Temporary uploaded files
├── .env              # R2 credentials (excluded from Git)
├── .gitignore        # Ignore /private and /uploads
└── README.md         # Project documentation
```

## Best Practices

* Only `.zip` files should be uploaded.
* Files are automatically deleted from `/uploads` after successful R2 upload.
* Use environment variables to store credentials securely.
* Keep `/private` folder for local development and tests; it's ignored by Git.

## Troubleshooting

* **Upload stuck?** Make sure the file is under 5GB and your R2 credentials are correct.
* **Progress not updating?** Confirm your frontend is polling the `/progress/:fileName` endpoint correctly.

## License

This project is licensed under the MIT License.

---

Created by Rizky Alfi — Contributions welcome!
