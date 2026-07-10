import {z} from "zod";

const MAX_HISTORY_MESSAGES = 20;

export const ChatHistoryMessageDTOSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

export const ChatRequestDTOSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(ChatHistoryMessageDTOSchema).max(MAX_HISTORY_MESSAGES).optional(),
});
export type ChatRequestDTO = z.infer<typeof ChatRequestDTOSchema>;

export interface ChatResponseDTO {
  reply: string;
}
