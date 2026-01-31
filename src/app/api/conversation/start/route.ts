import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG, getGreetingPrompt, getJournalistSystemPrompt, StoryAssignmentWithBackground } from "@/lib/config";
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
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
        },
      });
    } else {
      // Update last seen
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });
    }

    // Create a new conversation
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        status: "ACTIVE",
      },
    });

    // Fetch active story assignments with background info
    const storyAssignments = await prisma.storyAssignment.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    // Prepare data for prompts
    const storyTopics = storyAssignments.map((a) => a.topic);
    const assignmentsWithBackground: StoryAssignmentWithBackground[] = storyAssignments.map((a) => ({
      topic: a.topic,
      backgroundInfo: a.backgroundInfo,
    }));

    // Generate a greeting using Claude (with fallback if API fails)
    let greetingText: string;
    try {
      const systemPrompt = getJournalistSystemPrompt(user.name, user.conversationSummary, assignmentsWithBackground);
      const greetingPrompt = getGreetingPrompt(user.name, user.conversationSummary, storyTopics);

      const greetingResponse = await getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: greetingPrompt,
          },
        ],
      });

      greetingText =
        greetingResponse.content[0].type === "text"
          ? greetingResponse.content[0].text
          : `Hi! I'm ${CONFIG.journalistName}. What's happening at ${CONFIG.communityName} these days?`;
    } catch (aiError) {
      console.error("Greeting generation failed, using fallback:", aiError);
      greetingText = user.name
        ? `Hi ${user.name}! I'm ${CONFIG.journalistName}, your community journalist. What's been happening at ${CONFIG.communityName} lately?`
        : `Hi! I'm ${CONFIG.journalistName}, the ${CONFIG.communityName} community journalist. I'd love to hear what's on your mind. What's been happening lately?`;
    }

    // Save the greeting as a message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        senderType: "JOURNALIST",
        content: greetingText,
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      userId: user.id,
      userName: user.name,
      greetingText,
    });
  } catch (error) {
    console.error("Error starting conversation:", error);
    return NextResponse.json(
      { error: "Failed to start conversation" },
      { status: 500 }
    );
  }
}
