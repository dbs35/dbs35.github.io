"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/conversation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start conversation");
      }

      const data = await response.json();
      // Navigate to conversation page with the conversation ID
      router.push(`/conversation?id=${data.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-4">
      <main className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🎙️</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Community Journalist
          </h1>
          <p className="text-gray-600 mb-6">
            Hi! I&apos;m Jamie, your community journalist. I&apos;d love to hear
            what&apos;s happening at Lincoln Elementary. Share your stories,
            ideas, or just chat about what&apos;s on your mind.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Enter your email to start
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1">
              We&apos;ll remember our past conversations so I can follow up on things
              you&apos;ve mentioned before.
            </p>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email}
            className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                Starting...
              </>
            ) : (
              <>
                🎤 Start Conversation
              </>
            )}
          </button>
        </form>

        <div className="text-center text-sm text-gray-500">
          <p>This is a voice conversation. Make sure your microphone is enabled.</p>
        </div>
      </main>
    </div>
  );
}
