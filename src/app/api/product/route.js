import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing product ID" }, { status: 400 });
    }

    const response = await fetch(`https://api.uzum.uz/api/v2/product/${id}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    if (!contentType.includes("application/json")) {
      console.warn("Uzum API returned non-JSON content. WAF/Captcha probably blocked the request.");
      return NextResponse.json({ success: false, error: "API returned non-JSON response (blocked by WAF/Captcha)" }, { status: 403 });
    }

    const data = JSON.parse(text);
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error in product API proxy:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch product details" }, { status: 500 });
  }
}
