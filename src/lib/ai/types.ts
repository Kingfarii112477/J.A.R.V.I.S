export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIStreamResult {
  providerId: string;
  stream: AsyncGenerator<string, void, unknown>;
}
