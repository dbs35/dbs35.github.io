import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSummaryPrompt } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

// Lazy-load client to avoid errors if API key is not set
let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    // Get conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (conversation.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Conversation already ended" },
        { status: 400 }
      );
    }

    // Build transcript for summary
    const transcript = conversation.messages
      .map((msg) => {
        const speaker = msg.senderType === "USER" ? "Community Member" : "Storyteller";
        return `${speaker}: ${msg.content}`;
      })
      .join("\n\n");

    // Generate summary using Claude
    const summaryResponse = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: getSummaryPrompt(transcript),
        },
      ],
    });

    const conversationSummary =
      summaryResponse.content[0].type === "text"
        ? summaryResponse.content[0].text
        : "Conversation summary unavailable.";

    // Update conversation status and summary
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: "CLOSED",
        endedAt: new Date(),
        summary: conversationSummary,
      },
    });

    // Update user's rolling summary
    const existingSummary = conversation.user.conversationSummary || "";
    const newSummary = existingSummary
      ? `${existingSummary}\n\n---\n\n${conversationSummary}`
      : conversationSummary;

    // Keep summary from getting too long (last ~2000 chars)
    const trimmedSummary =
      newSummary.length > 2000
        ? "..." + newSummary.slice(-2000)
        : newSummary;

    await prisma.user.update({
      where: { id: conversation.user.id },
      data: {
        conversationSummary: trimmedSummary,
      },
    });

    return NextResponse.json({
      success: true,
      summary: conversationSummary,
    });
  } catch (error) {
    console.error("Error ending conversation:", error);
    return NextResponse.json(
      { error: "Failed to end conversation" },
      { status: 500 }
    );
  }
}
