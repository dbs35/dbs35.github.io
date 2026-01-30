import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const assignments = await prisma.storyAssignment.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Error fetching story assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch story assignments" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, topics } = await request.json();

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!Array.isArray(topics)) {
      return NextResponse.json(
        { error: "Topics must be an array" },
        { status: 400 }
      );
    }

    // Deactivate all existing assignments
    await prisma.storyAssignment.updateMany({
      where: { active: true },
      data: { active: false },
    });

    // Create new assignments for non-empty topics
    const validTopics = topics.filter((t: string) => t && t.trim().length > 0);

    if (validTopics.length > 0) {
      await prisma.storyAssignment.createMany({
        data: validTopics.map((topic: string) => ({
          topic: topic.trim(),
          active: true,
        })),
      });
    }

    // Fetch and return the new assignments
    const assignments = await prisma.storyAssignment.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Error saving story assignments:", error);
    return NextResponse.json(
      { error: "Failed to save story assignments" },
      { status: 500 }
    );
  }
}
