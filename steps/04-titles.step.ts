import { EventConfig, EventHandler } from "motia";
import { z } from "zod";

export const config: EventConfig = {
    name: "GenerateTittles",
    type: "event",
    subscribes: ["yt.videos.fetched"],
    emits: ["yt.titles.ready", "yt.titles.error"],
    input: z.object({
        jobId: z.string(),
        email: z.string().email("Invalid Email Address"),
        channelId: z.string(),
        channelName: z.string(),
        videos: z.array(z.string()),
    }),
};

type VideoType = {
    id: string;
    type: "video";
    title: string;
    thumbnail: {
        url: string;
        width: number;
        height: number;
    };
    publishedAt: string;
    views: string;
    channel: {
        id: string;
        url: string;
        verified: boolean;
        artist: boolean;
    };
    isLive: boolean;
};

type ImprovedTitlesType = {
    original: string,
    improved: string,
    rationale: string,
    url?: string,
}


type inputType = {
    jobId: string;
    email: string;
    channelId: string;
    channelName: string;
    videos: VideoType[];
};
type HandlerType = EventHandler<inputType, unknown>;

export const handler: HandlerType = async (input, { logger, state, emit }) => {

    const inPutData = {
        ...input,
        videos: input.videos.length || 0
    }

    logger.info("Generating titles using data", { inPutData })

    let jobId: string | undefined;
    let email: string | undefined;

    try {
        jobId = input.jobId;
        email = input.email;

        const channelName = input.channelName;
        const videos = input.videos;

        if (!channelName) {
            throw new Error("Generation failed: Channel name is missing");
        }

        if (!videos.length) {
            throw new Error("Videos are missing");
        }

        const AI_API_KEY = process.env.AI_API_KEY;

        if (!AI_API_KEY) {
            throw new Error("Gemini API key is not configured");
        }

        // Job Data
        const jobData = state.get(`Job: ${jobId}`, jobId);

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "Generating titles",
        });

        const videoTitles = videos
            .map((video: VideoType, idx: number) => `${idx + 1}. "${video.title}"`)
            .join("\n");

        const prompt = `
You are a YouTube title optimization expert. Below are ${videos.length} video titles from the channel "${channelName}".

For each title, provide:
1. An improved version that is more engaging,
SEO-friendly, and likely to get more clicks
2. A brief rationale (1-2 sentences) explaining why the
improved title is better

Guidelines:
- Keep the core topic and authenticity
- Use action verbs, numbers, and specific value
propositions
- Make it curiosity-inducing without being clickbait
- Optimize for searchability and clarity

Video Titles:
${videoTitles}

Respond in JSON format:
{
    "titles": [
        {    
            "original": "...",
            "improved": " ... ",
            "rationale": "... ",
        }
    ]
}
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
            method: "post",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": AI_API_KEY,
            },
            body: JSON.stringify(
                {
                    system_instruction: {
                        parts: [
                            {
                                "text": "You are a Youtube CEO and engagement expert who help creators write better video title."
                            }
                        ]
                    },
                    contents: [
                        {
                            parts: [
                                { text: prompt }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        topP: 0.8,
                        topK: 10,
                        responseMimeType: "application/json"
                    }
                }
            ),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${errorData?.error?.message || "Unknown API Error"}`)
        }

        const aiResponse = await response.json();
        const aiContentResponse = aiResponse['candidates'][0]['content']['parts'][0]['text'];

        const aiContent = JSON.parse(aiContentResponse)

        const improvedTitles: ImprovedTitlesType[] = aiContent.titles.map((title: ImprovedTitlesType, idx: number) => ({
            original: title.original,
            improved: title.improved,
            rationale: title.rationale,
            url: `https://www.youtube.com/watch?v=${videos[idx].id}`
        }))

        logger.info("Title generated successfully!", { jobId, count: improvedTitles.length, improvedTitles })

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "titles ready",
            improvedTitles,
        });

        await emit({
            topic: "yt.titles.ready",
            data: {
                jobId,
                email,
                channelName,
                improvedTitles,
            },
        });

        return;


    } catch (error: any) {
        logger.error("Error while generating improved titles", { error: error.message });

        const jobId = input.jobId;
        const email = input.email;

        if (!jobId || !email) {
            logger.error(
                "Unable to generate titles missing required fields: jobId or email"
            );
            return;
        }

        const jobData = state.get(`Job: ${jobId}`, jobId);

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "failed",
            error: error.message,
        });

        await emit({
            topic: "yt.titles.error",
            data: {
                jobId,
                email,
                message: "Failed to generate titles, please try again",
            },
        });
    }
};
