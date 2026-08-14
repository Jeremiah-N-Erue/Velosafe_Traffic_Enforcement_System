import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { chatMessageSchema } from "../validators/schemas";
import { answerQuestion } from "../lib/chatEngine";

export const chatRouter = Router();

chatRouter.use(requireAuth);

chatRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { message } = chatMessageSchema.parse(req.body);
    const answer = answerQuestion(message);
    res.json(answer);
  }),
);
