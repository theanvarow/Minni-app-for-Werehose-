# 📊 Grafana Tizimiga Ulash Bo'yicha To'liq Qo'llanma

Ushbu qo'llanma **Inventory Checker** veb-ilovasi hamda Google Sheets statistikalarini **Grafana** vizualizatsiya tizimiga ulash tartibini tushuntiradi.

---

## 🚀 1-Usul: Grafana Infinity Plugin Orqali (Tavsiya etiladi)

**Grafana Infinity Plugin** — eng moslashuvchan plagin bo'lib, REST API dan ma'lumotlarni jadval va grafik ko'rinishida chiqarishga imkon beradi.

### 1-qadam: Infinity Plaginini o'rnatish
1. Grafana boshqaruv paneliga kiring (`http://your-grafana-server:3000`).
2. **Administration** -> **Plugins** bo'limiga o'ting.
3. Qidiruvga **`Infinity`** deb yozing va **Install** tugmasini bosing.

### 2-qadam: Data Source yaratish
1. **Connections** -> **Data sources** -> **Add data source** bosing.
2. **Infinity** plaginini tanlang.
3. Nomi: `Inventory-Checker-API` deb qo'ying.
4. **Save & test** tugmasini bosing.

### 3-qadam: Dashboard va Panellar Yaratish

#### A. Har bir xodim piklari jadvali (Leaderboard Table)
- **Data source:** `Inventory-Checker-API`
- **Type:** `JSON`
- **URL:** `https://inventory-checker-nu.vercel.app/api/inventory?action=grafana`
- **Root Selector:** `employees`
- **Columns:**
  - `employee` (String) -> Xodim ismi
  - `shift` (String) -> Smena
  - `scans` (Number) -> Piklar soni
  - `date` (String) -> Sana

#### B. Smenalar statistikasi (Shift Summary Table)
- **URL:** `https://inventory-checker-nu.vercel.app/api/inventory?action=grafana`
- **Root Selector:** `shifts`
- **Columns:**
  - `shift` (String) -> Smena nomi
  - `confirmed` (Number) -> Tasdiqlangan
  - `missing` (Number) -> Topilmadi
  - `total` (Number) -> Jami
  - `accuracy_percent` (Number) -> Anqlik %

#### C. Umumiydagi dinamika grafigi (Time-Series Chart)
- **Panel Type:** `Time series`
- **URL:** `https://inventory-checker-nu.vercel.app/api/inventory?action=grafana`
- **Root Selector:** `timeseries`
- **Fields:** `timestamp` (Time), `confirmed` (Number), `missing` (Number)

---

## 📊 2-Usul: Google Sheets Grafana Plugin Orqali

Agar Grafana-ni to'g'ridan-to'g'ri Google Sheets bilan bog'lamoqchi bo'lsangiz:

1. Grafana-da **Google Sheets** official pluginini o'rnating.
2. Google Cloud Console'dan **API Key** oling va Google Sheets plaginiga kiriting.
3. Google Sheet ID kiriting:
   - Spreadsheet ID-ni Google Sheets havolasidan nusxalab oling (masalan: `https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`).
4. Grafana panelida varaq nomini (masalan `1 смена`) tanlang va ustunlarni moslang.

---

## 🔗 Sinov Havolasi (API Endpoint):
Grafana so'rovi uchun tayyor backend API havolasi:
```http
GET https://inventory-checker-nu.vercel.app/api/inventory?action=grafana
```
