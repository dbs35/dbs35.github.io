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

    // Generate a greeting using Claude (with fallback if API fails)
    let greetingText: string;
    try {
      const systemPrompt = getJournalistSystemPrompt(user.name, user.conversationSummary);
      const greetingPrompt = getGreetingPrompt(user.name, user.conversationSummary);

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

    // Generate audio for the greeting using OpenAI TTS (optional - conversation page will regenerate if needed)
    let audioBase64: string | undefined;
    try {
      const audioResponse = await getOpenAI().audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: greetingText,
        response_format: "mp3",
      });

      // Get the audio as base64
      const audioBuffer = await audioResponse.arrayBuffer();
      audioBase64 = Buffer.from(audioBuffer).toString("base64");
    } catch (ttsError) {
      console.error("TTS generation failed (conversation will still work):", ttsError);
      // Continue without audio - the conversation page will generate it
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
      greetingAudio: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : undefined,
    });
  } catch (error) {
    console.error("Error starting conversation:", error);
    return NextResponse.json(
      { error: "Failed to start conversation" },
      { status: 500 }
    );
  }
}
