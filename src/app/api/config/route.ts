import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    communityName: CONFIG.communityName,
    journalistName: CONFIG.journalistName,
  });
}
