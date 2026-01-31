import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getJournalistSystemPrompt, StoryAssignmentWithBackground } from "@/lib/config";
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
    const formData = await request.formData();
    const conversationId = formData.get("conversationId") as string;
    const audioBlob = formData.get("audio") as Blob;

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    if (!audioBlob) {
      return NextResponse.json(
        { error: "Audio is required" },
        { status: 400 }
      );
    }

    // Get conversation with user and recent messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 20, // Last 20 messages for context
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
        { error: "Conversation has ended" },
        { status: 400 }
      );
    }

    // Transcribe audio using OpenAI Whisper
    const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
    const audioFile = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await getOpenAI().audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      language: "en",
    });

    const userText = transcription.text.trim();

    if (!userText) {
      return NextResponse.json(
        { error: "Could not understand audio" },
        { status: 400 }
      );
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: conversation.user.id,
        senderType: "USER",
        content: userText,
      },
    });

    // Build conversation history for Claude
    const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> =
      conversation.messages.map((msg) => ({
        role: (msg.senderType === "USER" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content,
      }));

    // Add the new user message
    conversationHistory.push({
      role: "user",
      content: userText,
    });

    // Fetch active story assignments with background info
    const storyAssignments = await prisma.storyAssignment.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    const assignmentsWithBackground: StoryAssignmentWithBackground[] = storyAssignments.map((a) => ({
      topic: a.topic,
      backgroundInfo: a.backgroundInfo,
    }));

    // Get response from Claude
    const systemPrompt = getJournalistSystemPrompt(
      conversation.user.name,
      conversation.user.conversationSummary,
      assignmentsWithBackground
    );

    const claudeResponse = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const journalistText =
      claudeResponse.content[0].type === "text"
        ? claudeResponse.content[0].text
        : "I'm sorry, I didn't catch that. Could you tell me more?";

    // Generate audio response using OpenAI TTS
    const audioResponse = await getOpenAI().audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: journalistText,
      response_format: "mp3",
      speed: 1.75,
    });

    const responseAudioBuffer = await audioResponse.arrayBuffer();
    const responseAudioBase64 = Buffer.from(responseAudioBuffer).toString("base64");

    // Save journalist response
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: conversation.user.id,
        senderType: "JOURNALIST",
        content: journalistText,
      },
    });

    return NextResponse.json({
      userTranscript: userText,
      journalistText,
      journalistAudio: `data:audio/mpeg;base64,${responseAudioBase64}`,
    });
  } catch (error) {
    console.error("Error processing message:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
