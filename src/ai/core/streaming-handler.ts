/**
 * Streaming Response Handler
 * 
 * Implements Server-Sent Events (SSE) for real-time AI responses
 * Provides progressive content delivery for better UX and lower latency perception
 */

import { logger } from '@/lib/logger';

export interface StreamChunk {
  id: string;
  content: string;
  isComplete: boolean;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    finishReason?: string;
    securityThreatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
    error?: string;
  };
}

export interface StreamConfig {
  chunkSize?: number;
  maxDurationMs?: number;
  enableHeartbeat?: boolean;
  heartbeatIntervalMs?: number;
}

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  chunkSize: 10,
  maxDurationMs: 120000, // 2 minutes
  enableHeartbeat: true,
  heartbeatIntervalMs: 15000, // 15 seconds
};

/**
 * Creates a ReadableStream for SSE
 */
export function createSSEStream(
  generator: AsyncGenerator<StreamChunk>,
  config: StreamConfig = {}
): ReadableStream {
  const finalConfig = { ...DEFAULT_STREAM_CONFIG, ...config };
  const encoder = new TextEncoder();
  const startTime = Date.now();
  let heartbeatInterval: NodeJS.Timeout | null = null;

  return new ReadableStream({
    async start(controller) {
      // Setup heartbeat to keep connection alive
      if (finalConfig.enableHeartbeat) {
        heartbeatInterval = setInterval(() => {
          if (Date.now() - startTime < finalConfig.maxDurationMs!) {
            controller.enqueue(encoder.encode(':heartbeat\n\n'));
          }
        }, finalConfig.heartbeatIntervalMs);
      }

      try {
        for await (const chunk of generator) {
          // Check timeout
          if (Date.now() - startTime > finalConfig.maxDurationMs!) {
            logger.warn('[Streaming] Max duration exceeded, closing stream');
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ 
                error: 'Response timeout', 
                partial: true 
              })}\n\n`
            ));
            break;
          }

          // Send chunk
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(sseData));

          if (chunk.isComplete) {
            break;
          }
        }
      } catch (error) {
        logger.error('[Streaming] Stream error', error instanceof Error ? error : new Error(String(error)));
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            error: 'Stream error', 
            message: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`
        ));
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        controller.close();
      }
    },

    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      logger.info('[Streaming] Stream cancelled by client');
    },
  });
}

/**
 * Wraps an OpenAI/Kimi streaming response into our StreamChunk format
 */
export async function* wrapOpenAIStream(
  stream: AsyncIterable<any>,
  requestId: string
): AsyncGenerator<StreamChunk> {
  let content = '';
  let model = '';
  let finishReason = '';

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      const finish = chunk.choices?.[0]?.finish_reason;
      
      if (chunk.model && !model) {
        model = chunk.model;
      }

      if (finish) {
        finishReason = finish;
      }

      if (delta?.content) {
        content += delta.content;
        yield {
          id: requestId,
          content: delta.content,
          isComplete: false,
        };
      }
    }

    // Final chunk
    yield {
      id: requestId,
      content: '',
      isComplete: true,
      metadata: {
        model,
        finishReason,
      },
    };
  } catch (error) {
    logger.error('[Streaming] Error in OpenAI stream wrapper', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Parses SSE data from a response stream
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete SSE messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    let currentData = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line === '' && currentData) {
        // End of message
        if (currentData === '[DONE]') {
          yield { id: '', content: '', isComplete: true };
          return;
        }
        
        try {
          const parsed = JSON.parse(currentData);
          yield {
            id: parsed.id || '',
            content: parsed.content || parsed.choices?.[0]?.delta?.content || '',
            isComplete: parsed.isComplete || false,
            metadata: parsed.metadata,
          };
        } catch {
          // Ignore parse errors for heartbeat or malformed data
          if (currentData !== ':heartbeat') {
            logger.warn('[Streaming] Failed to parse SSE data', { data: currentData });
          }
        }
        currentData = '';
      }
    }
  }

  // Process any remaining data
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        yield {
          id: parsed.id || '',
          content: parsed.content || '',
          isComplete: true,
          metadata: parsed.metadata,
        };
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Client-side stream handler for consuming SSE
 */
export class StreamConsumer {
  private abortController: AbortController | null = null;
  private onChunk: (chunk: string) => void;
  private onComplete: (metadata?: StreamChunk['metadata']) => void;
  private onError: (error: Error) => void;

  constructor(
    onChunk: (chunk: string) => void,
    onComplete: (metadata?: StreamChunk['metadata']) => void,
    onError: (error: Error) => void
  ) {
    this.onChunk = onChunk;
    this.onComplete = onComplete;
    this.onError = onError;
  }

  async start(url: string, options: RequestInit = {}): Promise<void> {
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
        headers: {
          ...options.headers,
          'Accept': 'text/event-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      
      try {
        for await (const chunk of parseSSEStream(reader)) {
          if (chunk.metadata?.error) {
            throw new Error(chunk.metadata.error);
          }
          
          if (chunk.isComplete) {
            this.onComplete(chunk.metadata);
            return;
          }
          
          this.onChunk(chunk.content);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('[StreamConsumer] Stream aborted');
        return;
      }
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

/**
 * Creates a streaming response for Next.js API routes
 */
export function createStreamingResponse(
  stream: ReadableStream,
  options: {
    status?: number;
    headers?: Record<string, string>;
  } = {}
): Response {
  return new Response(stream, {
    status: options.status || 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      ...options.headers,
    },
  });
}

/**
 * Simulates streaming for non-streaming models
 * Chunks the response to provide similar UX
 */
export async function* simulateStream(
  fullText: string,
  config: { chunkSize?: number; delayMs?: number } = {}
): AsyncGenerator<StreamChunk> {
  const { chunkSize = 5, delayMs = 30 } = config;
  const requestId = `sim-${Date.now()}`;
  
  for (let i = 0; i < fullText.length; i += chunkSize) {
    const chunk = fullText.slice(i, i + chunkSize);
    yield {
      id: requestId,
      content: chunk,
      isComplete: false,
    };
    
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  yield {
    id: requestId,
    content: '',
    isComplete: true,
  };
}
