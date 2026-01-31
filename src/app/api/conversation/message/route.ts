import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getJournalistSystemPrompt, StoryAssignmentWithBackground } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SentenceBuffer } from "@/lib/sentenceBuffer";

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

// Helper to encode SSE data
function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to write SSE events
  const writeEvent = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(encodeSSE(event, data)));
  };

  // Process the request in the background
  (async () => {
    try {
      const formData = await request.formData();
      const conversationId = formData.get("conversationId") as string;
      const audioBlob = formData.get("audio") as Blob;

      if (!conversationId) {
        await writeEvent("error", { error: "Conversation ID is required" });
        await writer.close();
        return;
      }

      if (!audioBlob) {
        await writeEvent("error", { error: "Audio is required" });
        await writer.close();
        return;
      }

      // Get conversation with user and recent messages
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          user: true,
          messages: {
            orderBy: { createdAt: "asc" },
            take: 20,
          },
        },
      });

      if (!conversation) {
        await writeEvent("error", { error: "Conversation not found" });
        await writer.close();
        return;
      }

      if (conversation.status !== "ACTIVE") {
        await writeEvent("error", { error: "Conversation has ended" });
        await writer.close();
        return;
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
        await writeEvent("error", { error: "Could not understand audio" });
        await writer.close();
        return;
      }

      // Send transcription to frontend immediately
      await writeEvent("transcript", { text: userText });

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

      // Get streaming response from Claude
      const systemPrompt = getJournalistSystemPrompt(
        conversation.user.name,
        conversation.user.conversationSummary,
        assignmentsWithBackground
      );

      const sentenceBuffer = new SentenceBuffer(25);
      let fullResponse = "";
      let sentenceIndex = 0;

      // Stream Claude's response
      const claudeStream = getAnthropic().messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        messages: conversationHistory,
      });

      // Process the stream
      for await (const event of claudeStream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          fullResponse += text;

          // Check for complete sentences
          const sentences = sentenceBuffer.addText(text);

          for (const sentence of sentences) {
            // Send text immediately
            await writeEvent("text", { text: sentence, index: sentenceIndex });

            // Generate TTS for this sentence
            try {
              const audioResponse = await getOpenAI().audio.speech.create({
                model: "tts-1",
                voice: "nova",
                input: sentence,
                response_format: "mp3",
                speed: 1.25,
              });

              const audioBuffer = await audioResponse.arrayBuffer();
              const audioBase64 = Buffer.from(audioBuffer).toString("base64");

              await writeEvent("audio", {
                audio: `data:audio/mpeg;base64,${audioBase64}`,
                index: sentenceIndex,
              });
            } catch (ttsError) {
              console.error("TTS failed for sentence:", ttsError);
              // Send error event so frontend can use Web Speech API fallback
              await writeEvent("tts_error", { text: sentence, index: sentenceIndex });
            }

            sentenceIndex++;
          }
        }
      }

      // Flush any remaining text in the buffer
      const remaining = sentenceBuffer.flush();
      if (remaining) {
        await writeEvent("text", { text: remaining, index: sentenceIndex });

        try {
          const audioResponse = await getOpenAI().audio.speech.create({
            model: "tts-1",
            voice: "nova",
            input: remaining,
            response_format: "mp3",
            speed: 1.25,
          });

          const audioBuffer = await audioResponse.arrayBuffer();
          const audioBase64 = Buffer.from(audioBuffer).toString("base64");

          await writeEvent("audio", {
            audio: `data:audio/mpeg;base64,${audioBase64}`,
            index: sentenceIndex,
          });
        } catch (ttsError) {
          console.error("TTS failed for remaining text:", ttsError);
          await writeEvent("tts_error", { text: remaining, index: sentenceIndex });
        }
      }

      // Save the complete journalist response
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: conversation.user.id,
          senderType: "JOURNALIST",
          content: fullResponse,
        },
      });

      // Signal completion
      await writeEvent("complete", { fullText: fullResponse });
      await writer.close();
    } catch (error) {
      console.error("Error processing message:", error);
      try {
        await writeEvent("error", { error: "Failed to process message" });
        await writer.close();
      } catch {
        // Writer may already be closed
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
