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

interface AssignmentInput {
  id?: string;
  topic: string;
}

export async function POST(request: NextRequest) {
  try {
    const { email, assignments: inputAssignments } = await request.json();

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!Array.isArray(inputAssignments)) {
      return NextResponse.json(
        { error: "Assignments must be an array" },
        { status: 400 }
      );
    }

    // Filter out empty topics
    const validAssignments = inputAssignments.filter(
      (a: AssignmentInput) => a.topic && a.topic.trim().length > 0
    );

    // Get IDs of assignments to keep
    const keepIds = validAssignments
      .filter((a: AssignmentInput) => a.id)
      .map((a: AssignmentInput) => a.id as string);

    // Deactivate assignments not in the keep list
    await prisma.storyAssignment.updateMany({
      where: {
        active: true,
        id: { notIn: keepIds },
      },
      data: { active: false },
    });

    // Update existing assignments and create new ones
    for (const assignment of validAssignments) {
      if (assignment.id) {
        // Update existing
        await prisma.storyAssignment.update({
          where: { id: assignment.id },
          data: { topic: assignment.topic.trim() },
        });
      } else {
        // Create new
        await prisma.storyAssignment.create({
          data: {
            topic: assignment.topic.trim(),
            active: true,
          },
        });
      }
    }

    // Fetch and return the updated assignments
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
