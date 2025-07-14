export class MemoryError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown> | undefined;

  constructor(message: string, code: string = 'MEMORY_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = 'MemoryError';
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class LockAcquisitionError extends MemoryError {
  constructor(resource: string, timeout?: number) {
    super(
      `Failed to acquire lock for resource: ${resource}${timeout ? ` within ${timeout}ms` : ''}`,
      'LOCK_ACQUISITION_ERROR',
      { resource, timeout }
    );
    this.name = 'LockAcquisitionError';
  }
}

export class DatabaseConnectionError extends MemoryError {
  constructor(originalError: Error) {
    super(`Database connection failed: ${originalError.message}`, 'DATABASE_CONNECTION_ERROR', {
      originalError: originalError.message,
    });
    this.name = 'DatabaseConnectionError';
  }
}

export class ValidationError extends MemoryError {
  constructor(field: string, value: unknown, reason: string) {
    super(`Validation failed for field '${field}': ${reason}`, 'VALIDATION_ERROR', {
      field,
      value,
      reason,
    });
    this.name = 'ValidationError';
  }
}

export class MemoryNotFoundError extends MemoryError {
  constructor(memoryId: string) {
    super(`Memory with ID '${memoryId}' not found`, 'MEMORY_NOT_FOUND', { memoryId });
    this.name = 'MemoryNotFoundError';
  }
}

export class ConversationNotFoundError extends MemoryError {
  constructor(conversationId: string) {
    super(`Conversation with ID '${conversationId}' not found`, 'CONVERSATION_NOT_FOUND', {
      conversationId,
    });
    this.name = 'ConversationNotFoundError';
  }
}

export class TokenLimitExceededError extends MemoryError {
  constructor(currentTokens: number, maxTokens: number) {
    super(`Token limit exceeded: ${currentTokens} > ${maxTokens}`, 'TOKEN_LIMIT_EXCEEDED', {
      currentTokens,
      maxTokens,
    });
    this.name = 'TokenLimitExceededError';
  }
}

export class EmbeddingError extends MemoryError {
  constructor(reason: string, originalError?: Error) {
    super(`Embedding operation failed: ${reason}`, 'EMBEDDING_ERROR', {
      reason,
      originalError: originalError?.message,
    });
    this.name = 'EmbeddingError';
  }
}

export class CompressionError extends MemoryError {
  constructor(reason: string, originalError?: Error) {
    super(`Memory compression failed: ${reason}`, 'COMPRESSION_ERROR', {
      reason,
      originalError: originalError?.message,
    });
    this.name = 'CompressionError';
  }
}
