import { EventConfig, EventHandler, Handlers } from "motia";
import { z } from "zod";

export const config: EventConfig = {
    name: "fetchVideos",
    type: "event",
    subscribes: ["yt.channel.resolved"],
    emits: ["yt.videos.fetched", "yt.videos.error"],
    input: z.object({
        jobId: z.string(),
        email: z.string().email("Invalid Email Address"),
        channelId: z.string(),
        channelName: z.string(),
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

type inputType = { jobId: string; email: string; channelId: string; channelName: string }
type HandlerType = EventHandler<inputType, unknown>

export const handler: HandlerType = async (
    input,
    { logger, state, emit }
) => {

    logger.info("Fetching videos", { input })

    let jobId: string | undefined;
    let email: string | undefined;

    try {
        const data = input || {}

        jobId = data.jobId;
        email = data.email;

        if (!jobId || !email) {
            logger.error("Missing required fields: jobId, email")
            return;
        }

        const channelId = data.channelId
        const channelName = data.channelName;

        // Job Data
        const jobData = state.get(`Job: ${jobId}`, jobId);

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "Fetching videos",
        });

        // Fetching data
        const channelsUrl = `${process.env.YOUTUBE_API}/channel/${encodeURIComponent(channelId)}`;

        const response = await fetch(channelsUrl);
        const youtubeData = await response.json();

        const foundVideos: VideoType[] = Array.isArray(youtubeData.results) ? youtubeData.results.find((v: any) => v?.title?.toLowerCase() === "videos")?.videos || [] : []

        // Videos

        if (foundVideos.length === 0) {
            logger.error("No video found for channel.", { jobId, channelId })

            await state.set(`Job: ${jobId}`, jobId, {
                ...jobData,
                status: "failed",
                error: "No videos found!",
            });

            await emit({
                topic: "yt.videos.error",
                data: {
                    jobId,
                    email,
                    channelId,
                    channelName,
                    message: "Failed to fetch videos, please try again",
                },
            });
            return;
        }


        logger.info("Videos fetch successfully!", {
            jobId,
            channelId,
            channelName,
            videoCount: foundVideos.length
        });


        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "videos fetched",
            channelId,
            channelName,
            videos: foundVideos,
        });

        await emit({
            topic: "yt.videos.fetched",
            data: {
                jobId,
                channelId,
                channelName,
                videos: foundVideos,
            },
        });

    } catch (error: any) {
        logger.error("Error resolving channel", { error: error.message });
        if (!jobId || !email) {
            logger.error("Cannot send error notification missing jobId or email");
            return;
        }

        const jobData = state.get(`Job: ${jobId}`, jobId);

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "failed",
            error: error.message,
        });

        await emit({
            topic: "yt.videos.error",
            data: {
                jobId,
                email,
                message: "Failed to fetch videos, please try again",
            },
        });
    }
};
