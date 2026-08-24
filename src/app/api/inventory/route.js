import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serverni vaqtincha to'xtatish (Maintenance Mode / Server Disconnected Switch)
// Serverni qayta yoqish uchun ushbu qiymatni `false` ga o'zgartiring.
const IS_SERVER_STOPPED = false;

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

function transformStatsToGrafana(rawStats, filterMode, filterShift) {
  const stats = rawStats.stats || rawStats;
  const employees = [];
  const shifts = [];
  const timeseries = [];
  let grandTotal = 0;
  let grandConfirmed = 0;
  let grandMissing = 0;

  if (stats && typeof stats === "object") {
    const dates = Object.keys(stats).sort();
    dates.forEach(dateStr => {
      const dateData = stats[dateStr];
      if (!dateData || typeof dateData !== "object") return;
      let dayConfirmed = 0;
      let dayMissing = 0;
      let dayTotal = 0;

      Object.keys(dateData).forEach(shiftName => {
        const sLower = shiftName.toLowerCase();
        
        // Exclude gotovy / ready sheets completely
        if (sLower.indexOf("готовы") !== -1 || sLower.indexOf("готово") !== -1 || sLower.indexOf("gotov") !== -1) {
          return;
        }

        // Filter by mode (e.g. izlishka) or shift
        if (filterMode === "izlishka" && sLower.indexOf("излишка") === -1 && sLower.indexOf("izlishka") === -1) {
          return;
        }
        if (filterShift && sLower.indexOf(filterShift.toLowerCase()) === -1) {
          return;
        }

        const sData = dateData[shiftName];
        if (!sData) return;
        const confirmed = sData.confirmed || 0;
        const confirmedQty = sData.confirmedQty || sData.kolichestvo || confirmed;
        const missing = sData.missing || 0;
        const missingQty = sData.missingQty || sData.missing_kolichestvo || missing;
        const total = sData.total || (confirmed + missing);
        const totalQty = sData.totalQty || sData.total_kolichestvo || (confirmedQty + missingQty);

        dayConfirmed += confirmed;
        dayMissing += missing;
        dayTotal += total;

        grandConfirmed += confirmed;
        grandMissing += missing;
        grandTotal += total;

        const accuracy = total > 0 ? Math.round((confirmed / total) * 100) : 100;
        shifts.push({
          date: dateStr,
          shift: shiftName,
          confirmed,
          kolichestvo: confirmedQty,
          missing,
          missing_kolichestvo: missingQty,
          total,
          total_kolichestvo: totalQty,
          accuracy_percent: accuracy
        });

        if (sData.users && typeof sData.users === "object") {
          Object.keys(sData.users).forEach(userName => {
            const val = sData.users[userName];
            const skuCount = typeof val === "number" ? val : (val?.sku || val?.confirmed || val?.total || 0);
            const qtyCount = typeof val === "number" ? val : (val?.qty || val?.kolichestvo || skuCount);
            employees.push({
              date: dateStr,
              shift: shiftName,
              employee: userName,
              sobrano: skuCount,
              kolichestvo: qtyCount,
              scans: skuCount
            });
          });
        }
      });

      if (dayTotal > 0) {
        const ts = new Date(dateStr).getTime();
        timeseries.push({
          timestamp: isNaN(ts) ? Date.now() : ts,
          date: dateStr,
          confirmed: dayConfirmed,
          missing: dayMissing,
          total: dayTotal
        });
      }
    });
  }

  const overallAccuracy = grandTotal > 0 ? Math.round((grandConfirmed / grandTotal) * 100) : 100;

  return {
    success: true,
    metrics: {
      total_scans: grandTotal,
      confirmed: grandConfirmed,
      missing: grandMissing,
      overall_accuracy_percent: overallAccuracy
    },
    employees,
    shifts,
    timeseries
  };
}

let cachedGrafanaStore = {};

async function fetchStatsWithTimeout(googleUrl, filterMode, filterShift) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500); // 8.5s timeout for Google redirects
  try {
    const statsRes = await fetch(`${googleUrl}?action=stats&mode=${encodeURIComponent(filterMode || '')}`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    const rawStats = await statsRes.json();
    return transformStatsToGrafana(rawStats, filterMode, filterShift);
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function GET(request) {
  try {
    if (IS_SERVER_STOPPED) {
      return NextResponse.json({ success: false, error: "Server vaqtincha to'xtatilgan (Server is stopped / disconnected)" }, { status: 503 });
    }

    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL не настроен (проверьте файл .env.local)" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const filterMode = searchParams.get("mode");
    const filterShift = searchParams.get("shift");
    const type = searchParams.get("type");
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Auto-handle Grafana format with instant background SWR caching
    if (searchParams.get("action") === "grafana") {
      const cacheKey = `${filterMode || ''}_${filterShift || ''}`;
      const now = Date.now();
      const existing = cachedGrafanaStore[cacheKey];

      // Instant response if cache exists (< 60s)
      if (existing && (now - existing.time < 60000)) {
        const payload = existing.data;
        if (type === "shifts") return NextResponse.json(payload.shifts, { headers: corsHeaders });
        if (type === "employees") return NextResponse.json(payload.employees, { headers: corsHeaders });
        return NextResponse.json(payload, { headers: corsHeaders });
      }

      // If cache exists but stale, serve stale immediately and trigger background update
      if (existing) {
        fetchStatsWithTimeout(GOOGLE_SCRIPT_URL, filterMode, filterShift).then(fresh => {
          if (fresh) cachedGrafanaStore[cacheKey] = { time: Date.now(), data: fresh };
        }).catch(() => {});

        const payload = existing.data;
        if (type === "shifts") return NextResponse.json(payload.shifts, { headers: corsHeaders });
        if (type === "employees") return NextResponse.json(payload.employees, { headers: corsHeaders });
        return NextResponse.json(payload, { headers: corsHeaders });
      }

      // Cold start: fetch with 4.5s hard timeout limit
      const freshData = await fetchStatsWithTimeout(GOOGLE_SCRIPT_URL, filterMode, filterShift);
      if (freshData) {
        cachedGrafanaStore[cacheKey] = { time: Date.now(), data: freshData };
        if (type === "shifts") return NextResponse.json(freshData.shifts, { headers: corsHeaders });
        if (type === "employees") return NextResponse.json(freshData.employees, { headers: corsHeaders });
        return NextResponse.json(freshData, { headers: corsHeaders });
      }

      // Fallback empty payload if Google Apps Script is unreachable/slow on cold start
      const fallbackPayload = {
        success: true,
        metrics: { total_scans: 0, confirmed: 0, missing: 0, overall_accuracy_percent: 100 },
        employees: [],
        shifts: [],
        timeseries: []
      };
      if (type === "shifts") return NextResponse.json(fallbackPayload.shifts, { headers: corsHeaders });
      if (type === "employees") return NextResponse.json(fallbackPayload.employees, { headers: corsHeaders });
      return NextResponse.json(fallbackPayload, { headers: corsHeaders });
    }
    
    let targetUrl = GOOGLE_SCRIPT_URL;
    const params = [];
    searchParams.forEach((value, key) => {
      params.push(`${key}=${encodeURIComponent(value)}`);
    });
    if (params.length > 0) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + params.join('&');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9500);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      
      if (searchParams.get("action") === "stats" && data && typeof data === "object" && !data.hasOwnProperty("success")) {
        return NextResponse.json({ success: true, stats: data }, { headers: corsHeaders });
      }

      return NextResponse.json(data, { headers: corsHeaders });
    } catch (fetchErr) {
      return NextResponse.json({ 
        success: true, 
        uncompletedItems: [], 
        message: "Таблица временно не ответила" 
      }, { headers: corsHeaders });
    }

  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json({ success: true, uncompletedItems: [] }, { headers: corsHeaders });
  }
}

export async function POST(request) {
  try {
    if (IS_SERVER_STOPPED) {
      return NextResponse.json({ success: false, error: "Server vaqtincha to'xtatilgan (Server is stopped / disconnected)" }, { status: 503 });
    }

    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL не настроен (проверьте файл .env.local)" }, { status: 500 });
    }

    const body = await request.json();
    const { rowIndex, status, userName, shift, shiftName, placementCorrect, timestamp, mode, floor } = body;

    if (!rowIndex || !status || !userName) {
      return NextResponse.json({ success: false, error: "Данные неполные (требуется имя пользователя)" }, { status: 400 });
    }

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
      body: JSON.stringify({ rowIndex, status, userName, shift, shiftName, placementCorrect, timestamp, mode, floor })
    });

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ success: false, error: "Произошла ошибка при подтверждении" }, { status: 500 });
  }
}
