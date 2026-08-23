import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serverni vaqtincha to'xtatish (Maintenance Mode / Server Disconnected Switch)
// Serverni qayta yoqish uchun ushbu qiymatni `false` ga o'zgartiring.
const IS_SERVER_STOPPED = false;

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

let statsMemoryCache = {
  data: null,
  timestamp: 0
};

let gotovaStatsMemoryCache = {
  data: null,
  timestamp: 0
};

export async function GET(request) {
  try {
    if (IS_SERVER_STOPPED) {
      return NextResponse.json({ success: false, error: "Server vaqtincha to'xtatilgan (Server is stopped / disconnected)" }, { status: 503 });
    }

    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL не настроен (проверьте файл .env.local)" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const isForce = searchParams.get("force") === "true";
    const now = Date.now();

    // Serve stats from memory cache if fresh (< 45s) and not forced
    if (action === "stats" && !isForce && statsMemoryCache.data && (now - statsMemoryCache.timestamp < 45000)) {
      return NextResponse.json(statsMemoryCache.data);
    }

    if (action === "gotova_stats" && !isForce && gotovaStatsMemoryCache.data && (now - gotovaStatsMemoryCache.timestamp < 45000)) {
      return NextResponse.json(gotovaStatsMemoryCache.data);
    }
    
    let targetUrl = GOOGLE_SCRIPT_URL;
    const params = [];
    searchParams.forEach((value, key) => {
      params.push(`${key}=${encodeURIComponent(value)}`);
    });
    if (params.length > 0) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + params.join('&');
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store'
    });
    
    const data = await response.json();
    
    // Auto-wrap raw stats from Google Apps Script and update cache
    if (action === "stats") {
      let statsPayload = data;
      if (data && typeof data === "object" && !data.hasOwnProperty("success")) {
        statsPayload = { success: true, stats: data };
      }
      statsMemoryCache = {
        data: statsPayload,
        timestamp: Date.now()
      };
      return NextResponse.json(statsPayload);
    }

    if (action === "gotova_stats") {
      gotovaStatsMemoryCache = {
        data,
        timestamp: Date.now()
      };
      return NextResponse.json(data);
    }
    
    return NextResponse.json(data);

  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json({ success: false, error: "Не удалось подключиться к таблице" }, { status: 500 });
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

    // Invalidate stats memory cache on item updates so stats stay accurate
    statsMemoryCache = { data: null, timestamp: 0 };
    gotovaStatsMemoryCache = { data: null, timestamp: 0 };

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
