import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG, getGreetingPrompt, getJournalistSystemPrompt } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Lazy-load clients to avoid errors if API keys are not set
let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
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

    // If no messages yet, generate greeting
    if (conversation.messages.length === 0) {
      const systemPrompt = getJournalistSystemPrompt(
        conversation.user.name,
        conversation.user.conversationSummary
      );
      const greetingPrompt = getGreetingPrompt(
        conversation.user.name,
        conversation.user.conversationSummary
      );

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

      const greetingText =
        greetingResponse.content[0].type === "text"
          ? greetingResponse.content[0].text
          : `Hi! I'm ${CONFIG.journalistName}. What's happening at ${CONFIG.communityName} these days?`;

      // Generate audio for the greeting
      const audioResponse = await getOpenAI().audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: greetingText,
        response_format: "mp3",
        speed: 1.75,
      });

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString("base64");

      // Save the greeting as a message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: conversation.user.id,
          senderType: "JOURNALIST",
          content: greetingText,
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        userId: conversation.user.id,
        userName: conversation.user.name,
        status: conversation.status,
        greetingText,
        greetingAudio: `data:audio/mpeg;base64,${audioBase64}`,
        messages: [
          {
            sender: "journalist",
            content: greetingText,
            timestamp: new Date(),
          },
        ],
      });
    }

    // Return existing messages, including audio for the greeting if this is a new conversation
    // (only one journalist message = just started, need to play greeting)
    const firstMessage = conversation.messages[0];
    let greetingAudio: string | undefined;
    let greetingText: string | undefined;

    // Generate audio for the greeting message if it's a new conversation (only greeting message exists)
    if (
      conversation.messages.length === 1 &&
      firstMessage &&
      firstMessage.senderType === "JOURNALIST"
    ) {
      greetingText = firstMessage.content;
      const audioResponse = await getOpenAI().audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: greetingText,
        response_format: "mp3",
        speed: 1.75,
      });

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString("base64");
      greetingAudio = `data:audio/mpeg;base64,${audioBase64}`;
    }

    return NextResponse.json({
      conversationId: conversation.id,
      userId: conversation.user.id,
      userName: conversation.user.name,
      status: conversation.status,
      greetingText,
      greetingAudio,
      messages: conversation.messages.map((msg) => ({
        sender: msg.senderType === "USER" ? "user" : "journalist",
        content: msg.content,
        timestamp: msg.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}
