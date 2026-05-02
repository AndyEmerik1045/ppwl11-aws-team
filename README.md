# Laporan PPWL11 — Andy Emerik (asdos)
**Akun AWS:** andy-em (Account ID: 6772-7611-4550)  
**Deadline:** Minggu, 3 Mei 2026 pukul 23:59  
**Status:** ✅ Selesai sebelum deadline

---

## Ringkasan Objektif

| Objektif | Status | URL |
|---|---|---|
| Frontend root tampil data dari backend | ✅ Berhasil | https://d19so62jqae216.cloudfront.net |
| Frontend /classroom bisa login Google & tampil data | ✅ Berhasil | https://d19so62jqae216.cloudfront.net/classroom |
| Backend /users?key=learn dapat akses | ✅ Berhasil | https://sas64m4znsi4bbwvcn7iiu3rte0rcrap.lambda-url.us-east-1.on.aws/users?key=learn |
| Backend /users tanpa key → Unauthorized | ✅ Berhasil | https://sas64m4znsi4bbwvcn7iiu3rte0rcrap.lambda-url.us-east-1.on.aws/users |

---

## Resource AWS yang Digunakan

| Komponen | Resource | Keterangan |
|---|---|---|
| **Database** | RDS `monorepo-db` (us-east-1b) | Dipakai bersama tim, tidak dibuat ulang |
| **SSM Parameter Store** | `/asdos/*` (7 parameter) | Dibuat sendiri di akun andy-em |
| **Lambda** | `asdos-backend` (us-east-1) | Dibuat baru, Node.js 22.x |
| **S3** | `s3-asdos-frontend-2025` (us-east-1) | Dibuat baru, public access |
| **CloudFront** | `asdos-fe-dist` | Domain: d19so62jqae216.cloudfront.net |

---

## Progress Per Fase

---

### Fase 0 — Persiapan Awal

**Status: ✅ Selesai**

- Login ke AWS Console menggunakan akun `asdos` (Administrator) yang diberikan dosen
- Verifikasi RDS `monorepo-db` sudah Available dan bisa dipakai bersama
- Catat endpoint RDS: `monorepo-db.cq56a8ueg13r.us-east-1.rds.amazonaws.com`
- Dosen memberikan akun baru `andy-em` (limited policy: Lambda + S3/CloudFront) karena akun `asdos` tidak bisa membuat CloudFront (error akun belum verified)

**Catatan:** Dosen menghapus semua instance lama (S3, Lambda, CloudFront) dan meminta pengerjaan ulang dari awal menggunakan akun `andy-em`.

---

### Fase 1 — Setup SSM Parameter Store

**Status: ✅ Selesai (dengan catatan)**

**Yang dikerjakan:**
- Awalnya membuat parameter `/asdos/*` di akun `asdos` — kemudian diketahui tidak bisa dibaca dari Lambda di akun `andy-em` karena beda akun AWS
- Dosen menambahkan policy `AmazonSSMFullAccess` ke user `andy-em`
- Membuat ulang 7 parameter `/asdos/*` di akun `andy-em`

**Parameter yang dibuat di akun `andy-em`:**

| Nama Parameter | Tipe | Keterangan |
|---|---|---|
| `/asdos/GOOGLE_CLIENT_ID` | String | Google OAuth Client ID milik sendiri |
| `/asdos/GOOGLE_CLIENT_SECRET` | SecureString | Google OAuth Client Secret milik sendiri |
| `/asdos/GOOGLE_REDIRECT_URI` | String | Lambda callback URL |
| `/asdos/FRONTEND_URL` | String | CloudFront URL |
| `/asdos/DATABASE_URL` | SecureString | PostgreSQL RDS connection string |
| `/asdos/JWT_SECRET` | SecureString | Secret untuk signing JWT |
| `/asdos/API_KEY` | SecureString | `learn` untuk akses endpoint /users |

**Catatan penting:**
- SSM Parameter Store berhasil dibuat, namun Lambda tidak dapat membaca SecureString (JWT_SECRET, API_KEY, DATABASE_URL) karena ada masalah urutan load — Elysia JWT plugin diinisiasi sebelum `loadConfig()` selesai berjalan
- Solusi: menambahkan `JWT_SECRET`, `API_KEY`, dan `DATABASE_URL` langsung ke Lambda Environment Variables sebagai override
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` juga ditambahkan ke env vars Lambda karena `loadConfig()` tidak reliable sebelum app Elysia dibuat

---

### Fase 2 — Build & Deploy Lambda Backend (Elysia)

**Status: ✅ Selesai**

**Modifikasi file yang dilakukan:**

1. **`src/config.ts`** — Diubah dari path `/monorepo/*` ke `/asdos/*`, dan ditambahkan logika agar tidak menimpa env vars yang sudah ada (`if (key && !process.env[key])`)
2. **`prisma/schema-postgres.prisma`** — Sudah ada, tidak perlu diubah
3. **`prisma/dbPostgre.ts`** — Sudah ada, tidak perlu diubah
4. **`src/lambda.ts`** — Sudah ada, tidak perlu diubah
5. **`src/index.ts`** — Sudah ada, tidak perlu diubah
6. **`prisma.config.ts`** — Di-backup sementara saat proses build karena menyebabkan error `Cannot find module 'prisma/config'`

**Proses build:**
```sh
# Generate Prisma client PostgreSQL
bunx prisma generate --schema prisma/schema-postgres.prisma

# Install dependency tambahan
bun add @aws-sdk/client-ssm @prisma/adapter-pg @elysiajs/jwt

# Build bundle Lambda
mv prisma.config.ts prisma.config.ts.bak
bun build src/lambda.ts --outdir dist-lambda --target node --format cjs --external prisma
mv prisma.config.ts.bak prisma.config.ts

# Copy file pendukung
cp -r src/generated/prisma-pg dist-lambda/generated/prisma-pg
mkdir -p cert && curl -o cert/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
mkdir -p dist-lambda/cert && cp cert/global-bundle.pem dist-lambda/cert

# ZIP — hasil: lambda-backend.zip ~3.3MB
cd dist-lambda && zip -r ../lambda-backend.zip . && cd ..
```

**Kendala yang ditemui:**
- `node_modules` tidak terbuat di root project karena bun hoisting — diatasi dengan `bun install --force` dari root dan memastikan tidak ada duplicate key di `package.json` backend
- Duplicate key `dev:turso` di `package.json` menyebabkan bun install gagal diam-diam — dihapus satu baris duplikat

**Konfigurasi Lambda di AWS Console:**

| Setting | Nilai |
|---|---|
| Function name | `asdos-backend` |
| Runtime | Node.js 22.x |
| Architecture | x86_64 |
| Handler | `lambda.handler` |
| Memory | 512 MB |
| Timeout | 1 menit |
| Auth type (Function URL) | NONE |

**Environment Variables Lambda:**

| Key | Keterangan |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | https://sas64m4znsi4bbwvcn7iiu3rte0rcrap.lambda-url.us-east-1.on.aws/auth/callback |
| `FRONTEND_URL` | https://d19so62jqae216.cloudfront.net |
| `DATABASE_URL` | postgresql://postgres:***@monorepo-db.cq56a8ueg13r.us-east-1.rds.amazonaws.com:5432/monorepo_prod |
| `JWT_SECRET` | (disembunyikan) |
| `API_KEY` | learn |
| `NODE_ENV` | production |

**IAM Permissions yang ditambahkan ke Lambda Role (`asdos-backend-role-4b9hmvcy`):**
- `AmazonSSMReadOnlyAccess` — untuk baca SSM Parameter Store
- `kmsDecryptPolicy` (inline) — untuk dekripsi SecureString

**Function URL:** `https://sas64m4znsi4bbwvcn7iiu3rte0rcrap.lambda-url.us-east-1.on.aws/`

**Hasil test:**
- ✅ `GET /` → `{"data":{"status":"ok"},"message":"server running"}`
- ✅ `GET /users?key=learn` → Data 3 user dari RDS PostgreSQL
- ✅ `GET /users` (tanpa key) → `{"message":"Unauthorized: Access denied without valid API Key"}`
- ✅ `GET /auth/login` → Redirect ke Google OAuth

---

### Fase 3 — Build & Deploy Frontend (React + Vite → S3 + CloudFront)

**Status: ✅ Selesai**

**Modifikasi file yang dilakukan:**

1. **`src/App3.tsx`** — Diganti dari versi lama (session cookie) ke versi baru (JWT token dari URL). Perbaikan utama: `window.history.replaceState({}, document.title, "/classroom")` agar token dari URL tidak hilang saat redirect
2. **`.env.production`** — Dibuat baru dengan VITE_BACKEND_URL dan VITE_CHECK

**Proses build frontend:**
```sh
cd apps/frontend

# Buat env file
cat > .env.production << 'EOF'
VITE_BACKEND_URL=https://sas64m4znsi4bbwvcn7iiu3rte0rcrap.lambda-url.us-east-1.on.aws
VITE_CHECK=ok
EOF

# Build
bunx vite build
# Output: apps/frontend/dist/
```

**Kendala yang ditemui:**
- Error `env is not detected` saat build — karena `vite.config.ts` memerlukan `VITE_CHECK` untuk validasi env. Diatasi dengan menambahkan `VITE_CHECK=ok` ke `.env.production`

**Setup S3:**
- Bucket name: `s3-asdos-frontend-2025` (nama `s3-asdos-frontend-prod` sudah dipakai global)
- Block all public access: OFF
- Bucket Policy: `s3:GetObject` untuk semua (`*`)
- Static website hosting: Enable, index & error document: `index.html`

**Upload ke S3:**
```sh
# Upload assets dengan cache 1 tahun
aws s3 sync dist/ s3://s3-asdos-frontend-2025/ --cache-control "max-age=31536000" --exclude "index.html"

# Upload index.html tanpa cache (penting untuk SPA)
aws s3 cp dist/index.html s3://s3-asdos-frontend-2025/index.html --cache-control "no-cache, no-store"
```

**Setup CloudFront:**

| Setting | Nilai |
|---|---|
| Distribution name | `asdos-fe-dist` |
| S3 origin | `s3-asdos-frontend-2025.s3.us-east-1.amazonaws.com` |
| Viewer protocol | Redirect HTTP to HTTPS |
| WAF | Disabled (berbayar, tidak diperlukan) |
| Error pages | 403 & 404 → `/index.html` → HTTP 200 (penting untuk React Router SPA) |

**CloudFront URL:** `https://d19so62jqae216.cloudfront.net`

**Setelah CloudFront deploy, update:**
- `FRONTEND_URL` di Lambda env vars → `https://d19so62jqae216.cloudfront.net`
- `/asdos/FRONTEND_URL` di SSM → `https://d19so62jqae216.cloudfront.net`

**Kendala yang ditemui:**
- App3.tsx masih versi lama (session cookie) sehingga token JWT dari URL tidak tersimpan ke localStorage — diganti dengan versi baru yang menggunakan JWT Bearer token
- `window.history.replaceState` di App3.tsx versi lama mengubah URL ke `"/"` sehingga React Router render App2 (halaman default), bukan App3 (classroom) — diperbaiki ke `"/classroom"`
- Setelah ganti App3.tsx, perlu build ulang dan upload ulang ke S3, diikuti CloudFront invalidation `/*`

**Hasil test akhir:**
- ✅ `https://d19so62jqae216.cloudfront.net` → Tampil User List dengan data dari RDS
- ✅ `https://d19so62jqae216.cloudfront.net/classroom` → Tampil halaman login Google
- ✅ Login Google → Redirect ke `/classroom` dengan token → Tampil daftar mata kuliah
- ✅ Klik mata kuliah → Tampil daftar tugas beserta status, skor, lampiran

---

## Yang Belum Dikerjakan / Catatan

| Item | Status | Keterangan |
|---|---|---|
| SSM sebagai satu-satunya sumber konfigurasi | ❌ Tidak berhasil penuh | JWT_SECRET, DATABASE_URL, Google credentials tetap perlu di env vars Lambda karena masalah timing inisiasi Elysia |
| Keamanan ideal (tidak ada secret di env vars Lambda) | ⚠️ Sebagian | Secret ada di Lambda env vars, SSM dibuat tapi tidak sepenuhnya digunakan sebagai sumber utama |
| AWS Budgets | ❌ Tidak dikerjakan | Bukan bagian dari tugas  individu ini |

---

## Alur OAuth yang Berjalan

```
User buka /classroom
    → Klik "Login dengan Google"
    → window.location.href ke Lambda /auth/login
    → Lambda redirect ke accounts.google.com (Google OAuth)
    → User pilih akun & izinkan
    → Google redirect ke GOOGLE_REDIRECT_URI (/auth/callback)
    → Lambda exchange code → dapat access_token
    → Lambda sign JWT dengan access_token
    → Lambda redirect ke FRONTEND_URL/classroom?token=JWT
    → React App3.tsx baca token dari URL
    → Simpan ke localStorage
    → Validasi ke /auth/me dengan Authorization: Bearer header
    → Jika valid → load daftar courses dari /classroom/courses
    → Tampil di UI
```

---

## Catatan Teknis Penting

1. **Monorepo + Bun Workspace:** Package di-hoist ke root `.bun` cache. Build Lambda harus dijalankan dari root project.

2. **prisma.config.ts:** Perlu di-backup saat generate schema-postgres karena konflik. Setelah generate, kembalikan.

3. **Cross-account SSM:** Lambda di akun A tidak bisa baca SSM di akun B. Solusi: buat SSM di akun yang sama dengan Lambda.

4. **Lambda cold start + SSM timing:** `loadConfig()` berjalan async, tapi cached Lambda container menyebabkan `isLoaded = true` dari invokasi sebelumnya. Solusi: set env vars langsung di Lambda sebagai primary source.

5. **React Router SPA + CloudFront:** Error pages 403 dan 404 harus di-redirect ke `index.html` dengan response code 200 agar refresh halaman di path selain `/` tidak menghasilkan 403.

6. **App3.tsx replaceState:** Setelah token dibaca dari URL, `replaceState` harus ke `/classroom` bukan `/` agar React Router tetap render komponen yang benar dan token tersimpan ke localStorage.
