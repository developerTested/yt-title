import { ApiRouteConfig, ApiRouteHandler, Handlers } from "motia";

export const config: ApiRouteConfig = {
  name: "SubmitChannel",
  type: "api",
  path: "/lol",
  method: "POST",
  emits: ["yt.submit"],
};

export const handler: Handlers["SubmitChannel"] = async (
  req,
  { logger, emit, state }
) => {
  try {
    logger.info("Received submission request", { body: req.body });
    const { channel, email } = req.body;

    if (!channel || !email) {
      return {
        status: 400,
        body: { message: "Missing required fields: channel and email" },
      };
    }

    const jobId = `Job_${Date.now()}_${Math.random()}}`;

    const job = {
      jobId,
      email,
      channel,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    // Store an item in a group
    await state.set(`job: ${jobId}`, jobId, job);

    logger.info("Job Created!", { jobId, channel, email });

    // Trigger processing
    await emit({
      topic: "yt.submit",
      data: { jobId, channel, email },
    });

    return {
      status: 201,
      success: true,
      jobId,
      message:
        "You request has been queued! You will get soon an email with improved videos title.",
    };
  } catch (error: any) {
    console.error("Error in submission handler", { error: error.message });

    // Handle unexpected errors
    if (logger) {
      logger.error("❌ Submit channel failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return {
      status: 500,
      body: { message: "Internal server error" },
    };
  }
};
