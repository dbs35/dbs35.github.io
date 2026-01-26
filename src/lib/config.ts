// Configuration for the AI Journalist app

export const CONFIG = {
  communityName: process.env.COMMUNITY_NAME || "Lincoln Elementary",
  journalistName: process.env.JOURNALIST_NAME || "Jamie",
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",

  // Voice settings
  silenceThresholdMs: 2500, // 2.5 seconds of silence before processing
  maxConversationMinutes: 15,

  // Audio settings
  sampleRate: 16000,

  // Journalist persona
  journalistPersona: `You are a friendly community journalist for a school parent community.
You're curious, warm, and genuinely interested in what's happening in the school community.
You're eager to find good news but also willing to hear about problems.
You ask follow-up questions to get the full story.
Keep responses conversational and brief (1-3 sentences typically).
If someone mentions something interesting, dig deeper.
Remember details from past conversations to build rapport.`,
};

export function getJournalistSystemPrompt(userName?: string | null, userSummary?: string | null): string {
  const communityName = CONFIG.communityName;
  const journalistName = CONFIG.journalistName;

  let prompt = `You are ${journalistName}, a friendly community journalist for ${communityName}.

${CONFIG.journalistPersona}

Guidelines:
- Always be warm and conversational
- Ask open-ended follow-up questions
- If someone shares something interesting, explore it further
- Keep responses brief (1-3 sentences) to maintain natural conversation flow
- If someone wants something off the record, acknowledge it and don't include it in any articles
- Remember you're gathering material for a community newsletter
`;

  if (userName) {
    prompt += `\nYou are speaking with ${userName}.`;
  }

  if (userSummary) {
    prompt += `\n\nWhat you remember from past conversations with this person:\n${userSummary}`;
  }

  return prompt;
}

export function getGreetingPrompt(userName?: string | null, userSummary?: string | null): string {
  const communityName = CONFIG.communityName;

  if (userName && userSummary) {
    return `Generate a brief, warm greeting for ${userName}. Reference something from your past conversations: "${userSummary}". Ask an open-ended follow-up question about something they mentioned before, or ask what's new. Keep it to 1-2 sentences.`;
  } else if (userName) {
    return `Generate a brief, warm greeting for ${userName}. Since this is your first conversation, introduce yourself as a community journalist for ${communityName} and ask an open-ended question like "What's been happening at ${communityName} lately that's caught your attention?" Keep it to 2-3 sentences.`;
  } else {
    return `Generate a brief, warm greeting for a new community member. Introduce yourself as a community journalist for ${communityName} and ask an open-ended question like "What's been happening at ${communityName} lately that's interesting?" Keep it to 2-3 sentences.`;
  }
}

export function getSummaryPrompt(conversationTranscript: string): string {
  return `Summarize this conversation for your journalist notes. Focus on:
- Key topics discussed
- Any interesting quotes or insights
- Follow-up opportunities
- The person's role (parent, teacher, etc.) if mentioned

Keep the summary concise (2-4 sentences).

Conversation:
${conversationTranscript}`;
}

export function getNewsletterPrompt(conversationSummaries: string[]): string {
  return `You are writing a community newsletter based on recent conversations with community members.

Here are summaries of recent conversations:

${conversationSummaries.map((s, i) => `--- Conversation ${i + 1} ---\n${s}`).join('\n\n')}

Write a newsletter with 2-4 articles based on the most interesting topics from these conversations.

Format:
- Use plain text with simple formatting
- Each article should be 100-400 words
- Include quotes from sources (use "a parent mentioned..." or "according to a teacher..." for attribution)
- Focus on what's interesting or important to the community
- Be warm and engaging

Output the newsletter in this format:

================================================================================
[NEWSLETTER NAME] - [DATE]
================================================================================

ARTICLE 1: [Title]
--------------------------------------------------------------------------------
[Article content]

ARTICLE 2: [Title]
--------------------------------------------------------------------------------
[Article content]

[etc.]

================================================================================
`;
}
