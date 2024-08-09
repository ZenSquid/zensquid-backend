import * as z from "zod";

const TranscriptBlockSchema = z.object({
  personName: z.string().min(1),
  timestamp: z.string().min(1),
  text: z.string().min(1)
})

const TranscriptSchema = z.array(TranscriptBlockSchema)

export const requestSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  participants: z.array(z.string().min(1)),
  transcript: TranscriptSchema
})

export const insertMeetingMetadataSchema = z.object({
  title: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  takeaways: z.array(z.string()),
  actionItems: z.array(z.object({
    id: z.string().min(1),
    description: z.string(),
    assignee: z.string(),
    deadline: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'completed']),
  })),
  moodGraph: z.object({
    aspects: z.array(z.object({
      mood: z.string(),
      score: z.number(),
    })),
    timestamp: z.string().min(1),
  }),
  timeline: z.array(z.object({
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    topic: z.string(),
    speaker: z.string(),
  })),
  participantEngagement: z.array(z.object({
    participantId: z.string(),
    speakingTime: z.number(),
    interventionCount: z.number(),
    engagementScore: z.number(),
  })),
  sentimentOverTime: z.object({
    overallSentiment: z.number(),
    sentimentPoints: z.array(z.object({
      timestamp: z.string().min(1),
      sentiment: z.number(),
    })),
  }),
  questionTracker: z.array(z.object({
    id: z.string(),
    text: z.string(),
    askedBy: z.string(),
    timestamp: z.string().min(1),
    answered: z.boolean(),
  })),
  resourceLinks: z.array(z.object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
    type: z.enum(['document', 'website', 'video', 'other']),
    mentionedAt: z.string().min(1),
  })),
  meetingEfficiencyScore: z.number(),
})