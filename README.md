<div align="center">
  <img src="https://storage.bosmudasky.com/wp-content/uploads/2025/07/image.png" alt="UploaderCloudflareR2 Logo" width="1000" />

  <br />

  <img src="https://skillicons.dev/icons?i=nodejs,express,javascript,html,css" alt="Tech Stack Icons" />
</div>

# UploaderCloudflareR2

UploaderCloudflareR2 is a lightweight backend application built with Node.js and Express that allows users to upload large files (up to 5GB or more) from a web frontend directly to **Cloudflare R2**, using AWS SDK v3's presigned multipart upload streaming capability.

# R2 Uploader - Cloudflare R2 File Manager

Aplikasi web lengkap untuk mengelola file di Cloudflare R2 Object Storage dengan antarmuka yang modern dan mudah digunakan.

## Features

- 📤 **Upload ZIP files** ke Cloudflare R2 dengan progress tracking
- 📂 **Browse & Download** file dari R2 bucket  
- 🔗 **Generate Signed URLs** dengan expiry time yang bisa dikustomisasi
- 🧹 **R2 Cleaner** untuk cleanup multipart uploads yang gagal
- 🎨 **Modern UI** dengan design konsisten

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Cloudflare R2 Credentials

Copy file `.env.example` ke `.env` dan isi dengan credentials R2 Anda:

```bash
copy .env.example .env
```

Edit file `.env`:
```env
R2_ACCOUNT_ID=your-account-id-here
R2_ACCESS_KEY=your-access-key-here  
R2_SECRET_KEY=your-secret-key-here
R2_BUCKET_NAME=your-bucket-name-here
```

### 3. Cara Mendapatkan R2 Credentials

1. **Login ke Cloudflare Dashboard** → R2 Object Storage
2. **Buat bucket** atau gunakan yang sudah ada (untuk `R2_BUCKET_NAME`)
3. **Buat API Token:**
   - Go to **Manage R2 API tokens** → **Create API token**
   - Pilih permission yang diperlukan
   - Copy **Account ID** (untuk `R2_ACCOUNT_ID`)
   - Copy **Access Key ID** (untuk `R2_ACCESS_KEY`)
   - Copy **Secret Access Key** (untuk `R2_SECRET_KEY`)

## Running the Application

### Start Server
```bash
node upload-server.js
```

Server akan berjalan di http://localhost:3000

### Available Pages

- **Upload:** http://localhost:3000/index.html - Upload ZIP files
- **Download:** http://localhost:3000/download.html - Browse dan download files  
- **Generate URL:** http://localhost:3000/generate.html - Buat signed download URLs
- **R2 Cleaner:** http://localhost:3000/r2-cleaner.html - Cleanup stuck uploads

## Generate URL Features

### Expiry Options
- **5 menit** - URL kadaluarsa dalam 5 menit
- **15 menit** - URL kadaluarsa dalam 15 menit  
- **1 jam** - URL kadaluarsa dalam 1 jam (default)
- **1 hari** - URL kadaluarsa dalam 24 jam
- **Custom** - Masukkan jumlah detik manual (max 7 hari)

### Usage
1. Pilih file dari dropdown (otomatis dimuat dari R2)
2. Pilih masa kadaluarsa URL
3. Klik **Generate URL**
4. Copy URL atau buka langsung di browser baru

## Troubleshooting

### Error 500 pada /files
- **Penyebab:** R2 credentials tidak valid atau bucket tidak ada
- **Solusi:** Periksa file `.env` dan pastikan semua values benar

### "Missing required environment variables"
- **Penyebab:** File `.env` tidak ada atau kosong  
- **Solusi:** Copy dari `.env.example` dan isi dengan credentials yang benar

### "Upload failed" 
- **Penyebab:** Bucket permission atau network issue
- **Solusi:** Cek R2 API token permissions dan koneksi internet

## License

This project is licensed under the MIT License.

---

Created by Rizky Alfi — Contributions welcome!
