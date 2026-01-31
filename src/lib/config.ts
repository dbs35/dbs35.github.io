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
You ask follow-up questions to get the full story. You think that everyone has interesting and important things to say, and encourage them accordingly.
Keep responses conversational and brief (1-3 sentences typically).
If someone mentions something interesting, dig deeper.
Remember details from past conversations to build rapport.`,
};

export interface StoryAssignmentWithBackground {
  topic: string;
  backgroundInfo?: string | null;
}

export function getJournalistSystemPrompt(
  userName?: string | null,
  userSummary?: string | null,
  storyAssignments?: StoryAssignmentWithBackground[]
): string {
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

  // Add story assignments with background info
  if (storyAssignments && storyAssignments.length > 0) {
    prompt += `\n\n--- Current Story Assignments ---\nYou are currently working on the following stories. Use this background information to ask informed questions when these topics come up:\n`;

    for (const assignment of storyAssignments) {
      prompt += `\n**${assignment.topic}**`;
      if (assignment.backgroundInfo) {
        prompt += `\nBackground information:\n${assignment.backgroundInfo}\n`;
      } else {
        prompt += `\n(No background information available)\n`;
      }
    }
  }

  return prompt;
}

export function getGreetingPrompt(
  userName?: string | null,
  userSummary?: string | null,
  storyTopics?: string[]
): string {
  const communityName = CONFIG.communityName;

  let storyMention = "";
  if (storyTopics && storyTopics.length > 0) {
    const topicList = storyTopics.join(", ");
    storyMention = ` Also mention that you're currently working on stories about: ${topicList}. Invite them to share if they have any insights on those topics, but make it clear they can talk about whatever's on their mind.`;
  }

  if (userName && userSummary) {
    return `Generate a brief, warm greeting for ${userName}. Reference something from your past conversations: "${userSummary}". Ask an open-ended follow-up question about something they mentioned before, or ask what's new.${storyMention} Keep it to 2-3 sentences.`;
  } else if (userName) {
    return `Generate a brief, warm greeting for ${userName}. Since this is your first conversation, introduce yourself as a community journalist for ${communityName} and ask an open-ended question like "What's been happening at ${communityName} lately that's caught your attention?"${storyMention} Keep it to 2-3 sentences.`;
  } else {
    return `Generate a brief, warm greeting for a new community member. Introduce yourself as a community journalist for ${communityName} and ask an open-ended question like "What's been happening at ${communityName} lately that's interesting?"${storyMention} Keep it to 2-3 sentences.`;
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

export function getNewsletterPrompt(
  conversationSummaries: string[],
  editorialContext?: string | null,
  storyBacklog?: string | null
): string {
  let prompt = `You are writing a community newsletter based on recent conversations with community members.

Here are summaries of recent conversations:

${conversationSummaries.map((s, i) => `--- Conversation ${i + 1} ---\n${s}`).join('\n\n')}
`;

  if (storyBacklog) {
    prompt += `
--- Story Leads from Previous Conversations ---
These are interesting topics from past conversations that haven't been covered yet. Consider including them if relevant:
${storyBacklog}
`;
  }

  if (editorialContext) {
    prompt += `
--- Previously Published Topics ---
These topics have already been covered in past newsletters. Do NOT repeat them unless there is genuinely new information or a significant update:
${editorialContext}
`;
  }

  prompt += `
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

  return prompt;
}

export function getPublishedTopicsPrompt(newsletterContent: string): string {
  return `Analyze this newsletter and create a concise summary of the main topics that were covered. This summary will be used to avoid repeating the same stories in future newsletters.

Newsletter:
${newsletterContent}

Create a bullet-point summary of the key topics covered. For each topic, include:
- What the story was about
- Key details mentioned
- Approximate timeframe if relevant

Keep it concise but informative enough that a journalist would know not to repeat these stories.`;
}

export function getUnpublishedLeadsPrompt(
  conversationSummaries: string[],
  newsletterContent: string
): string {
  return `Compare the source conversations with the published newsletter and identify any interesting story leads that were NOT included in the newsletter.

Source conversations:
${conversationSummaries.map((s, i) => `--- Conversation ${i + 1} ---\n${s}`).join('\n\n')}

Published newsletter:
${newsletterContent}

Identify any interesting topics, tips, or story ideas from the conversations that did NOT make it into the newsletter. These might include:
- Minor mentions that could become bigger stories
- Follow-up opportunities
- Emerging trends or concerns
- Human interest angles

If there are no significant unpublished leads, respond with "No additional leads identified."

Format as a bullet-point list of potential story leads, each with a brief description of why it might be worth following up.`;
}
