import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.delete("admin_token");
  return response;
}
