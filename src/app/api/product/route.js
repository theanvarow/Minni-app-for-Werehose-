import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Serverni vaqtincha to'xtatish (Maintenance Mode / Server Disconnected Switch)
const IS_SERVER_STOPPED = false;

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET(request) {
  try {
    if (IS_SERVER_STOPPED) {
      return NextResponse.json({ success: false, error: "Server vaqtincha to'xtatilgan (Server is stopped / disconnected)" }, { status: 503 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing product ID" }, { status: 400 });
    }

    if (!GOOGLE_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "GOOGLE_SCRIPT_URL is not configured" }, { status: 500 });
    }

    // Call Google Apps Script as a proxy to fetch Uzum API (bypasses Vercel IP blocking)
    const targetUrl = `${GOOGLE_SCRIPT_URL}?action=product&id=${id}`;
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Google Apps Script proxy failed: status ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error in product API proxy:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch product details" }, { status: 500 });
  }
}
