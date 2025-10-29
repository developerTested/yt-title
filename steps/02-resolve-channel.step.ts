import { EventConfig, Handlers } from "motia";
import { z } from "zod";

export const config: EventConfig = {
    name: "ResolveChannel",
    type: "event",
    subscribes: ["yt.submit"],
    emits: ["yt.channel.resolved", "yt.channel.error"],
    input: z.object({
        email: z.string().email("Invalid Email Address"),
        channel: z.string(),
        jobId: z.string().optional(),
    }),
};

export const handler: Handlers["ResolveChannel"] = async (
    input,
    { logger, state, emit }
) => {
    logger.info("Processing message", input);

    let jobId: string | undefined;
    let email: string | undefined;

    try {
        jobId = input.jobId;
        email = input.email;

        if (!jobId) {
            throw new Error("JOB id is missing");
        }

        const channel = input.channel;

        logger.info("Resolving Youtube Channel", { jobId, channel });

        const jobData = state.get(`Job: ${jobId}`, jobId);

        await state.set(`Job: ${jobId}`, jobId, {
            ...jobData,
            status: "resolving channel",
        });

        let channelId;
        let channelName;

        if (channel.startsWith("@")) {
            const handle = channel.substring(1);

            const channelsUrl = `${process.env.YOUTUBE_API
                }/channel/${encodeURIComponent(handle)}`;

            const channelsRes = await fetch(channelsUrl);
            const channelsData = await channelsRes.json();

            if (channelsData.id) {
                channelId = channelsData.id;
                channelName = channelsData.title;
                const subscribers = channelsData?.subscriber || 0;
                const videos = channelsData?.videos || 0;

                logger.info("Resolved channel by handle", {
                    channelId,
                    channelName,
                    subscribers,
                    videos,
                });
            }
        } else {
            const channelsUrl = `${process.env.YOUTUBE_API
                }/channel/${encodeURIComponent(channel)}`;

            console.log(channelsUrl);

            const channelsRes = await fetch(channelsUrl);
            const channelsData = await channelsRes.json();

            if (channelsData.id) {
                channelId = channelsData.id;
                channelName = channelsData.title;
                const subscribers = channelsData?.subscriber || 0;
                const videos = channelsData?.videos || 0;

                logger.info("Resolved channel:", {
                    channelId,
                    channelName,
                    subscribers,
                    videos,
                });
            }
        }

        if (!channelId) {
            logger.error("Channel not found!", { channel });

            await state.set(`Job: ${jobId}`, jobId, {
                ...jobData,
                status: "failed",
                error: "Channel not found!",
            });

            return;
        }

        await emit({
            topic: "yt.channel.resolved",
            data: {
                jobId,
                email,
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
            topic: "yt.channel.error",
            data: {
                jobId,
                email,
                message: "Failed to resolve channel, please try again",
            },
        });
    }
};
