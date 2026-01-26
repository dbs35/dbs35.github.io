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
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Voice detection refs
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Constants
  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_DURATION_MS = 2500;
  const SPEECH_THRESHOLD = 0.03;

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  // Play audio and handle state transitions
  const playAudio = useCallback(
    (audioData: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const audio = new Audio(audioData);
        currentAudioRef.current = audio;

        audio.onended = () => {
          currentAudioRef.current = null;
          resolve();
        };

        audio.onerror = (e) => {
          currentAudioRef.current = null;
          reject(e);
        };

        audio.play().catch(reject);
      });
    },
    []
  );

  // Stop current audio playback
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
      mediaRecorderRef.current.start();
    }
  }, []);

  // Stop recording and return audio blob
  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve(new Blob(audioChunksRef.current, { type: "audio/webm" }));
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        resolve(audioBlob);
      };

      mediaRecorderRef.current.stop();
    });
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

        // Play response
        setState("ai_speaking");
        await playAudio(data.journalistAudio);
        setState("listening");
        startRecording();
      } catch (err) {
        console.error("Error sending audio:", err);
        setError("Failed to process your response. Please try again.");
        setState("listening");
        startRecording();
      }
    },
    [conversationId, playAudio, startRecording]
  );

  // Voice activity detection loop
  const detectVoiceActivity = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
    setVolumeLevel(average);

    // State-specific handling
    if (state === "ai_speaking") {
      // Check if user is trying to interrupt
      if (average > SPEECH_THRESHOLD) {
        stopAudio();
        setState("interrupted");
        // Brief pause then switch to listening
        setTimeout(() => {
          setState("listening");
          startRecording();
        }, 300);
      }
    } else if (state === "listening") {
      if (average > SILENCE_THRESHOLD) {
        // User is speaking
        isSpeakingRef.current = true;
        silenceStartRef.current = null;
      } else if (isSpeakingRef.current) {
        // User was speaking but now silent
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION_MS) {
          // Silence duration exceeded - process the audio
          isSpeakingRef.current = false;
          silenceStartRef.current = null;

          stopRecording().then((audioBlob) => {
            if (audioBlob.size > 0) {
              sendAudio(audioBlob);
            } else {
              // No audio recorded, keep listening
              startRecording();
            }
          });
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(detectVoiceActivity);
  }, [state, stopAudio, startRecording, stopRecording, sendAudio]);

  // Initialize audio and start conversation
  useEffect(() => {
    if (!conversationId) {
      router.push("/");
      return;
    }

    let mounted = true;

    const initializeConversation = async () => {
      try {
        // Get conversation data from URL params (set by redirect)
        // We need to fetch the greeting from the API if not in params
        // For now, assume we need to make another request or the greeting was passed

        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Set up audio context and analyser
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // Set up media recorder
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        if (!mounted) return;

        // Fetch greeting and start
        // Note: The greeting was already created when conversation started
        // We need to fetch it or have it passed through
        const response = await fetch(`/api/conversation/${conversationId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.greetingAudio) {
            setMessages([
              { sender: "journalist", content: data.greetingText, timestamp: new Date() },
            ]);
            setState("ai_speaking");
            await playAudio(data.greetingAudio);
          }
        }

        if (!mounted) return;

        setState("listening");
        startRecording();
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
  }, [conversationId, router, cleanup, playAudio, startRecording]);

  // Run voice detection loop
  useEffect(() => {
    if (state === "ai_speaking" || state === "listening") {
      animationFrameRef.current = requestAnimationFrame(detectVoiceActivity);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, detectVoiceActivity]);

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
            <div className="text-4xl">🎤</div>
            <p className="text-green-600 font-medium">Listening...</p>
            <p className="text-xs text-gray-500">Speak now</p>
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

  // Volume visualizer
  const renderVolumeIndicator = () => {
    if (state !== "listening" && state !== "ai_speaking") return null;

    const bars = 5;
    const activeHeight = Math.floor(volumeLevel * 100);

    return (
      <div className="flex items-end justify-center gap-1 h-12 my-4">
        {Array.from({ length: bars }).map((_, i) => {
          const barHeight = Math.min(100, activeHeight * (1 + i * 0.2));
          return (
            <div
              key={i}
              className={`w-2 rounded-full transition-all duration-75 ${
                state === "listening" ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{
                height: `${Math.max(8, barHeight)}%`,
              }}
            />
          );
        })}
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

        {/* Volume indicator */}
        {renderVolumeIndicator()}

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

export default function ConversationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    }>
      <ConversationContent />
    </Suspense>
  );
}
