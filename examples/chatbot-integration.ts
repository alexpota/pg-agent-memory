import { AgentMemory } from '../src/index.js';

/**
 * Chatbot Integration Example
 * 
 * Shows how to integrate pg-agent-memory with a chatbot system
 * for persistent conversation context and user preferences.
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface UserContext {
  preferences: Record<string, unknown>;
  conversation_history: ChatMessage[];
  relevant_memories: ChatMessage[];
}

class ChatbotWithMemory {
  private memory: AgentMemory;
  private agentId: string;

  constructor(agentId: string, databaseUrl: string) {
    this.agentId = agentId;
    this.memory = new AgentMemory({
      agent: agentId,
      connectionString: databaseUrl,
    });
  }

  async initialize(): Promise<void> {
    await this.memory.initialize();
    console.log(`🤖 Chatbot ${this.agentId} memory initialized`);
  }

  async processUserMessage(
    userId: string,
    message: string,
    importance = 0.5
  ): Promise<{ response: string; context: UserContext }> {
    try {
      // Store user message in memory
      await this.memory.remember({
        conversation: userId,
        content: message,
        role: 'user',
        importance,
        metadata: { 
          user_id: userId,
          timestamp: new Date().toISOString(),
          message_type: 'user_input'
        }
      });

      // Get relevant context for generating response
      const relevantContext = await this.memory.getRelevantContext(
        userId,
        message,
        800 // Leave room for response
      );

      // Get recent conversation history
      const recentHistory = await this.memory.getHistory(userId, 10);

      // Simulate AI response generation (replace with your LLM)
      const response = await this.generateResponse(message, relevantContext.messages);

      // Store assistant response
      await this.memory.remember({
        conversation: userId,
        content: response,
        role: 'assistant',
        importance: 0.6,
        metadata: {
          user_id: userId,
          timestamp: new Date().toISOString(),
          message_type: 'bot_response',
          context_used: relevantContext.messages.length
        }
      });

      // Extract user preferences from context
      const preferences = this.extractPreferences(relevantContext.messages);

      return {
        response,
        context: {
          preferences,
          conversation_history: recentHistory.slice(-5), // Last 5 messages
          relevant_memories: relevantContext.messages
        }
      };

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  private async generateResponse(userMessage: string, context: any[]): Promise<string> {
    // Simplified response generation - replace with your LLM integration
    const contextSummary = context.length > 0 
      ? `Based on our previous conversations, I remember that ${context[0]?.content.slice(0, 100)}...`
      : 'Hello! How can I help you today?';

    if (userMessage.toLowerCase().includes('remember')) {
      return `${contextSummary} What would you like me to remember?`;
    }

    if (userMessage.toLowerCase().includes('preference')) {
      const prefs = context.filter(c => c.content.includes('prefer'));
      if (prefs.length > 0) {
        return `I remember your preferences: ${prefs[0].content}`;
      }
    }

    return `I understand you said: "${userMessage}". ${contextSummary}`;
  }

  private extractPreferences(memories: any[]): Record<string, unknown> {
    const preferences: Record<string, unknown> = {};
    
    for (const memory of memories) {
      // Extract notification preferences
      if (memory.content.includes('email') && memory.content.includes('prefer')) {
        preferences.notification_method = 'email';
      }
      if (memory.content.includes('SMS') && memory.content.includes('prefer')) {
        preferences.notification_method = 'sms';
      }
      
      // Extract other preferences
      if (memory.content.includes('language')) {
        const match = memory.content.match(/language\s+(\w+)/i);
        if (match) preferences.language = match[1];
      }
      
      if (memory.content.includes('timezone')) {
        const match = memory.content.match(/timezone\s+([A-Za-z_/]+)/i);
        if (match) preferences.timezone = match[1];
      }
    }

    return preferences;
  }

  async getUserInsights(userId: string): Promise<{
    total_conversations: number;
    frequent_topics: string[];
    last_interaction: Date;
    avg_importance: number;
  }> {
    // Search for user's most important memories
    const importantMemories = await this.memory.searchMemories('', {
      conversation: userId,
      importance: { min: 0.7 },
      limit: 20
    });

    // Get conversation history to find patterns
    const allHistory = await this.memory.getHistory(userId, 100);

    // Extract topics (simplified - could use NLP)
    const topics = new Map<string, number>();
    for (const msg of allHistory) {
      const words = msg.content.toLowerCase().split(' ');
      for (const word of words) {
        if (word.length > 4) { // Skip short words
          topics.set(word, (topics.get(word) || 0) + 1);
        }
      }
    }

    const frequentTopics = Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const avgImportance = allHistory.length > 0
      ? allHistory.reduce((sum, msg) => sum + msg.importance, 0) / allHistory.length
      : 0;

    return {
      total_conversations: allHistory.length,
      frequent_topics: frequentTopics,
      last_interaction: allHistory[allHistory.length - 1]?.timestamp || new Date(),
      avg_importance: avgImportance
    };
  }

  async cleanup(): Promise<void> {
    await this.memory.disconnect();
  }
}

// Example usage
async function runChatbotExample(): Promise<void> {
  const bot = new ChatbotWithMemory(
    'customer-support',
    process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/chatbot_db'
  );

  try {
    await bot.initialize();

    // Simulate conversation
    console.log('🗣️ Starting conversation simulation...\n');

    const { response: response1, context: context1 } = await bot.processUserMessage(
      'user-456',
      'Hi, I prefer to receive notifications via email, not SMS',
      0.8
    );
    console.log('User: Hi, I prefer to receive notifications via email, not SMS');
    console.log('Bot:', response1);
    console.log('Context:', context1.preferences);
    console.log();

    const { response: response2 } = await bot.processUserMessage(
      'user-456',
      'Can you remember my timezone is America/New_York?',
      0.7
    );
    console.log('User: Can you remember my timezone is America/New_York?');
    console.log('Bot:', response2);
    console.log();

    const { response: response3 } = await bot.processUserMessage(
      'user-456',
      'What are my notification preferences?',
      0.5
    );
    console.log('User: What are my notification preferences?');
    console.log('Bot:', response3);
    console.log();

    // Get user insights
    const insights = await bot.getUserInsights('user-456');
    console.log('📊 User Insights:', insights);

  } finally {
    await bot.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChatbotExample().catch(console.error);
}

export { ChatbotWithMemory, runChatbotExample };