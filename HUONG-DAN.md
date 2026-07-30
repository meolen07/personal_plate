# Hướng dẫn hoàn thành & chạy PersonalPlate

Tài liệu này hướng dẫn **từng bước** để cấu hình, chạy, và dùng tính năng **Personalized Recipe Recommendation** (gợi ý món theo hồ sơ + phát hiện nguyên liệu từ video).

> Tài liệu kỹ thuật tiếng Anh: xem [`README.md`](./README.md).

---

## Mục lục

1. [Điều kiện tiên quyết](#1-điều-kiện-tiên-quyết)
2. [Mở / clone dự án](#2-mở--clone-dự-án)
3. [Tạo dự án Supabase & chạy SQL](#3-tạo-dự-án-supabase--chạy-sql)
4. [Tạo Storage bucket (ảnh món ăn)](#4-tạo-storage-bucket-ảnh-món-ăn)
5. [Lấy API keys](#5-lấy-api-keys)
6. [Cấu hình `.env.local`](#6-cấu-hình-envlocal)
7. [Cài đặt & chạy local](#7-cài-đặt--chạy-local)
8. [Migration cho database đã có sẵn](#8-migration-cho-database-đã-có-sẵn)
9. [Dùng hồ sơ sức khỏe (Profile)](#9-dùng-hồ-sơ-sức-khỏe-profile)
10. [Upload video / phát hiện nguyên liệu](#10-upload-video--phát-hiện-nguyên-liệu)
11. [Nhận gợi ý cá nhân hóa](#11-nhận-gợi-ý-cá-nhân-hóa)
12. [Chạy test](#12-chạy-test)
13. [Deploy lên Vercel](#13-deploy-lên-vercel)
14. [Xử lý lỗi thường gặp](#14-xử-lý-lỗi-thường-gặp)
15. [Checklist việc bạn phải làm thủ công](#15-checklist-việc-bạn-phải-làm-thủ-công)

---

## 1. Điều kiện tiên quyết

| Thành phần | Yêu cầu |
|------------|---------|
| **Node.js** | **18+** (khuyến nghị 20 LTS). Kiểm tra: `node -v` |
| **npm** | Đi kèm Node. Kiểm tra: `npm -v` |
| **Tài khoản Supabase** | [supabase.com](https://supabase.com/) — Auth + PostgreSQL + Storage |
| **Google AI Studio** | [aistudio.google.com](https://aistudio.google.com/) — Gemini API key |
| **Spoonacular** | [spoonacular.com/food-api](https://spoonacular.com/food-api) — tìm ứng viên món ăn |
| **USDA (tuỳ chọn)** | [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup.html) — bổ sung dinh dưỡng |
| **Redis (tuỳ chọn)** | URL Redis nếu muốn cache dùng chung giữa nhiều instance |

---

## 2. Mở / clone dự án

```bash
cd /path/to/personal_plate
# hoặc clone repo rồi:
# git clone <url-repo> && cd personal_plate
```

Mở thư mục này trong Cursor / VS Code.

---

## 3. Tạo dự án Supabase & chạy SQL

### 3.1. Tạo project

1. Đăng nhập [supabase.com](https://supabase.com/) → **New project**
2. Đặt tên, mật khẩu DB, chọn region gần bạn
3. Đợi project sẵn sàng

### 3.2. Chạy SQL theo đúng thứ tự

Vào **SQL Editor** → New query → dán nội dung từng file → **Run**.

#### Cài mới (fresh install)

Chạy **một lần** file schema đầy đủ:

| Thứ tự | File | Mục đích |
|--------|------|----------|
| **1** | `supabase-schema.sql` | Bảng `profiles` (kèm field recommend), `recipes`, `fridge_items` + RLS + index |

Sau đó chạy Storage (bước 4):

| Thứ tự | File | Mục đích |
|--------|------|----------|
| **2** | `recipe-images-storage.sql` | Bucket `recipe-images` + policies |

> Với cài mới, **không bắt buộc** chạy `fridge-items-migration.sql` hay `profile-recommendation-fields-migration.sql` vì chúng đã nằm trong `supabase-schema.sql`.

#### Database đã có từ trước (existing DB)

Nếu bạn đã chạy schema cũ trước khi có tính năng recommend, chạy **theo thứ tự**:

| Thứ tự | File | Mục đích |
|--------|------|----------|
| **1** | `fridge-items-migration.sql` | Bảng Virtual Fridge (nếu chưa có) |
| **2** | `recipe-images-storage.sql` | Bucket ảnh món |
| **3** | `profile-recommendation-fields-migration.sql` | Thêm `activity_level`, `target_calories`, `budget_usd`, `preferred_foods`, `disliked_foods` |

### 3.3. Bật Email Auth

**Authentication → Providers → Email** → Enable.

### 3.4. Lấy URL & anon key

**Project Settings → API**:

- `Project URL` → dùng cho `NEXT_PUBLIC_SUPABASE_URL`
- `anon` / `public` key → dùng cho `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 4. Tạo Storage bucket (ảnh món ăn)

Cách khuyến nghị: chạy file SQL `recipe-images-storage.sql` (đã tạo bucket `recipe-images` public + RLS theo user folder).

Kiểm tra nhanh:

1. **Storage** → thấy bucket `recipe-images`
2. Bucket nên để **Public** (để hiển thị ảnh trên UI)

Nếu tạo tay trên Dashboard:

1. **Storage → New bucket** → tên `recipe-images` → Public
2. Vẫn nên chạy phần **policies** trong `recipe-images-storage.sql` để user chỉ upload vào folder của mình

---

## 5. Lấy API keys

### 5.1. Gemini (bắt buộc)

1. Mở [Google AI Studio](https://aistudio.google.com/)
2. **Get API key** → tạo key
3. Gán vào `GEMINI_API_KEY`
4. (Tuỳ chọn) tạo thêm key thứ hai → `GEMINI_API_KEY_FALLBACK`
5. (Tuỳ chọn) nếu dùng tạo ảnh phía trình duyệt → cùng key vào `NEXT_PUBLIC_GEMINI_API_KEY`

Dùng cho: sinh món (`/api/generate-recipes`), detect video (`/api/ingredients/detect`), xếp hạng (`/api/recipes/recommend`).

### 5.2. Spoonacular (bắt buộc cho Recommend)

1. Đăng ký [Spoonacular Food API](https://spoonacular.com/food-api)
2. Copy API key → `SPOONACULAR_API_KEY`

Không có key này, trang `/recommend` / API `/api/recipes/recommend` sẽ trả lỗi (thường `503`).

### 5.3. USDA (tuỳ chọn)

1. Đăng ký tại [FoodData Central API](https://fdc.nal.usda.gov/api-key-signup.html)
2. Gán `USDA_API_KEY`

App vẫn chạy khi thiếu USDA; chỉ bỏ qua bước bổ sung dinh dưỡng khi Spoonacular thiếu data.

### 5.4. Redis (tuỳ chọn)

Nếu có Redis (Upstash, Redis Cloud, local…):

```env
REDIS_URL=redis://default:PASSWORD@HOST:PORT
```

Không có Redis → app dùng **cache in-memory** (OK cho local / single instance).

---

## 6. Cấu hình `.env.local`

```bash
cp .env.example .env.local
```

Mở `.env.local` và điền từng biến:

| Biến | Bắt buộc? | Giải thích |
|------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Có** | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Có** | Anon key (client + middleware auth) |
| `GEMINI_API_KEY` | **Có** | Key Gemini server-side |
| `GEMINI_API_KEY_FALLBACK` | Không | Key Gemini dự phòng khi hết quota |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Khuyến nghị nếu dùng ảnh | Key Gemini cho tạo ảnh trên browser |
| `SPOONACULAR_API_KEY` | **Có** (cho Discover/Rank) | Tìm ứng viên món |
| `USDA_API_KEY` | Không | Bổ sung dinh dưỡng |
| `REDIS_URL` | Không | Cache chia sẻ; để trống = in-memory |

**Không** commit file `.env.local`. Không bịa / hard-code API key giả vào code.

---

## 7. Cài đặt & chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

Luồng kiểm tra nhanh:

1. **Sign up / Sign in** tại `/login`
2. Điền **Profile** tại `/profile`
3. Thêm vài nguyên liệu vào **Fridge** tại `/fridge`
4. Vào **Recommend** (`/recommend`) — Spoonacular + ranking (+ video); Save → History
5. Expand card để xem instructions (fetch detail nếu thiếu); mở `/history` để xem món đã lưu

Đường dẫn cũ `/discover` tự redirect sang `/recommend`.

---

## 8. Migration cho database đã có sẵn

Nếu profile form báo lỗi cột không tồn tại (ví dụ `activity_level`, `preferred_foods`):

1. Mở Supabase **SQL Editor**
2. Chạy `profile-recommendation-fields-migration.sql`
3. Refresh trang Profile và lưu lại

Nếu Virtual Fridge lỗi bảng không tồn tại → chạy `fridge-items-migration.sql`.

---

## 9. Dùng hồ sơ sức khỏe (Profile)

Vào `/profile` và điền:

| Trường | Ảnh hưởng |
|--------|-----------|
| Allergies / Medical conditions / Medications / Dietary restrictions | An toàn món, lọc / cảnh báo |
| Height + Weight | BMI **tính trên UI**, **không lưu** cột BMI trong DB |
| Activity level | Gợi ý / ranking phù hợp mức vận động |
| Target calories (per meal) | Ưu tiên món gần mục tiêu kcal |
| Budget (USD per meal) | Ưu tiên món trong ngân sách (khi có dữ liệu giá) |
| Preferred / Disliked foods | Tăng / giảm điểm khi ranking |
| Nutrition goals / Preferred cuisine | Context cho AI |

Sau khi **Save Profile**, pipeline recommend đọc hồ sơ từ Supabase (RLS: chỉ user đó).

---

## 10. Upload video / phát hiện nguyên liệu

### Cách dùng trên UI (khuyến nghị)

1. Vào `/recommend`
2. Chọn file video (**mp4 / mov / webm**, khoảng tối đa **20MB**)
3. (Tuỳ chọn) thêm nguyên liệu thủ công + bật **Include Virtual Fridge**
4. Bấm **Discover Recipes**

Pipeline sẽ:

1. Gọi Gemini detect nguyên liệu từ video (nếu có)
2. Gộp với nguyên liệu tay + fridge
3. Tìm ứng viên Spoonacular → (tuỳ chọn) USDA → Gemini rank

Kết quả detection (tên, số lượng ước tính, confidence, tools, cooking method) hiện ngay trên trang.

### API riêng (nếu cần)

`POST /api/ingredients/detect` — multipart, field `video` hoặc `file`, **bắt buộc đăng nhập**.

```bash
curl -X POST http://localhost:3000/api/ingredients/detect \
  -H "Cookie: <supabase-auth-cookie>" \
  -F "video=@./tu-lanh.mp4"
```

---

## 11. Nhận gợi ý cá nhân hóa

### Recommend — Spoonacular + Gemini

- URL: `/recommend`
- API: `POST /api/recipes/recommend`
- Chi tiết món: expand card; nếu thiếu bước nấu → `GET /api/recipes/[id]`
- Cần: `GEMINI_API_KEY` + `SPOONACULAR_API_KEY` (+ USDA/Redis tuỳ chọn)
- Input tối thiểu: **ít nhất một** trong: video, nguyên liệu tay, hoặc fridge (khi bật include)
- **Lưu History:** nút **Save Recipe** trên card → `POST /api/save-recipe` (payload ranked được map server-side) → xem lại tại `/history`

Ví dụ JSON:

```bash
curl -X POST http://localhost:3000/api/recipes/recommend \
  -H "Content-Type: application/json" \
  -H "Cookie: <supabase-auth-cookie>" \
  -d '{
    "ingredients": ["chicken breast", "broccoli", "garlic"],
    "includeFridge": true,
    "maxReadyTime": 35
  }'
```

Response gồm `id`, `instructions` (khi Spoonacular có), `score`, nutrition, matched/missing ingredients.

API cũ `POST /api/generate-recipes` (Gemini thuần) vẫn còn trong codebase nhưng không còn trên UI Recommend.

### Phạm vi không làm (đã chốt)

- Không thêm cột `fitness_goal` (dùng `nutrition_goals` + `activity_level` + BMI)
- Không meal plan nhiều ngày
- Không Zod validation
- Không cache toàn bộ response recommend (chỉ cache từng lớp Spoonacular / USDA / rank)
---

## 12. Chạy test

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run lint      # eslint
```

Watch mode: `npm run test:watch`.

Các test cover helpers ranking/save-ranked, profile readiness, USDA/Spoonacular mocks, cache, BMI, và route `/api/ingredients/detect`, `/api/recipes/recommend`, `/api/recipes/[id]`, `/api/save-recipe`.

---

## 13. Deploy lên Vercel

1. Push repo lên GitHub
2. Import project trên [vercel.com](https://vercel.com/)
3. **Environment Variables** — thêm biến từ `.env.example` (bắt buộc vs tuỳ chọn: [docs/deploy-checklist.md](docs/deploy-checklist.md))
4. Supabase: chạy SQL đúng thứ tự, bucket `recipe-images`, cập nhật **Site URL** + **Redirect URLs** trỏ domain Vercel
5. Deploy (khuyến nghị set `REDIS_URL` trên Vercel)

Lưu ý:

- Biến `GEMINI_API_KEY`, `SPOONACULAR_API_KEY`, `USDA_API_KEY`, `REDIS_URL` chỉ server-side
- Prefixed `NEXT_PUBLIC_*` sẽ expose ra browser
- Sau khi đổi env trên Vercel → **Redeploy**
- Nên dùng Redis trên production multi-instance để cache ổn định hơn

Checklist ngắn EN/VI: **[docs/deploy-checklist.md](docs/deploy-checklist.md)**.

Build local trước khi deploy:

```bash
npm run build
npm start
```

---

## 14. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|-------------|------------------------|------------|
| Redirect về `/login` | Chưa đăng nhập / session hết | Sign in lại; kiểm tra Supabase URL/key |
| `Unauthorized` (401) trên API | Cookie auth thiếu | Gọi API từ browser đã login, hoặc kèm cookie |
| Lỗi cột profile / không lưu được field mới | Chưa chạy migration | Chạy `profile-recommendation-fields-migration.sql` |
| Fridge lỗi bảng | Chưa có `fridge_items` | Chạy `fridge-items-migration.sql` hoặc schema đầy đủ |
| Upload ảnh fail | Chưa có bucket / policy | Chạy `recipe-images-storage.sql` |
| `503` / missing API key | Thiếu Gemini hoặc Spoonacular | Điền `.env.local`, restart `npm run dev` |
| `429` quota | Hết hạn mức API | Đợi reset quota, dùng `GEMINI_API_KEY_FALLBACK`, hoặc nâng plan |
| `502` invalid AI JSON | Model trả JSON lệch | Thử lại; kiểm tra video rõ nét hơn |
| `400` “Provide at least one ingredient…” | Không có nguyên liệu nào | Thêm tay, bật fridge, hoặc upload video có đồ ăn |
| Rank trống / no recipes | Spoonacular không match | Đổi nguyên liệu, bỏ `maxReadyTime` quá thấp |
| Video reject | Sai định dạng / quá lớn | Dùng mp4/mov/webm ≤ ~20MB |
| Redis lỗi kết nối | `REDIS_URL` sai | Sửa URL hoặc để trống để dùng in-memory |

App **không** dùng mock data giả làm đường chính. Khi API ngoài fail, UI/API trả lỗi rõ ràng (trừ heuristic fallback khi Gemini ranking fail sau khi đã có candidates Spoonacular).

---

## 15. Checklist việc bạn phải làm thủ công

Phần **code** đã sẵn sàng. Bạn vẫn cần tự làm:

- [ ] Cài Node 18+
- [ ] Tạo project Supabase
- [ ] Chạy SQL đúng thứ tự (fresh: `supabase-schema.sql` → `recipe-images-storage.sql`; existing: fridge → storage → profile migration)
- [ ] Bật Email Auth trên Supabase
- [ ] Copy URL + anon key
- [ ] Tạo Gemini API key
- [ ] Tạo Spoonacular API key
- [ ] (Tuỳ chọn) USDA + Redis
- [ ] `cp .env.example .env.local` và điền giá trị thật
- [ ] `npm install` → `npm run dev`
- [ ] Đăng ký user, điền Profile, thêm Fridge
- [ ] Thử Recommend (có/không video)
- [ ] (Tuỳ chọn) Deploy Vercel + gắn env production

---

## Liên kết nhanh trong app

| Đường dẫn | Việc làm |
|-----------|----------|
| `/login` | Đăng ký / đăng nhập |
| `/profile` | Hồ sơ sức khỏe & preference recommend |
| `/fridge` | Virtual Fridge |
| `/recommend` | Gợi ý món (Spoonacular + ranking + video) |
| `/history` | Món đã lưu |
| `/api/ingredients/detect` | Detect video (API) |
| `/api/recipes/recommend` | Recommend pipeline (API) |
| `/api/recipes/[id]` | Chi tiết món Spoonacular (instructions) |
| `/api/save-recipe` | Lưu món ranked → History |
