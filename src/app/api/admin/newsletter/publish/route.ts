import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG, getPublishedTopicsPrompt, getUnpublishedLeadsPrompt } from "@/lib/config";
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

    // Get the most recent unpublished newsletter
    const newsletter = await prisma.generatedNewsletter.findFirst({
      where: {
        publishedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!newsletter) {
      return NextResponse.json(
        { error: "No unpublished newsletter found. Generate a newsletter first." },
        { status: 400 }
      );
    }

    // Parse source conversation IDs
    const sourceConversationIds: string[] = JSON.parse(newsletter.sourceConversationIds);

    // Get the source conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        id: { in: sourceConversationIds },
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // Build conversation summaries for the unpublished leads extraction
    const conversationSummaries = conversations
      .filter((c) => c.summary)
      .map((c) => {
        const userName = c.user.name || "A community member";
        return `${userName}: ${c.summary}`;
      });

    // Generate two summaries in parallel
    const [publishedTopicsResponse, unpublishedLeadsResponse] = await Promise.all([
      // 1. Extract published topics from the newsletter
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: getPublishedTopicsPrompt(newsletter.content),
          },
        ],
      }),
      // 2. Extract unpublished leads from conversations
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: getUnpublishedLeadsPrompt(conversationSummaries, newsletter.content),
          },
        ],
      }),
    ]);

    const publishedTopics =
      publishedTopicsResponse.content[0].type === "text"
        ? publishedTopicsResponse.content[0].text
        : "";

    const unpublishedLeads =
      unpublishedLeadsResponse.content[0].type === "text"
        ? unpublishedLeadsResponse.content[0].text
        : "";

    const now = new Date();

    // Update or create editorial context
    const existingContext = await prisma.editorialContext.findFirst();
    if (existingContext) {
      // Append new topics to existing context
      const updatedSummary = `${existingContext.summary}\n\n--- Published ${now.toLocaleDateString()} ---\n${publishedTopics}`;
      await prisma.editorialContext.update({
        where: { id: existingContext.id },
        data: { summary: updatedSummary },
      });
    } else {
      await prisma.editorialContext.create({
        data: {
          summary: `--- Published ${now.toLocaleDateString()} ---\n${publishedTopics}`,
        },
      });
    }

    // Update or replace story backlog (only keep the latest unpublished leads)
    const existingBacklog = await prisma.storyBacklog.findFirst();
    const hasLeads = unpublishedLeads && !unpublishedLeads.toLowerCase().includes("no additional leads");

    if (hasLeads) {
      if (existingBacklog) {
        // Append new leads to existing backlog
        const updatedLeads = `${existingBacklog.leads}\n\n--- From ${now.toLocaleDateString()} ---\n${unpublishedLeads}`;
        await prisma.storyBacklog.update({
          where: { id: existingBacklog.id },
          data: { leads: updatedLeads },
        });
      } else {
        await prisma.storyBacklog.create({
          data: {
            leads: `--- From ${now.toLocaleDateString()} ---\n${unpublishedLeads}`,
          },
        });
      }
    }

    // Mark conversations as published
    await prisma.conversation.updateMany({
      where: {
        id: { in: sourceConversationIds },
      },
      data: {
        publishedAt: now,
      },
    });

    // Mark the newsletter as published
    await prisma.generatedNewsletter.update({
      where: { id: newsletter.id },
      data: { publishedAt: now },
    });

    return NextResponse.json({
      success: true,
      publishedAt: now,
      conversationsArchived: sourceConversationIds.length,
      hasNewStoryLeads: hasLeads,
    });
  } catch (error) {
    console.error("Error publishing newsletter:", error);
    return NextResponse.json(
      { error: "Failed to publish newsletter" },
      { status: 500 }
    );
  }
}
