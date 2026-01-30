import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { email } = body;

    // Check admin authorization
    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Delete all data in the correct order (respecting foreign key constraints)
    // 1. Delete all messages first
    const deletedMessages = await prisma.message.deleteMany({});

    // 2. Delete all conversations
    const deletedConversations = await prisma.conversation.deleteMany({});

    // 3. Clear all user conversation summaries (but keep users)
    await prisma.user.updateMany({
      data: {
        conversationSummary: null,
      },
    });

    // 4. Delete all generated newsletters
    const deletedNewsletters = await prisma.generatedNewsletter.deleteMany({});

    // 5. Delete editorial context (published topics memory)
    await prisma.editorialContext.deleteMany({});

    // 6. Delete story backlog (unpublished leads)
    await prisma.storyBacklog.deleteMany({});

    return NextResponse.json({
      success: true,
      deleted: {
        messages: deletedMessages.count,
        conversations: deletedConversations.count,
        newsletters: deletedNewsletters.count,
      },
    });
  } catch (error) {
    console.error("Error resetting context:", error);
    return NextResponse.json(
      { error: "Failed to reset context" },
      { status: 500 }
    );
  }
}
