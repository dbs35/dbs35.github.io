"use client";

import { useState, useEffect, useCallback } from "react";

interface Conversation {
  id: string;
  userEmail: string;
  userName: string | null;
  status: string;
  summary: string | null;
  createdAt: string;
  endedAt: string | null;
  messageCount: number;
  lastMessageAt: string;
}

interface Message {
  id: string;
  senderType: string;
  content: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  userEmail: string;
  userName: string | null;
  userSummary: string | null;
  status: string;
  summary: string | null;
  createdAt: string;
  endedAt: string | null;
  messages: Message[];
}

interface StoryAssignment {
  id?: string;
  topic: string;
  pdfFileName?: string | null;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [newsletterContent, setNewsletterContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [storyAssignments, setStoryAssignments] = useState<StoryAssignment[]>([{ topic: "" }]);
  const [isSavingTopics, setIsSavingTopics] = useState(false);
  const [topicsLoaded, setTopicsLoaded] = useState(false);
  const [uploadingPdfId, setUploadingPdfId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/conversations?email=${encodeURIComponent(email)}`);

      if (!response.ok) {
        if (response.status === 401) {
          setIsAuthenticated(false);
          throw new Error("Unauthorized. Please check your admin email.");
        }
        throw new Error("Failed to fetch conversations");
      }

      const data = await response.json();
      setConversations(data.conversations);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  const fetchStoryAssignments = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/story-assignments?email=${encodeURIComponent(email)}`);
      if (response.ok) {
        const data = await response.json();
        const assignments = data.assignments.map((a: { id: string; topic: string; pdfFileName?: string | null }) => ({
          id: a.id,
          topic: a.topic,
          pdfFileName: a.pdfFileName,
        }));
        setStoryAssignments(assignments.length > 0 ? assignments : [{ topic: "" }]);
        setTopicsLoaded(true);
      }
    } catch (err) {
      console.error("Failed to fetch story assignments:", err);
    }
  }, [email]);

  const saveStoryAssignments = async () => {
    setIsSavingTopics(true);
    setError("");

    try {
      const response = await fetch("/api/admin/story-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, assignments: storyAssignments }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save story assignments");
      }

      // Update local state with returned assignments (includes new IDs)
      const data = await response.json();
      const assignments = data.assignments.map((a: { id: string; topic: string; pdfFileName?: string | null }) => ({
        id: a.id,
        topic: a.topic,
        pdfFileName: a.pdfFileName,
      }));
      setStoryAssignments(assignments.length > 0 ? assignments : [{ topic: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSavingTopics(false);
    }
  };

  const addTopicField = () => {
    setStoryAssignments([...storyAssignments, { topic: "" }]);
  };

  const removeTopicField = (index: number) => {
    if (storyAssignments.length > 1) {
      setStoryAssignments(storyAssignments.filter((_, i) => i !== index));
    } else {
      setStoryAssignments([{ topic: "" }]);
    }
  };

  const updateTopic = (index: number, value: string) => {
    const newAssignments = [...storyAssignments];
    newAssignments[index] = { ...newAssignments[index], topic: value };
    setStoryAssignments(newAssignments);
  };

  const handlePdfUpload = async (assignmentId: string, file: File) => {
    setUploadingPdfId(assignmentId);
    setError("");

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("pdf", file);

      const response = await fetch(`/api/admin/story-assignments/${assignmentId}/pdf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload PDF");
      }

      const data = await response.json();

      // Update local state with the new filename
      setStoryAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId ? { ...a, pdfFileName: data.pdfFileName } : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploadingPdfId(null);
    }
  };

  const handlePdfDelete = async (assignmentId: string) => {
    setError("");

    try {
      const response = await fetch(
        `/api/admin/story-assignments/${assignmentId}/pdf?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete PDF");
      }

      // Update local state
      setStoryAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId ? { ...a, pdfFileName: null } : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const fetchConversationDetail = async (id: string) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/conversations/${id}?email=${encodeURIComponent(email)}`);

      if (!response.ok) {
        throw new Error("Failed to fetch conversation");
      }

      const data = await response.json();
      setSelectedConversation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewsletter = async () => {
    setIsGenerating(true);
    setError("");
    setNewsletterContent("");

    try {
      const response = await fetch("/api/admin/newsletter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate newsletter");
      }

      const data = await response.json();
      setNewsletterContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const resetContext = async () => {
    setIsResetting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/reset-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reset context");
      }

      // Clear local state
      setConversations([]);
      setSelectedConversation(null);
      setNewsletterContent("");
      setShowResetConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsResetting(false);
    }
  };

  const publishNewsletter = async () => {
    setIsPublishing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/newsletter/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to publish newsletter");
      }

      // Clear newsletter content and refresh conversations
      setNewsletterContent("");
      setShowPublishConfirm(false);
      fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsPublishing(false);
    }
  };

  // Fetch story assignments when authenticated
  useEffect(() => {
    if (isAuthenticated && !topicsLoaded) {
      fetchStoryAssignments();
    }
  }, [isAuthenticated, topicsLoaded, fetchStoryAssignments]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchConversations();
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Time ago helper
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Admin Login</h1>
          <p className="text-gray-600 mb-6">
            Enter your admin email to access the dashboard.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
            />

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Loading..." : "Access Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Admin Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{email}</span>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Reset context
            </button>
            <button
              onClick={() => {
                setIsAuthenticated(false);
                setConversations([]);
                setSelectedConversation(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-6 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversations list */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Conversations ({conversations.length})
              </h2>
              <button
                onClick={fetchConversations}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Refresh
              </button>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-gray-500 text-center">
                  No conversations yet
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => fetchConversationDetail(conv.id)}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition ${
                      selectedConversation?.id === conv.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">
                        {conv.userName || conv.userEmail}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          conv.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {conv.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {conv.messageCount} messages - {timeAgo(conv.lastMessageAt)}
                    </div>
                    {conv.summary && (
                      <div className="text-xs text-gray-400 mt-1 truncate">
                        {conv.summary}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Conversation detail */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedConversation ? "Transcript" : "Select a conversation"}
              </h2>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {selectedConversation ? (
                <div className="space-y-4">
                  {/* User info */}
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">
                      {selectedConversation.userName || "Unknown"}
                    </div>
                    <div className="text-gray-500">
                      {selectedConversation.userEmail}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      Started: {formatDate(selectedConversation.createdAt)}
                    </div>
                  </div>

                  {/* Messages */}
                  {selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.senderType === "JOURNALIST"
                          ? "bg-blue-50 border-l-4 border-blue-400"
                          : "bg-gray-50 border-l-4 border-gray-400"
                      }`}
                    >
                      <div className="text-xs text-gray-500 mb-1">
                        {msg.senderType === "JOURNALIST" ? "Storyteller" : "User"} -{" "}
                        {formatDate(msg.createdAt)}
                      </div>
                      <p className="text-gray-800 text-sm">{msg.content}</p>
                    </div>
                  ))}

                  {/* Summary if available */}
                  {selectedConversation.summary && (
                    <div className="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-400">
                      <div className="text-xs text-yellow-700 font-medium mb-1">
                        AI Summary
                      </div>
                      <p className="text-sm text-gray-800">
                        {selectedConversation.summary}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  Click a conversation to view the transcript
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Story Assignments */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Story Assignments
            </h2>
            <button
              onClick={saveStoryAssignments}
              disabled={isSavingTopics}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingTopics ? "Saving..." : "Save"}
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              Enter story topics you&apos;re working on. The storyteller will mention these when greeting users.
              You can upload a PDF for each topic to provide background information.
            </p>
            <div className="space-y-3">
              {storyAssignments.map((assignment, index) => (
                <div key={assignment.id || index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={assignment.topic}
                      onChange={(e) => updateTopic(index, e.target.value)}
                      placeholder="Enter a story topic..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
                    />
                    <button
                      onClick={() => removeTopicField(index)}
                      className="px-3 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Remove topic"
                    >
                      &times;
                    </button>
                  </div>
                  {/* PDF upload section - only show for saved assignments */}
                  {assignment.id && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {assignment.pdfFileName ? (
                        <>
                          <span className="text-gray-600">
                            PDF: <span className="font-medium">{assignment.pdfFileName}</span>
                          </span>
                          <button
                            onClick={() => handlePdfDelete(assignment.id!)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="cursor-pointer text-blue-600 hover:text-blue-700">
                            {uploadingPdfId === assignment.id ? "Uploading..." : "Upload PDF"}
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              disabled={uploadingPdfId === assignment.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handlePdfUpload(assignment.id!, file);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                          <span className="text-gray-400">(optional background info)</span>
                        </>
                      )}
                    </div>
                  )}
                  {!assignment.id && (
                    <div className="mt-2 text-sm text-gray-400">
                      Save to enable PDF upload
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addTopicField}
              className="mt-3 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
            >
              + Add another topic
            </button>
          </div>
        </div>

        {/* Newsletter generation */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Newsletter Generation
            </h2>
            <button
              onClick={generateNewsletter}
              disabled={isGenerating}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? "Generating..." : "Generate Newsletter Draft"}
            </button>
          </div>
          <div className="p-4">
            {newsletterContent ? (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                    {newsletterContent}
                  </pre>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => navigator.clipboard.writeText(newsletterContent)}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={() => setShowPublishConfirm(true)}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                  >
                    Newsletter Published
                  </button>
                  <button
                    onClick={() => setNewsletterContent("")}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                {isGenerating
                  ? "Generating newsletter from recent conversations..."
                  : "Click 'Generate Newsletter Draft' to create a newsletter from completed conversations."}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Reset Context Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Reset Context
            </h3>
            <p className="text-gray-600 mb-4">
              This will permanently delete all conversations, messages, and generated newsletters. User conversation summaries will also be cleared. This action cannot be undone.
            </p>
            <p className="text-red-600 font-medium mb-6">
              Are you sure you want to continue?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={resetContext}
                disabled={isResetting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResetting ? "Resetting..." : "Yes, Reset Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Newsletter Published Confirmation Modal */}
      {showPublishConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Mark Newsletter as Published
            </h3>
            <p className="text-gray-600 mb-4">
              This will archive the source conversations and extract any unpublished story leads for future newsletters. The AI will remember what was published and avoid repeating it.
            </p>
            <p className="text-gray-600 mb-6">
              <strong>What happens:</strong>
              <br />• Published topics are saved to editorial memory
              <br />• Unpublished leads are saved to the story backlog
              <br />• Source conversations are marked as published
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPublishConfirm(false)}
                disabled={isPublishing}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={publishNewsletter}
                disabled={isPublishing}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? "Processing..." : "Yes, Mark as Published"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
