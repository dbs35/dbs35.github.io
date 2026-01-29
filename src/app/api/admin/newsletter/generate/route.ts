import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG, getNewsletterPrompt } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get recent closed conversations with their summaries
    const conversations = await prisma.conversation.findMany({
      where: {
        status: "CLOSED",
        summary: {
          not: null,
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        endedAt: "desc",
      },
      take: 20, // Last 20 conversations
    });

    if (conversations.length === 0) {
      return NextResponse.json(
        { error: "No completed conversations to generate newsletter from" },
        { status: 400 }
      );
    }

    // Build summaries for the newsletter prompt
    const conversationSummaries = conversations.map((conv) => {
      const userName = conv.user.name || "A community member";
      return `${userName}: ${conv.summary}`;
    });

    // Generate newsletter using Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: getNewsletterPrompt(conversationSummaries),
        },
      ],
    });

    const newsletterContent =
      response.content[0].type === "text"
        ? response.content[0].text
        : "Failed to generate newsletter content.";

    // Save the newsletter
    const newsletter = await prisma.generatedNewsletter.create({
      data: {
        content: newsletterContent,
        sourceConversationIds: JSON.stringify(conversations.map((c) => c.id)),
      },
    });

    return NextResponse.json({
      id: newsletter.id,
      content: newsletterContent,
      sourceConversationCount: conversations.length,
      createdAt: newsletter.createdAt,
    });
  } catch (error) {
    console.error("Error generating newsletter:", error);
    return NextResponse.json(
      { error: "Failed to generate newsletter" },
      { status: 500 }
    );
  }
}
