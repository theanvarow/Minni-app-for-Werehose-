# 📦 Warehouse Inventory & Excess Items Management System
### *(VP Pershot — Omborxona va Ortiqcha Tovarlarni Boshqarish Tizimi)*

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Google_Sheets_API-v4-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="Google Sheets" />
  <img src="https://img.shields.io/badge/Google_Apps_Script-Automated-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Apps Script" />
  <img src="https://img.shields.io/badge/PWA-Ready-orange?style=for-the-badge&logo=pwa" alt="PWA" />
  <img src="https://img.shields.io/badge/Grafana-Live_Monitoring-F46800?style=for-the-badge&logo=grafana&logoColor=white" alt="Grafana" />
</p>

---

## 🌟 Loyiha Haqida (Project Overview)

**Warehouse Inventory & Excess Items Management System** — zamonaviy logistika markazlari, taqsimlash omborxonalari (Fulfillment Centers) va muammoli tovarlar bo'limi (Problem Department) uchun ishlab chiqilgan yuqori tezlikdagi veb-ilovadir.

Tizim omborxona operatorlariga tovarlarni apparat skanerlari (Laser Barcode Terminals / PDA) yoki mobil kamera orqali real vaqtda skanerlash, ortiqcha tovarlarni aniqlash va qutilarga jamlash, kunlik normalarni hisoblash hamda barcha ma'lumotlarni to'g'ridan-to'g'ri **Google Sheets** va **Grafana** tizimlariga sinxronizatsiya qilish imkonini beradi.

---

## 📸 Dastur Ko'rinishlari (Screenshots & UI Showcase)

### 1. 🔐 Operator Avtorizatsiyasi va Smena Tanlash
Operatorlar o'z ismlari, smenalari va tegishli qavatni tanlab ish faoliyatini boshlaydilar.

![Operator Avtorizatsiyasi](docs/screenshots/01_auth_modal.png)

---

### 2. ⚡ Real-Time Skanerlash va Tovarlar Nazorati
Tovarlar shtrixkodi apparat skaneri orqali skanerlanganda tizim bir zumda tovarni qutiga biriktiradi, audio-signal chaladi va qutidagi umumiy sonni yangilab boradi.

![Skanerlash Paneli](docs/screenshots/02_scanner_dashboard.png)

---

### 3. 📦 Muammoli Bo'lim (Problem Department & Box Flow)
Ortiqcha yoki nuqsonli tovarlar maxsus identifikatorli qutilarga jamlanadi va to'lgach, bitta tugma orqali yopiladi hamda arxivlanadi.

![Muammoli Bo'lim](docs/screenshots/03_problem_department.png)

---

### 4. 📱 Mobil va PDA Skaner Moslashuvchanligi (PWA)
Ilova to'liq responsiv bo'lib, omborxona PDA skanerlari (Zebra, Honeywell, Chainway) hamda smartfonlarda qulay ishlash uchun moslashtirilgan.

<p align="center">
  <img src="docs/screenshots/04_mobile_view.png" width="380" alt="Mobile PDA View" />
</p>

---

## 🚀 Asosiy Imkoniyatlar (Key Features)

- ⚡ **Tezkor Shtrixkod Skaneri**:
  - Apparat lazerli skanerlar (Keyboard Wedge) uchun maxsus buffer algoritmi;
  - Mobil kamera orqali to'g'ridan-to'g'ri shtrixkodlarni o'qish (ZXing Engine);
  - Tovarni to'g'ri/noto'g'ri skanerlanganligini bildiruvchi audio-signallar (Sound FX).
- 📦 **Ortiqcha Tovarlar va Qutilar Nazorati (Box Management)**:
  - Qutilarni ochish, tovarlarni jamlash va qutini yopish (Close Box) jarayoni;
  - Har bir tovar turi bo'yicha hisob-kitob.
- 🏢 **Ko'p qavatli va Ko'p smenali tuzilma**:
  - 1-etaj, 2-etaj, 3-etaj hamda 1-smena / 2-smena filtrlari.
- 📊 **Real-time Statistika va Analitika**:
  - Operatorlar uchun kunlik KPI / Plan monitoringi;
  - Oylik va kunlik yig'ma hisobotlar.
- 🔄 **To'liq Google Sheets & Google Apps Script Integratsiyasi**:
  - Qimmat va murakkab alohida ma'lumotlar bazasisiz, biznes uchun qulay Google Sheets jadvallari bilan ikki tomonlama avtomatik sinxronizatsiya.
- 📈 **Grafana Telemetriya & Monitoring**:
  - Omborxona unumdorligi va real vaqt statistikasi Grafana dashboardlariga uzatiladi.
- 📲 **PWA (Progressive Web Application)**:
  - Internetsiz oflayn holatda ham interfeys uzluksiz yuklanadi;
  - Mobil terminal va ishchi qurilmalarga ilova sifatida o'rnatiladi.

---

## 🏗 Tizim Arxitekturasi (System Architecture)

```mermaid
graph TD
    A[Omborxona Xodimi / PDA Skaner] -->|Shtrixkod Skanerlash| B[Next.js 16 Web App]
    B -->|Audio / Visual Feedback| A
    B -->|API Routes / Proxy| C[Next.js Serverless Backend]
    C -->|REST API / JSON| D[Google Apps Script Engine]
    D -->|Real-time Read & Write| E[(Google Sheets Database)]
    E -->|Automated Sync Script| F[(PostgreSQL / Database)]
    F -->|Data Source| G[Grafana Live Monitoring Dashboard]
```

---

## 🛠 Texnologik Stek (Tech Stack)

| Qism | Texnologiya | Tavsif |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 16 (App Router)** | Yuqori tezlik va optimallashtirilgan rendering |
| **UI Kutubxona** | **React 19 & Tailwind CSS v4** | Modern, responsiv va qulay foydalanuvchi interfeysi |
| **PWA & Offline** | **Service Workers & Web App Manifest** | PDA va mobil qurilmalarga o'rnatish imkoniyati |
| **Audio Engine** | **Web Audio API** | Real-time skanerlash va ogohlantirish tovushlari |
| **Backend & Sync** | **Google Apps Script & Sheets API** | Bulutli ma'lumotlarni boshqarish va saqlash |
| **Monitoring** | **Grafana Dashboard** | Jonli KPI va operatsion hisobotlar |

---

## ⚙️ O'rnatish va Ishga Tushirish (Getting Started)

### 1. Repozitoriyani klonlash
```bash
git clone https://github.com/theanvarow/Minni-app-for-Werehose-.git
cd Minni-app-for-Werehose-
```

### 2. Bog'liqliklarni o'rnatish (Install Dependencies)
```bash
npm install
```

### 3. Muhit o'zgaruvchilarini sozlash (`.env.local`)
Loyiha ildizida `.env.local` faylini yarating va quyidagi parametrlarni kiriting:
```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
NEXT_PUBLIC_APP_NAME="VP Pershot - Warehouse Management"
```

### 4. Dasturni ishlab chiqish (Dev) rejimida ishga tushirish
```bash
npm run dev
```
Brauzerda [http://localhost:3000](http://localhost:3000) manziliga kiring.

### 5. Production uchun yig'ish (Build)
```bash
npm run build
npm start
```

---

## 👨‍💻 Loyiha Muallifi (Author)

- **GitHub:** [@theanvarow](https://github.com/theanvarow)
- **Loyiha:** Mini App for Warehouse & Inventory Audit

---
⭐ *Loyiha yoqqan bo'lsa, repozitoriyaga Star (yulduzcha) qo'yishni unutmang!*
