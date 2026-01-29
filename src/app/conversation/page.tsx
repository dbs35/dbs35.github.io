"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type ConversationState =
  | "loading"
  | "ai_speaking"
  | "listening"
  | "processing"
  | "interrupted"
  | "ended"
  | "error";

interface Message {
  sender: "user" | "journalist";
  content: string;
  timestamp: Date;
}

function ConversationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams.get("id");

  const [state, setState] = useState<ConversationState>("loading");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Audio refs
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const vadRef = useRef<{ pause: () => void; start: () => void; destroy: () => void } | null>(null);
  const stateRef = useRef<ConversationState>(state);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    // Cancel Web Speech API if active
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speechSynthRef.current = null;
  }, []);

  // Web Speech API fallback for TTS (free, offline)
  const speakWithWebSpeechAPI = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!("speechSynthesis" in window)) {
          reject(new Error("Web Speech API not supported"));
          return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a good English voice
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(
          (v) => v.lang.startsWith("en") && v.localService
        ) || voices.find((v) => v.lang.startsWith("en"));
        if (englishVoice) {
          utterance.voice = englishVoice;
        }

        utterance.onend = () => {
          speechSynthRef.current = null;
          resolve();
        };

        utterance.onerror = (e) => {
          speechSynthRef.current = null;
          reject(e);
        };

        speechSynthRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      });
    },
    []
  );

  // Play audio with OpenAI TTS, fall back to Web Speech API if unavailable
  const playAudio = useCallback(
    (audioData: string | undefined, fallbackText?: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // If no audio data, try Web Speech API fallback
        if (!audioData) {
          if (fallbackText) {
            console.log("No audio data, using Web Speech API fallback");
            speakWithWebSpeechAPI(fallbackText).then(resolve).catch(reject);
          } else {
            resolve(); // No audio and no text, just resolve
          }
          return;
        }

        const audio = new Audio(audioData);
        currentAudioRef.current = audio;

        audio.onended = () => {
          currentAudioRef.current = null;
          resolve();
        };

        audio.onerror = (e) => {
          currentAudioRef.current = null;
          // Fall back to Web Speech API on audio error
          if (fallbackText) {
            console.log("Audio playback failed, using Web Speech API fallback");
            speakWithWebSpeechAPI(fallbackText).then(resolve).catch(reject);
          } else {
            reject(e);
          }
        };

        audio.play().catch((playError) => {
          currentAudioRef.current = null;
          // Fall back to Web Speech API on play error
          if (fallbackText) {
            console.log("Audio play failed, using Web Speech API fallback");
            speakWithWebSpeechAPI(fallbackText).then(resolve).catch(reject);
          } else {
            reject(playError);
          }
        });
      });
    },
    [speakWithWebSpeechAPI]
  );

  // Stop current audio playback (both OpenAI audio and Web Speech API)
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    // Also cancel Web Speech API if active
    if (speechSynthRef.current) {
      window.speechSynthesis.cancel();
      speechSynthRef.current = null;
    }
  }, []);

  // Send audio to backend
  const sendAudio = useCallback(
    async (audioBlob: Blob) => {
      if (!conversationId) return;

      setState("processing");

      try {
        const formData = new FormData();
        formData.append("conversationId", conversationId);
        formData.append("audio", audioBlob);

        const response = await fetch("/api/conversation/message", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Failed to process audio");
        }

        const data = await response.json();

        // Add messages to transcript
        setMessages((prev) => [
          ...prev,
          { sender: "user", content: data.userTranscript, timestamp: new Date() },
          { sender: "journalist", content: data.journalistText, timestamp: new Date() },
        ]);

        // Pause VAD while AI is speaking
        if (vadRef.current) {
          vadRef.current.pause();
        }

        // Play response (with Web Speech API fallback)
        setState("ai_speaking");
        await playAudio(data.journalistAudio, data.journalistText);

        // Resume VAD for listening
        setState("listening");
        if (vadRef.current) {
          vadRef.current.start();
        }
      } catch (err) {
        console.error("Error sending audio:", err);
        setError("Failed to process your response. Please try again.");
        setState("listening");
        if (vadRef.current) {
          vadRef.current.start();
        }
      }
    },
    [conversationId, playAudio]
  );

  // Initialize VAD and start conversation
  useEffect(() => {
    if (!conversationId) {
      router.push("/");
      return;
    }

    let mounted = true;

    const initializeConversation = async () => {
      try {
        // Dynamically import VAD to avoid SSR issues
        const { MicVAD } = await import("@ricky0123/vad-web");

        if (!mounted) return;

        // Create VAD instance with CDN paths for model and WASM files
        const vad = await MicVAD.new({
          baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
          onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/",
          onSpeechStart: () => {
            console.log("Speech started");
            setIsSpeaking(true);

            // If AI is speaking, interrupt it
            if (stateRef.current === "ai_speaking") {
              stopAudio();
              setState("interrupted");
              setTimeout(() => {
                setState("listening");
              }, 300);
            }
          },
          onSpeechEnd: (audio: Float32Array) => {
            console.log("Speech ended, audio length:", audio.length);
            setIsSpeaking(false);

            // Only process if we're in listening state
            if (stateRef.current === "listening" || stateRef.current === "interrupted") {
              // Convert Float32Array to WAV blob
              const wavBlob = float32ToWav(audio, 16000);
              sendAudio(wavBlob);
            }
          },
          onVADMisfire: () => {
            console.log("VAD misfire (too short)");
            setIsSpeaking(false);
          },
          positiveSpeechThreshold: 0.8,
          negativeSpeechThreshold: 0.5,
        });

        vadRef.current = vad;

        if (!mounted) return;

        // Pause VAD initially while we play the greeting
        vad.pause();

        // Fetch conversation data and start
        const response = await fetch(`/api/conversation/${conversationId}`);
        if (response.ok) {
          const data = await response.json();

          // Load existing messages
          if (data.messages && data.messages.length > 0) {
            setMessages(
              data.messages.map((msg: { sender: string; content: string; timestamp: string }) => ({
                sender: msg.sender as "user" | "journalist",
                content: msg.content,
                timestamp: new Date(msg.timestamp),
              }))
            );
          }

          // Play greeting audio if this is a new conversation (with Web Speech API fallback)
          if (data.greetingAudio || data.greetingText) {
            setState("ai_speaking");
            await playAudio(data.greetingAudio, data.greetingText);
          }
        }

        if (!mounted) return;

        // Start listening
        setState("listening");
        vad.start();
      } catch (err) {
        console.error("Error initializing:", err);
        if (mounted) {
          setError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Microphone access is required for voice conversations. Please enable it and refresh."
              : "Failed to initialize conversation. Please try again."
          );
          setState("error");
        }
      }
    };

    initializeConversation();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [conversationId, router, cleanup, playAudio, sendAudio, stopAudio]);

  // End conversation handler
  const handleEndConversation = async () => {
    cleanup();
    setState("processing");

    try {
      await fetch("/api/conversation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      setState("ended");
    } catch (err) {
      console.error("Error ending conversation:", err);
      setState("ended");
    }
  };

  // Render state indicator
  const renderStateIndicator = () => {
    switch (state) {
      case "loading":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-gray-600">Setting up...</p>
          </div>
        );
      case "ai_speaking":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl animate-pulse">🔊</div>
            <p className="text-blue-600 font-medium">Jamie is speaking...</p>
            <p className="text-xs text-gray-500">Start talking to interrupt</p>
          </div>
        );
      case "listening":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className={`text-4xl ${isSpeaking ? "animate-pulse" : ""}`}>🎤</div>
            <p className="text-green-600 font-medium">
              {isSpeaking ? "Listening to you..." : "Listening..."}
            </p>
            <p className="text-xs text-gray-500">
              {isSpeaking ? "Keep talking..." : "Speak now"}
            </p>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-yellow-600 font-medium">Thinking...</p>
          </div>
        );
      case "interrupted":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">👂</div>
            <p className="text-blue-600 font-medium">Go ahead...</p>
          </div>
        );
      case "ended":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">👋</div>
            <p className="text-gray-600 font-medium">Conversation ended</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start New Conversation
            </button>
          </div>
        );
      case "error":
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">❌</div>
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  // Speaking indicator
  const renderSpeakingIndicator = () => {
    if (state !== "listening") return null;

    return (
      <div className="flex items-center justify-center gap-1 h-12 my-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-150 ${
              isSpeaking ? "bg-green-500" : "bg-gray-300"
            }`}
            style={{
              height: isSpeaking ? `${20 + Math.random() * 30}px` : "8px",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      {/* Header */}
      <header className="p-4 border-b bg-white/80 backdrop-blur">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            🎙️ Community Journalist
          </h1>
          {state !== "ended" && state !== "error" && state !== "loading" && (
            <button
              onClick={handleEndConversation}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
            >
              End Conversation
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4">
        {/* State indicator */}
        <div className="flex-shrink-0 py-8">{renderStateIndicator()}</div>

        {/* Speaking indicator */}
        {renderSpeakingIndicator()}

        {/* Error message */}
        {error && state !== "error" && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Transcript
          </h2>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg ${
                msg.sender === "journalist"
                  ? "bg-blue-50 border-l-4 border-blue-400"
                  : "bg-gray-50 border-l-4 border-gray-400"
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">
                {msg.sender === "journalist" ? "🎙️ Jamie" : "👤 You"}
              </div>
              <p className="text-gray-800">{msg.content}</p>
            </div>
          ))}
          {messages.length === 0 && state === "loading" && (
            <p className="text-gray-400 text-center italic">
              Starting conversation...
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// Helper function to convert Float32Array to WAV blob
function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Write audio data
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function ConversationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
          <div className="animate-spin text-4xl">⏳</div>
        </div>
      }
    >
      <ConversationContent />
    </Suspense>
  );
}
