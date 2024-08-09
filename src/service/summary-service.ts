import { SquidService, webhook } from "@squidcloud/backend";
import { WebhookRequest } from "@squidcloud/backend";
import { requestSchema, insertMeetingMetadataSchema } from "schema";
import type { TranscriptBlock } from "types";
import PptxGenJS from "pptxgenjs";
import { z } from "zod";

export class SummaryService extends SquidService {
  @webhook("summary-service-webhook")
  async handleSummary(request: WebhookRequest): Promise<object> {
    const parsedRequest = requestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return {
        success: false,
        error: "Invalid request",
      };
    }

    const { id, email, transcript } = parsedRequest.data;
    const prompt = generatePrompt(transcript);
    const result = await this.squid
      .ai()
      .chatbot("zenai")
      .ask("zenai-summary-bot", prompt, {
        responseFormat: "json_object",
        temperature: 0.3,
      });

    const parsedResult = insertMeetingMetadataSchema.safeParse(JSON.parse(result));
    if (!parsedResult.success) {
      return {
        success: false,
        error: parsedResult.error,
      };
    }

    const res = await fetch(`${process.env.BACKEND_API_URL}/meeting`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        email,
        ...parsedResult.data,
      }),
    });

    if (!res.ok) {
      return {
        success: false,
        error: "Failed to update meeting metadata",
      };
    }

    const pptxBlob = await this.generatePresentation(parsedResult.data, id);
    const uploadUrl = await this.getPresignedUploadUrl(`presentation-${id}.pptx`);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: pptxBlob,
    });

    if (!uploadRes.ok) {
      return {
        success: false,
        error: "Failed to upload presentation",
      };
    }

    return {
      success: true,
      error: null,
    };
  }

  private async generatePresentation(data: z.infer<typeof insertMeetingMetadataSchema>, id: string) {
    const pptx = new PptxGenJS();

    let slide = pptx.addSlide();
    slide.addText(data.title, { x: 1, y: 1, w: '80%', h: 1, fontSize: 24, bold: true });

    slide = pptx.addSlide();
    slide.addText("Summary", { x: 1, y: 0.5, fontSize: 18, bold: true });
    slide.addText(data.description, { x: 1, y: 1, w: '80%', h: 4, fontSize: 14 });

    slide = pptx.addSlide();
    slide.addText("Key Points", { x: 1, y: 0.5, fontSize: 18, bold: true });
    data.takeaways.forEach((point: string, index: number) => {
      slide.addText(`• ${point}`, { x: 1, y: 1 + index * 0.5, fontSize: 14 });
    });

    slide = pptx.addSlide();
    slide.addText("Action Items", { x: 1, y: 0.5, fontSize: 18, bold: true });
    data.actionItems.forEach((item, index: number) => {
      slide.addText(`• ${item.description}`, { x: 1, y: 1 + index * 0.5, fontSize: 14 });
    });

    return pptx.write()
  }

  private async getPresignedUploadUrl(id: string): Promise<string> {
    const response = await fetch(`${process.env.BACKEND_API_URL}/signed-url/${id}`);

    if (!response.ok) {
      throw new Error('Failed to get pre-signed upload URL');
    }

    const data = await response.json();
    return data.url;
  }
}

const generatePrompt = (transcript: TranscriptBlock[]) => {
  return `You are tasked with analyzing a provided meeting transcript and generating a summary in the specified format. The transcript is provided as an array of objects, where each object represents a block of text spoken by a participant. Each block has the following properties:

- \`personName\`: the name of the participant who spoke the text
- \`timestamp\`: the timestamp of when the text was spoken 
- \`text\`: the actual text spoken by the participant

${JSON.stringify(transcript, null, 2)}

Your goal is to process this transcript and output a meeting metadata object that includes the following properties:
All Date and Time values should be in ISOString format. ALL THE SCORES SHOULD BE NUMBERS.

\`\`\`json
{
  "title": "a short, descriptive title for the meeting",
  "shortDescription": "a brief summary of the meeting",
  "description": "a longer, more detailed description of the meeting, must be at least 400 characters",
  "takeaways": "a list of key takeaways or insights from the meeting",
  "actionItems": [
    {
      "id": "a unique identifier for the action item",
      "description": "a description of the action item",
      "assignee": "the person assigned to the action item",
      "deadline": "the deadline for the action item, ISOString format",
      "status": "the current status of the action item ('pending', 'in_progress', 'completed')"
    }
  ],
  "moodGraph": {
    "aspects": [
      {
        "mood": "the aspect or type of mood being tracked e.g. 'happiness', 'stress', 'engagement'",
        "score": "the score or intensity of that mood e.g. 0-100 number"
      },
      {
        "mood": "the aspect or type of mood being tracked e.g. 'happiness', 'stress', 'engagement', 'confusion'",, 'engagement'",
        "score": "the score or intensity of that mood e.g. 0-100 number"
      },
      {
        "mood": "the aspect or type of mood being tracked e.g. 'happiness', 'stress', 'engagement', 'confusion'",, 'engagement'",
        "score": "the score or intensity of that mood e.g. 0-100 number"
      }
    ],
    "timestamp": "the timestamp associated with the mood data"
  },
  "timeline": [
    {
      "startTime": "the start time of the timeline event",
      "endTime": "the end time of the timeline event",
      "topic": "the topic or subject of the timeline event",
      "speaker": "the speaker or presenter of the timeline event"
    }
  ],
  "participantEngagement": [
    {
      "participantId": "the unique identifier of the participant",
      "speakingTime": "the total time the participant spent speaking - number",
      "interventionCount": "the number of times the participant intervened or spoke up - number",
      "engagementScore": "an overall engagement score for the participant - number"
    }
  ],
  "sentimentOverTime": {
    "overallSentiment": "the overall sentiment score for the meeting - number",
    "sentimentPoints": [
      {
        "timestamp": "the timestamp associated with the sentiment data",
        "sentiment": "the sentiment score at that timestamp - number"
      }
    ]
  },
  "questionTracker": [
    {
      "id": "a unique identifier for the question",
      "text": "the text of the question",
      "askedBy": "the participant who asked the question",
      "timestamp": "the timestamp when the question was asked",
      "answered": "a boolean indicating whether the question was answered"
    }
  ],
  "resourceLinks": [
    {
      "id": "a unique identifier for the resource link",
      "url": "the URL of the resource",
      "title": "the title or description of the resource",
      "type": "the type of resource ('document', 'website', 'video', 'other')",
      "mentionedAt": "the timestamp when the resource was mentioned"
    }
  ],
  "meetingEfficiencyScore": "an overall score representing the efficiency of the meeting - number"
}

The input for this task is the meeting transcript, provided as an array of objects with the following structure:

\`\`\`json
{
  "transcript": [
    {
      "personName": "string",
      "timestamp": "string",
      "text": "string"
    }
  ]
}
\`\`\`

Your task is to process this transcript and generate the meeting metadata object as described above. NEVER INCLUDE ANY PERSONAL INFORMATION, NEVER ADD INFORMATION THAT ISNT IN THE TRANSCRIPT, AND NEVER INCLUDE ANYTHING THAT COULD BE CONSIDERED OFFENSIVE OR INAPPROPRIATE. The output should be a JSON object that adheres to the specified format. Good luck!
`;
};

const fake = [
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:00:00Z",
    text: "Good morning, everyone. Let's get started with today's meeting.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:01:00Z",
    text: "Morning, Alice. I have the status report ready for our project.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:02:00Z",
    text: "Great, Bob. Let's hear it.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:03:00Z",
    text: "So far, we've completed 75% of the tasks. We are on track for the upcoming milestone.",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:04:00Z",
    text: "That's good to hear. Any blockers or issues we should be aware of?",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:05:00Z",
    text: "We have a minor issue with the new API integration, but we are working on it.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:06:00Z",
    text: "Thanks, Bob. Keep us updated on the progress. Next, let's discuss the budget.",
  },
  {
    personName: "Dave",
    timestamp: "2024-08-08T09:07:00Z",
    text: "I've reviewed the budget and we are slightly over in marketing expenses.",
  },
  {
    personName: "Eve",
    timestamp: "2024-08-08T09:08:00Z",
    text: "Can we reallocate some funds from the contingency budget to cover it?",
  },
  {
    personName: "Dave",
    timestamp: "2024-08-08T09:09:00Z",
    text: "Yes, that should work. I'll update the budget accordingly.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:10:00Z",
    text: "Good plan, Dave. Now, let's move on to the new project proposal.",
  },
  {
    personName: "Frank",
    timestamp: "2024-08-08T09:11:00Z",
    text: "I've prepared the proposal for the new marketing campaign. It includes a detailed strategy and expected outcomes.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:12:00Z",
    text: "Thanks, Frank. Everyone, please review the proposal and provide your feedback by the end of the day.",
  },
  {
    personName: "Grace",
    timestamp: "2024-08-08T09:13:00Z",
    text: "Will do. Also, I have a quick update on the client feedback for the recent product launch.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:14:00Z",
    text: "Go ahead, Grace.",
  },
  {
    personName: "Grace",
    timestamp: "2024-08-08T09:15:00Z",
    text: "The feedback has been overwhelmingly positive. Clients are particularly impressed with the new features.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:16:00Z",
    text: "That's excellent news. Let's keep up the good work. Any other updates before we wrap up?",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:17:00Z",
    text: "None from my side.",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:18:00Z",
    text: "All good here as well.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:19:00Z",
    text: "Alright, thank you everyone. Meeting adjourned.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:20:00Z",
    text: "Before we leave, I have a quick announcement.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:21:00Z",
    text: "What is it, Alice?",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:22:00Z",
    text: "We have a new team member joining us next week. Please welcome John.",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:23:00Z",
    text: "Welcome, John! Looking forward to working with you.",
  },
  {
    personName: "John",
    timestamp: "2024-08-08T09:24:00Z",
    text: "Thank you, everyone. I'm excited to be here.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:25:00Z",
    text: "Alright, that's all for today. Have a great day, everyone.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:26:00Z",
    text: "You too, Alice. Bye everyone.",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:27:00Z",
    text: "Bye!",
  },
  {
    personName: "Dave",
    timestamp: "2024-08-08T09:28:00Z",
    text: "See you all tomorrow.",
  },
  {
    personName: "Eve",
    timestamp: "2024-08-08T09:29:00Z",
    text: "Take care!",
  },
  {
    personName: "Frank",
    timestamp: "2024-08-08T09:30:00Z",
    text: "Bye everyone.",
  },
  {
    personName: "Grace",
    timestamp: "2024-08-08T09:31:00Z",
    text: "Bye!",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:32:00Z",
    text: "Remember to send me your feedback on the proposal by the end of the day.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:33:00Z",
    text: "Will do, Alice.",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:34:00Z",
    text: "Got it.",
  },
  {
    personName: "Dave",
    timestamp: "2024-08-08T09:35:00Z",
    text: "I'll review it after lunch.",
  },
  {
    personName: "Eve",
    timestamp: "2024-08-08T09:36:00Z",
    text: "Same here.",
  },
  {
    personName: "Frank",
    timestamp: "2024-08-08T09:37:00Z",
    text: "I'll make sure to send my feedback.",
  },
  {
    personName: "Grace",
    timestamp: "2024-08-08T09:38:00Z",
    text: "I'll get it done ASAP.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:39:00Z",
    text: "Thanks, everyone. Have a productive day!",
  },
  {
    personName: "John",
    timestamp: "2024-08-08T09:40:00Z",
    text: "Looking forward to getting started with the team.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:41:00Z",
    text: "We'll have a brief orientation session for you tomorrow, John.",
  },
  {
    personName: "John",
    timestamp: "2024-08-08T09:42:00Z",
    text: "Sounds good, Alice.",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:43:00Z",
    text: "Alright, take care everyone.",
  },
  {
    personName: "Bob",
    timestamp: "2024-08-08T09:44:00Z",
    text: "Bye!",
  },
  {
    personName: "Charlie",
    timestamp: "2024-08-08T09:45:00Z",
    text: "Bye!",
  },
  {
    personName: "Dave",
    timestamp: "2024-08-08T09:46:00Z",
    text: "See you!",
  },
  {
    personName: "Eve",
    timestamp: "2024-08-08T09:47:00Z",
    text: "Bye!",
  },
  {
    personName: "Frank",
    timestamp: "2024-08-08T09:48:00Z",
    text: "Take care!",
  },
  {
    personName: "Grace",
    timestamp: "2024-08-08T09:49:00Z",
    text: "Bye!",
  },
  {
    personName: "Alice",
    timestamp: "2024-08-08T09:50:00Z",
    text: "Goodbye!",
  },
  {
    personName: "John",
    timestamp: "2024-08-08T09:51:00Z",
    text: "See you tomorrow!",
  },
];
