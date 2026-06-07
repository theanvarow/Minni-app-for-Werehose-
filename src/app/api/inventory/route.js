import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET(request) {
  try {
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL не настроен (проверьте файл .env.local)" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const floor = searchParams.get('floor') || '';
    const targetUrl = floor ? `${GOOGLE_SCRIPT_URL}?floor=${floor}` : GOOGLE_SCRIPT_URL;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Next.js cache bypass for real-time updates
      cache: 'no-store'
    });
    
    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json({ success: false, error: "Не удалось подключиться к таблице" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL не настроен (проверьте файл .env.local)" }, { status: 500 });
    }

    const body = await request.json();
    const { rowIndex, status, userName, shift, placementCorrect } = body;

    if (!rowIndex || !status || !userName) {
      return NextResponse.json({ success: false, error: "Данные неполные (требуется имя пользователя)" }, { status: 400 });
    }

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
      body: JSON.stringify({ rowIndex, status, userName, shift, placementCorrect })
    });

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ success: false, error: "Произошла ошибка при подтверждении" }, { status: 500 });
  }
}
