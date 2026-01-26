import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    // Check admin email from query params
    const email = request.nextUrl.searchParams.get("email");

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get all conversations with user info and message counts
    const conversations = await prisma.conversation.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        messages: {
          select: {
            id: true,
            senderType: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      userId: conv.userId,
      userEmail: conv.user.email,
      userName: conv.user.name,
      status: conv.status,
      summary: conv.summary,
      createdAt: conv.createdAt,
      endedAt: conv.endedAt,
      messageCount: conv.messages.length,
      lastMessageAt: conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].createdAt
        : conv.createdAt,
    }));

    return NextResponse.json({ conversations: formattedConversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
