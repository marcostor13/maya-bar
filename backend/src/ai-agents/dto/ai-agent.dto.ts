export class CreateAiAgentDto {
  name: string;
  description?: string;
  systemPrompt: string;
  provider?: 'auto' | 'openai' | 'claude' | 'deepseek' | 'gemini';
  aiModel?: string;
  temperature?: number;
  maxTokens?: number;
  greeting?: string;
  fallbackMessage?: string;
  ragEnabled?: boolean;
  topK?: number;
  accountIds?: string[];
  published?: boolean;
}

export class UpdateAiAgentDto extends CreateAiAgentDto {}

export class AddDocDto {
  filename: string;
  url: string;
  key?: string;
  contentType?: string;
}

export class TestChatDto {
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export class AgentFileDto {
  alias: string;
  name: string;
  filename: string;
  url: string;
  key?: string;
  contentType?: string;
}
