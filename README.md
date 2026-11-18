# PWA Login Boilerplate: Next.js 16 + iron-session + r6auth SSO

## 1. ภาพรวม

Boilerplate สำหรับเริ่มโปรเจกต์เว็บภายในของ กปภ.ข.6 ด้วย Next.js 16 (App Router), iron-session, Drizzle ORM + PostgreSQL และ Tailwind โดยมี

- **พนักงานเข้าสู่ระบบผ่าน r6auth** (ระบบ login กลางของ กปภ.ข.6 ที่ต่อ Keycloak ส่วนกลาง) แอปไม่มีหน้ากรอกรหัสผ่านของพนักงานและไม่เคยเห็นรหัสผ่าน ผู้ใช้ที่ login แอปอื่นของเขตอยู่แล้วจะเข้าได้ทันที (single sign-on)
- **Local admin (break-glass)** ตาราง `local_admins` แยกต่างหาก ใช้ได้แม้ r6auth ล่ม
- **บัญชีลูกจ้าง (contractor)** สำหรับคนที่ไม่มีบัญชี กปภ. ผู้ดูแลสร้างให้ มีช่วงสัญญาและบังคับเปลี่ยนรหัสผ่าน
- **Registration mode / approval queue**: เลือกได้ว่าพนักงานใหม่เข้าได้ทันที หรือต้องรอผู้ดูแลอนุมัติ
- **RBAC**: ตาราง `roles` / `user_roles`, ผูก **ศูนย์ต้นทุน (costcenter) กับ role** อัตโนมัติที่หน้า `/admin/cost-center-roles`
- **จำกัด BA** ที่เข้าแอปได้ผ่าน `R6AUTH_ALLOWED_BA`
- **Throttle ใน Postgres** สำหรับการเข้าด้วยรหัสผ่าน (ลูกจ้าง / local admin): ผิด 5 ครั้งต่อ `username|IP` รอ 60 วินาที
- **r6auth จำลอง** (`R6AUTH_FAKE=true`) สำหรับพัฒนาในเครื่องโดยไม่ต้องลงทะเบียนแอป

> หมายเหตุ: ชื่อ "PWA" ในที่นี้คือ **การประปาส่วนภูมิภาค** (Provincial Waterworks Authority) ไม่ใช่ Progressive Web App

Repo นี้แยกมาจาก boilerplate รุ่น LDAP (bind AD เอง) โดยเปลี่ยนทางของพนักงานเป็น r6auth และเก็บส่วนอื่นไว้ครบ

---

## 2. ความต้องการของระบบ

| รายการ | ค่า |
|---|---|
| Node.js | 22 ขึ้นไป |
| pnpm | 11 (ดู `packageManager` ใน `package.json`; เปิดด้วย `corepack enable`) |
| PostgreSQL | 17 (มี `docker-compose.yml` ให้) |
| เครือข่าย | **backend** ต้องต่อ `https://reg6apps.pwa.co.th` ได้ (แลก code ฝั่ง server) |
| แอปที่ลงทะเบียนแล้ว | `client_id` + `client_secret` จาก r6auth (ดูข้อ 3) ไม่ต้องใช้ตอนพัฒนาด้วย `R6AUTH_FAKE` |

r6auth ใช้ใบรับรอง DigiCert ซึ่ง Node เชื่ออยู่แล้ว ไม่ต้องตั้ง CA

---

## 3. ลงทะเบียนแอปกับ r6auth

1. เปิด `https://reg6apps.pwa.co.th/r6auth/apps.php` (ต้อง login ด้วยบัญชีที่ BA ได้รับอนุญาต) กด "ลงทะเบียนแอปใหม่"
2. กรอก `client_id` (ตัวพิมพ์เล็ก `a-z 0-9 -` ยาว 3-40 ตัว **เปลี่ยนภายหลังไม่ได้**) และ URL ให้ **ตรงทุกตัวอักษร** กับ env:

   | ช่องใน r6auth | env ของแอป | ตัวอย่าง |
   |---|---|---|
   | `redirect_uris` | `R6AUTH_REDIRECT_URI` | `https://my-app.pwa.co.th/api/auth/sso/callback` |
   | `post_logout_redirect_uris` | `R6AUTH_POST_LOGOUT_REDIRECT_URI` | `https://my-app.pwa.co.th/login` |

3. รอผู้ดูแล r6auth อนุมัติ แล้วกด **"สร้าง secret"** ในหน้าแอป คัดลอกเก็บทันที (แสดงครั้งเดียว) ใส่ใน `R6AUTH_CLIENT_SECRET`
4. ตรวจด้วย `pnpm r6auth:check` (แสดงค่าที่ต้องลงทะเบียนและ ping r6auth โดยไม่แสดง secret)

ทดสอบกับ r6auth ตัวจริงจากเครื่อง dev ได้ด้วย `http://localhost` แนะนำให้ลงทะเบียน **แอปแยก** สำหรับ dev (เช่น `my-app-dev`) และเปิดผ่าน `localhost` เท่านั้น (ไม่ใช่ `127.0.0.1`) เพราะ cookie และ `redirect_uri` ต้องตรงชื่อโฮสต์

---

## 4. เริ่มต้นใช้งาน (dev)

```bash
pnpm install
docker compose up -d postgres            # Postgres 17 ที่ localhost:5432
cp .env.example .env.local               # แก้ IRON_SESSION_PASSWORD (openssl rand -base64 48) และ R6AUTH_*
pnpm db:migrate                          # drizzle-kit migrate (อ่าน DATABASE_URL จาก .env.local)
pnpm create-local-admin -- --username admin --password '<รหัสผ่านที่แข็งแรง>'
pnpm seed-roles                          # role พื้นฐาน (Super Admin, Admin, Manager, User, Viewer)
pnpm seed-cost-centers                   # ชื่อศูนย์ต้นทุนจาก data/cost-centers.csv (ไฟล์ใน repo เป็นตัวอย่าง)
pnpm dev                                 # http://localhost:3000
```

`pnpm seed-settings` ตั้ง `registration_mode` เริ่มต้น (ไม่จำเป็น: ถ้าไม่มีค่าจะถือเป็น `allow_new_users`)

### พัฒนาโดยไม่ต่อ r6auth (`R6AUTH_FAKE=true`)

ใส่ใน `.env.local`:

```dotenv
R6AUTH_FAKE=true
```

- ปุ่ม "เข้าสู่ระบบด้วยบัญชี กปภ." จะพาไปหน้า `/dev/sso` (r6auth จำลอง) ให้เลือกผู้ใช้ทดสอบ แล้วเดินผ่าน callback และการแลก code ของแอปจริง
  - `10001` นายสมชาย ใจดี (BA `1059`, ศูนย์ต้นทุน `101932`)
  - `10002` นางสาวสมหญิง รักดี (BA `1059`, ศูนย์ต้นทุน `101931`)
  - `10003` นายสมศักดิ์ มั่นคง (BA `1060`, ศูนย์ต้นทุน `100405`) ใช้ทดสอบ `R6AUTH_ALLOWED_BA=1059`
  - "จำลองระบบล่ม" ได้ข้อความ "ระบบยืนยันตัวตนไม่พร้อมใช้งาน"
- ไม่ต้องตั้ง `R6AUTH_CLIENT_ID` / `R6AUTH_CLIENT_SECRET` ในโหมดนี้
- ทำงานเฉพาะเมื่อ `NODE_ENV` เป็น `development` หรือ `test` ใน production build จะถูกละเลย และหน้า `/dev/sso` ตอบ 404
- ข้อมูลผู้ใช้จำลองเป็นข้อมูลสมมติ

---

## 5. Login ทำงานอย่างไร

หน้า `/login` มีปุ่ม SSO เป็นหลัก และส่วน "ลูกจ้าง / ผู้ดูแลระบบ" (พับไว้) สำหรับเข้าด้วยรหัสผ่าน แผนภาพ: [`docs/LOGIN_FLOWCHART.md`](docs/LOGIN_FLOWCHART.md)

### พนักงาน (r6auth)

1. ปุ่ม SSO เป็นลิงก์ไป `GET /api/auth/sso/login?from=<หน้าที่จะกลับไป>` route สุ่ม `state` (32 ไบต์) เก็บ `{state, from}` ใน cookie แยก `<ชื่อ cookie>_sso` (เข้ารหัสด้วย iron-session, HttpOnly, อายุ 10 นาที, path `/api/auth/sso`) แล้ว redirect ไป `authorize.php`
2. r6auth จัดการ login กับ Keycloak แล้วส่งกลับ `GET /api/auth/sso/callback?code=…&state=…`
3. callback ลบ cookie `_sso` ทุกกรณี (ใช้ได้ครั้งเดียว) ถ้า login อยู่แล้ว (เช่นกด reload) ไป `/profile` เลย ถ้า `state` ไม่ตรง (เทียบแบบ constant-time), cookie หาย/หมดอายุ, ไม่มี `code` หรือ r6auth ส่ง `error` มา = `/login?error=SSO_EXPIRED` **โดยไม่เรียก token.php**
4. `attemptSsoLogin` (`src/lib/auth/sso-login.ts`):
   1. backend POST `token.php` พร้อม `client_secret` (timeout `R6AUTH_TIMEOUT`) `invalid_grant` = `SSO_EXPIRED` อย่างอื่น (เครือข่าย, `invalid_client`, `slow_down`, คำตอบผิดรูป) = `SERVICE_UNAVAILABLE`
   2. ตรวจว่ามี `username` และ `expires_at` ยังไม่ผ่านไป
   3. `R6AUTH_ALLOWED_BA` ไม่ว่างและ `ba` ไม่อยู่ในรายการ = `NOT_ALLOWED` **ก่อนสร้างแถวใน DB**
   4. `syncSsoUser` upsert โปรไฟล์ลง `users` (`account_type = 'sso'`), ให้ role พื้นฐาน, ปรับ role ตามศูนย์ต้นทุน (ข้อ 8)
   5. `is_active=false` = `INACTIVE`, `pending` = `PENDING_APPROVAL`, `rejected` = `REJECTED`
5. สำเร็จ: สร้าง session ใหม่ (`loginAt`, `expiresAt` จาก r6auth) แล้วไปหน้า `from` ล้มเหลว: `/login?error=<CODE>` แสดงข้อความภาษาไทย

ไม่มี throttle ในทางนี้เพราะไม่มีรหัสผ่าน (r6auth จำกัดการส่ง secret ผิดเอง)

### ลูกจ้างและ local admin (รหัสผ่าน)

`attemptLogin` (`src/lib/auth/login.ts`) ตามลำดับ:

1. **ตรวจ input**: username 1-100 ตัวไม่มี control character, password 1-1024 ตัว ไม่ผ่าน = `INVALID_CREDENTIALS` ไม่นับ throttle
2. **Normalize**: trim และตัด `PWA\` หรือ `@suffix` เผื่อพิมพ์ติดมือ ว่าง = `INVALID_CREDENTIALS`
3. **Throttle**: key = `username(ตัวพิมพ์เล็ก)|IP` ผิดครบ 5 ครั้งใน 60 วินาที = 429 พร้อม `Retry-After` (อ่านตารางไม่ได้ = 503)
4. **Local admin** (bcrypt) ถูกและ active = เข้าได้ (kind `local`, role `admin`); ถูกแต่ถูกปิด = `INACTIVE`
5. **ลูกจ้าง** (`account_type = 'contractor'`, bcrypt) รหัสผิด = `INVALID_CREDENTIALS` (นับ throttle), ปิดใช้งาน = `INACTIVE`, นอกช่วงสัญญา = `CONTRACT_NOT_STARTED` / `CONTRACT_ENDED`
6. **ไม่ตรงบัญชีใด** = `INVALID_CREDENTIALS` และนับ throttle (พนักงานต้องใช้ปุ่ม SSO)

### บัญชีลูกจ้าง (contractor)

- **จัดการที่ `/admin/contractors`**: เพิ่ม, แก้ไข, ต่อสัญญา, รีเซ็ตรหัสผ่าน, ปิด/เปิด, ลบ (เฉพาะคนที่หมดสัญญาหรือปิดใช้งานแล้ว) ค้นหาและกรองตามสถานะได้
- **ช่วงสัญญา**: ใช้ได้เมื่อ `วันเริ่ม <= วันนี้ <= วันสิ้นสุด` (นับทั้งสองวัน ตามเวลา Asia/Bangkok) เช็กทั้งตอน login และทุก request ที่ต้อง login
- **รหัสผ่าน**: ผู้ดูแลกำหนดหรือให้ระบบสุ่ม (แสดงครั้งเดียว) ลูกจ้างต้องเปลี่ยนที่ `/change-password` เมื่อเข้าครั้งแรกและหลังถูกรีเซ็ต
- **บทบาท**: `users.role = user` เสมอ (เข้าหน้า admin ไม่ได้) RBAC เพิ่มได้เฉพาะ role ที่ active และ `level <= 50`
- **แยกจาก SSO**: ถ้า r6auth คืน `username` ที่ชนกับรหัสลูกจ้าง login SSO นั้นล้มเหลว (ไม่ทับข้อมูลลูกจ้าง)

### อะไรนับ / ไม่นับ throttle (ทางรหัสผ่าน)

| เหตุการณ์ | ผลต่อ client | นับ throttle? |
|---|---|---|
| รหัสผ่านลูกจ้าง / local admin ผิด, ไม่พบบัญชี | 401 ข้อความทั่วไป | **นับ** |
| ลูกจ้างนอกช่วงสัญญา, ถูกปิด | 403 | ไม่นับ |
| input ไม่ถูกต้อง / username ว่างหลัง normalize | 401 | ไม่นับ |
| DB ล่ม | 503 | ไม่นับ |
| สำเร็จ | 200 | **ล้างตัวนับ** |

---

## 6. ตัวแปรสภาพแวดล้อม

คัดลอก `.env.example` เป็น `.env.local` (dev) หรือ `.env.docker.example` เป็น `.env.docker` (Docker)

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DATABASE_URL` | (ในตัวอย่าง) | connection string ของ PostgreSQL |
| `IRON_SESSION_PASSWORD` | ไม่มี (**จำเป็น**) | ความลับของ session อย่างน้อย 32 ตัว (`openssl rand -base64 48`) ใน production ถ้าเป็นค่าตัวอย่าง แอปจะ **ไม่ยอมเริ่ม** |
| `IRON_SESSION_COOKIE_NAME` | `pwa_auth_session` | ชื่อ cookie (ตั้งให้ไม่ซ้ำกับ r6auth หรือแอปอื่นบนโดเมนเดียวกัน) |
| `SESSION_MAX_LIFETIME` | `480` | อายุ session สูงสุดเป็นนาทีนับจาก login (session SSO หมดไม่เกิน `expires_at` ของ r6auth ด้วย) |
| `TRUST_PROXY` | `false` | ดูคำเตือนด้านล่าง |
| `R6AUTH_URL` | `https://reg6apps.pwa.co.th/r6auth` | ที่อยู่ r6auth ต้องเป็น `https://` |
| `R6AUTH_CLIENT_ID` | ไม่มี (**จำเป็น**) | `client_id` ที่ลงทะเบียน |
| `R6AUTH_CLIENT_SECRET` | ไม่มี (**จำเป็น**) | secret ของแอป เก็บฝั่ง server เท่านั้น |
| `R6AUTH_REDIRECT_URI` | ไม่มี (**จำเป็น**) | ต้องตรงกับ `redirect_uris` ที่ลงทะเบียน (`…/api/auth/sso/callback`) |
| `R6AUTH_POST_LOGOUT_REDIRECT_URI` | ไม่มี (**จำเป็น**) | ต้องตรงกับ `post_logout_redirect_uris` (`…/login`) |
| `R6AUTH_ALLOWED_BA` | ว่าง | รหัส BA คั่นด้วย comma ที่เข้าแอปได้ (เช่น `1059`) ว่าง = ทุกคนที่มีบัญชี กปภ. |
| `R6AUTH_TIMEOUT` | `10` | timeout ของ token.php (วินาที) |
| `R6AUTH_FAKE` | `false` | r6auth จำลอง (เฉพาะ `development` / `test`) |

ค่า `R6AUTH_*` อ่านตอนใช้งานครั้งแรก (`next build` ไม่ต้องมี) ถ้าผิดรูปแบบจะได้ข้อความที่บอกชื่อตัวแปร (ไม่แสดงค่า)

### `TRUST_PROXY` และ IP ของผู้ใช้

Throttle ใช้ IP ของผู้ใช้ซึ่งอ่านได้จาก header `X-Forwarded-For` / `X-Real-IP` เท่านั้น และ **ปลอมได้ง่าย** ถ้าเข้าถึงแอปโดยตรง

- `TRUST_PROXY=false` (ค่าเริ่มต้น): ไม่เชื่อ header ใช้ค่าคงที่ `-` แทน throttle จะนับต่อ username อย่างเดียว
- `TRUST_PROXY=true`: เฉพาะเมื่อ reverse proxy ที่ **คุณควบคุม** เขียนทับ `X-Forwarded-For` เสมอ

---

## 7. Registration mode / approval queue และ BA

ทำงาน **ต่อกัน** ใน `attemptSsoLogin`:

1. `R6AUTH_ALLOWED_BA` เป็นด่านแรก: BA ไม่อยู่ในรายการ = ปฏิเสธและ **ไม่สร้างแถว** ใน `users`
2. ผู้ที่ผ่านจะถูก sync ลง `users` แล้ว `registration_mode` (ตั้งที่ `/admin/settings`) ตัดสินสถานะ **ตอนสร้างแถวครั้งแรกเท่านั้น**
   - `allow_new_users` (ค่าเริ่มต้น): `approved` เข้าได้ทันที
   - `must_approve`: `pending` จนกว่า admin จะอนุมัติที่ `/admin/users` (หรือปฏิเสธ = `rejected`)
3. login ครั้งต่อไปไม่เปลี่ยน `approval_status` / `is_active` / `role` ที่ admin ตั้งไว้

r6auth ยืนยันแค่ว่า "ผู้ใช้คือใคร" ทุกคนที่มีบัญชี กปภ. ได้ `code` ทุกแอป แนะนำให้ตั้ง `R6AUTH_ALLOWED_BA` ให้แคบ แล้วใช้ `must_approve` เมื่อต้องการคัดคนอีกชั้น

---

## 8. Roles และศูนย์ต้นทุน

| | `users.role` (enum `admin` / `user`) | RBAC `roles` + `user_roles` |
|---|---|---|
| ใช้ทำอะไร | สิทธิ์เข้า **หน้า admin** (`/admin/*`, `/api/admin/*`) | role/ระดับ (`level`) สำหรับฟีเจอร์ของแอปที่คุณเขียนเพิ่ม |
| ใครตั้ง | **admin เท่านั้น** (`/admin/users`) ผู้ใช้ใหม่เป็น `user` เสมอ | admin ด้วยมือ หรืออัตโนมัติตามศูนย์ต้นทุน |

**ศูนย์ต้นทุน → role** (`/admin/cost-center-roles`, ตาราง `cost_center_roles`) ทำงานทุกครั้งที่ login ผ่าน SSO:

- รหัสต้อง **ตรงทั้งรหัส** (ไม่มี prefix/wildcard) ศูนย์ต้นทุนหนึ่งผูกได้หลาย role
- costcenter ของผู้ใช้ตรงแถวใด → ได้ role นั้น (ถ้า role active) role ที่มีแถวผูกไว้แต่ costcenter ไม่ตรง → ถูกถอด
- **role ที่ไม่มีแถวผูกเลยไม่ถูกแตะ** ผู้ดูแลกำหนดเองได้ตามปกติ
- ไม่แตะ `users.role` การอยู่ในศูนย์ต้นทุนใดจึงไม่ทำให้ได้สิทธิ์เข้าหน้า admin
- มีผลเมื่อผู้ใช้ login ครั้งถัดไป

`data/cost-centers.csv` (คอลัมน์ `cctr,ba,cctrname`, UTF-8 BOM) เป็นข้อมูลอ้างอิงชื่อหน่วยงาน ใน repo นี้เป็น**ข้อมูลตัวอย่าง** 3 แถวที่ตรงกับผู้ใช้ปลอม ให้แทนด้วยไฟล์จริงของหน่วยงานก่อนใช้งาน (หรือใช้ `--file`) `pnpm seed-cost-centers [--file path]` upsert ลงตาราง `cost_centers` (รันซ้ำได้ ไม่ลบแถวที่ไม่อยู่ในไฟล์) หน้า map จึงค้นหาจากชื่อหน่วยงานหรือ BA ได้ รหัสที่ไม่อยู่ในรายการก็ map ได้แต่จะมีคำเตือน

---

## 9. วินิจฉัยปัญหา

```bash
pnpm r6auth:check                                     # config, ping.php, URL ที่ต้องลงทะเบียน
docker compose exec app node dist-scripts/r6auth-check.mjs
```

| อาการ / ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| หน้า error 400 บน r6auth หลังกดปุ่ม | `redirect_uri` ไม่ตรงที่ลงทะเบียน, แอปยังไม่อนุมัติหรือถูกปิด | เทียบ `R6AUTH_REDIRECT_URI` ทีละตัวอักษร (http/https, `/` ท้าย, พอร์ต) ดูสถานะที่ `apps.php` |
| "ลิงก์เข้าสู่ระบบหมดอายุ" | `state` ไม่ตรง (cookie หาย, กดเข้าสู่ระบบจากแท็บที่เปิดก่อนหลังจากกดในแท็บใหม่แล้ว, เกิน 10 นาที), code หมดอายุ (60 วินาที) หรือใช้ซ้ำ | กดเข้าสู่ระบบใหม่; แท็บที่กดทีหลังยังเข้าได้ตามปกติ ตรวจว่า cookie ไม่เป็น `secure` บน http (ปุ่มเข้าสู่ระบบพาไปโฮสต์ของ `redirect_uri` เองแล้ว) |
| "รหัสพนักงานของคุณซ้ำกับบัญชีอื่นในระบบ" | รหัสพนักงานตรงกับ username ของบัญชีลูกจ้าง (log: `ContractorUsernameConflictError` พร้อม username) | admin ลบหรือเปลี่ยนบัญชีลูกจ้างนั้นที่ `/admin/contractors` |
| "ระบบยืนยันตัวตนไม่พร้อมใช้งาน" (503) | backend ต่อ `token.php` ไม่ได้, secret ผิด (`invalid_client`), `slow_down`, config ผิด, DB ล่ม | ดู log (`docker compose logs app`) แล้วรัน `pnpm r6auth:check`; สร้าง secret ใหม่ถ้าจำเป็น |
| "บัญชีของคุณไม่มีสิทธิ์ใช้งานระบบนี้" | BA ไม่อยู่ใน `R6AUTH_ALLOWED_BA` | ตรวจรายการ BA |
| "บัญชีของคุณรอผู้ดูแลระบบอนุมัติ" | `registration_mode=must_approve` | admin อนุมัติที่ `/admin/users` |
| "บัญชีของคุณถูกระงับการใช้งาน" | `is_active=false` | admin เปิดที่ `/admin/users` |
| "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" ในส่วนรหัสผ่าน | รหัสผิด หรือเป็นพนักงานที่ควรใช้ปุ่ม SSO | พนักงานใช้ปุ่ม "เข้าสู่ระบบด้วยบัญชี กปภ." |
| "พยายามเข้าสู่ระบบหลายครั้งเกินไป" (429) | รหัสผิดครบ 5 ครั้งต่อ `username\|IP` | รอตาม `Retry-After` |
| Error `IRON_SESSION_PASSWORD ... placeholder` ตอนเริ่ม | production ยังใช้ค่าตัวอย่าง | `openssl rand -base64 48` |
| login แล้วเด้งกลับหน้า login | cookie `secure` ใน production แต่เข้าผ่าน HTTP | ใช้ HTTPS |
| "เซสชันหมดอายุ" | เกิน `SESSION_MAX_LIFETIME` หรือ `expires_at` ของ r6auth | login ใหม่ (ถ้า r6auth ยัง login อยู่จะผ่านทันที) |

r6auth มี "บันทึกเหตุการณ์" ของแต่ละแอปในหน้าแอป (การออก code, การแลก code สำเร็จ/ล้มเหลว, logout) ช่วยไล่ปัญหาได้เร็ว

---

## 10. Session

- เก็บใน cookie ที่ iron-session เข้ารหัส/เซ็น (`httpOnly`, `sameSite=lax`, `secure` ใน production) มี `user` (kind `sso`/`local`/`contractor`, id, username, role, displayName), `loginAt` และ `expiresAt` (เฉพาะ SSO)
- **อายุสูงสุดแบบ absolute**: `SESSION_MAX_LIFETIME` นาทีนับจาก login และ session SSO หมดไม่เกิน `expires_at` ของ r6auth (นานสุด 8 ชั่วโมง) ไม่ต่ออายุเมื่อใช้งาน ไม่มี remember-me ไม่มี idle timeout
- cookie ที่เก่าเกิน ผิดรูปแบบ หรือ `loginAt` อยู่ในอนาคตเกิน 1 นาที ถือว่าไม่ได้ login และ `proxy.ts` จะลบทิ้ง
- `proxy.ts` ตรวจแค่ cookie เพื่อเด้งหน้า `/profile`, `/change-password` และ `/admin/*` **ไม่ใช่ขอบเขตความปลอดภัยสุดท้าย**: หน้า admin และ `/api/admin/*` โหลดผู้ใช้จากฐานข้อมูลซ้ำทุกครั้ง (`loadCurrentPrincipal`) หน้า `/profile` และ `GET /api/user` ตรวจซ้ำด้วย `requireActiveUser`
- **ออกจากระบบ**: ผู้ใช้ SSO ถูกส่งต่อไป `logout.php` ของ r6auth (ถามยืนยัน แล้วออกจาก r6auth และ Keycloak รวม Web Portal) แล้วกลับมาที่ `R6AUTH_POST_LOGOUT_REDIRECT_URI` ลูกจ้างและ local admin กลับ `/login`
- **ไม่มี back-channel logout**: ถ้าผู้ใช้ออกจากระบบที่อื่น แอปไม่รู้ session ของแอปจะอยู่จนถึง `expiresAt` หรือจนผู้ใช้กดออกเอง
- ถ้าเปลี่ยน `IRON_SESSION_PASSWORD` ทุกคนจะถูก logout

---

## 11. Docker / การ deploy

รายละเอียด: [`docs/docker.md`](docs/docker.md), checklist: [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md)

```bash
cp .env.docker.example .env.docker      # แก้ IRON_SESSION_PASSWORD, R6AUTH_*, รหัสผ่าน DB
docker compose up -d --build
docker compose exec app node dist-scripts/r6auth-check.mjs
```

- Dockerfile แบบ multi-stage (Node 22 Alpine, user ไม่ใช่ root, Next.js `standalone`) ค่าจริงมาจาก `.env.docker` ตอนรัน
- `docker-entrypoint.sh` รอ Postgres แล้วรัน migration ก่อนเริ่ม `server.js`
- healthcheck เรียก `GET /api/health` (`select 1` กับ Postgres) **ไม่ตรวจ r6auth** โดยเจตนา: r6auth ล่มแล้ว restart container ก็ไม่ช่วย และ local admin ต้องยังเข้าได้
- `pnpm create-local-admin`, `pnpm seed-roles`, `pnpm seed-cost-centers` รันจาก checkout ที่ต่อ DB ได้ (ใช้ tsx ซึ่งไม่อยู่ใน runtime image)
- production: ใช้ HTTPS ผ่าน reverse proxy, เอา `ports` ของ Postgres ออก, เปลี่ยนรหัสผ่าน DB

---

## 12. การทดสอบ / CI

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test            # Vitest
pnpm build
```

- เทสต์ใช้ **PGlite** (Postgres ในหน่วยความจำ, migration จริงจาก `drizzle/`) จึงไม่ต้องมี DB
- **ไม่ต่อ r6auth จริงในเทสต์และ CI**: ใช้ `FakeR6AuthClient` หรือ `fetch` ปลอม
- GitHub Actions: lint, typecheck, test, build (ค่า dummy), bundle สคริปต์ ไม่ต้องใช้ secret

---

## 13. โครงสร้างโปรเจกต์

```text
src/
  app/
    login/, profile/, change-password/                       หน้าเว็บ
    dev/sso/                                                 r6auth จำลอง (404 นอก dev/test)
    admin/{users,contractors,roles,cost-center-roles,settings}/  หน้าผู้ดูแล
    api/auth/{login,logout,change-password}/                 รหัสผ่าน / logout
    api/auth/sso/{login,callback}/                           r6auth
    api/admin/{users,contractors,roles,cost-center-roles,settings}/
    api/user/, api/health/
  proxy.ts                  เด้งหน้าตาม cookie (ห้าม import r6auth หรือ DB)
  lib/
    r6auth/                 config, client (token.php), fake, urls
    auth/                   login (รหัสผ่าน), sso-login, sso-state, throttle, principal, messages, redirect
    users/                  sync (syncSsoUser + costcenter roles), unit, admin-list
    cost-centers/           csv, admin service
    contractors/            บัญชีลูกจ้าง
    session.ts / session-core.ts
  db/schema.ts
data/cost-centers.csv       ศูนย์ต้นทุนตัวอย่าง (แทนด้วยไฟล์จริง)
drizzle/                    migration SQL
scripts/                    create-local-admin, seed-roles, seed-settings, seed-cost-centers, r6auth-check, docker-migrate
tests/                      Vitest
docs/                       LOGIN_FLOWCHART, docker, DEPLOYMENT_CHECKLIST, DESIGN_SYSTEM, Coding_principles
```

ตาราง: `users` (`sso` และ `contractor`; `username` = รหัสพนักงานตัวพิมพ์เล็กหรือรหัสลูกจ้าง, unique; `email` **ไม่ unique**), `local_admins`, `roles`, `user_roles`, `cost_center_roles`, `cost_centers`, `system_settings`, `login_throttle`

---

## 14. Security checklist

- [ ] ใช้ HTTPS ทั้งแอปและ `R6AUTH_REDIRECT_URI`; cookie เป็น `secure` ใน production
- [ ] `IRON_SESSION_PASSWORD` และ `R6AUTH_CLIENT_SECRET` อยู่ฝั่ง server เท่านั้น ไม่ commit ไม่ log
- [ ] ชื่อ cookie (`IRON_SESSION_COOKIE_NAME`) ไม่ซ้ำกับ r6auth หรือแอปอื่นบนโดเมนเดียวกัน
- [ ] `R6AUTH_FAKE=false`; fake ใช้ได้เฉพาะ dev/test
- [ ] ตั้ง `R6AUTH_ALLOWED_BA` ให้แคบ; พิจารณา `must_approve`
- [ ] ไม่ปิดการตรวจใบรับรอง TLS ที่ใดเลย (ถ้าต้องใช้ CA ภายในให้ตั้ง `NODE_EXTRA_CA_CERTS`)
- [ ] `TRUST_PROXY=true` เฉพาะเมื่อ proxy ของคุณเขียนทับ `X-Forwarded-For`
- [ ] local admin ใช้รหัสผ่านแข็งแรง ใช้เป็น break-glass เท่านั้น
- [ ] ไม่มีข้อมูลพนักงานจริงในโค้ด เทสต์ หรือเอกสาร
