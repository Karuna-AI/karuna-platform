/**
 * Karuna AI Gateway Server
 *
 * This server acts as a secure proxy between the client and OpenAI APIs.
 * The OpenAI API key is kept server-side only, never exposed to clients.
 *
 * Features:
 * - Rate limiting per IP
 * - Request logging (minimal, no PII)
 * - Abuse protection
 * - Health check endpoint
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3021;

// Configuration - Primary: OpenAI, Fallback: OpenRouter
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
  console.error('ERROR: At least one of OPENAI_API_KEY or OPENROUTER_API_KEY is required');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.warn('WARNING: OPENAI_API_KEY not set - STT will not be available');
}

if (OPENROUTER_API_KEY) {
  console.log('Fallback: OpenRouter configured for chat');
}

// Validate JWT secrets are configured
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!process.env.ADMIN_JWT_SECRET) {
  console.error('ERROR: ADMIN_JWT_SECRET environment variable is required');
  process.exit(1);
}

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS - configure for your domain in production
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3020', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3030'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'X-Request-ID', 'X-Client-Version', 'Authorization'],
}));

// JSON body parser
app.use(express.json({ limit: '1mb' }));

// File upload for audio (max 25MB like Whisper limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ============================================================================
// Rate Limiting
// ============================================================================

// General rate limit: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for AI endpoints: 20 requests per minute per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Too many requests. Please slow down and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict limit for STT (expensive): 10 per minute
const sttLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Voice processing limit reached. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// ============================================================================
// Telemetry & Logging
// ============================================================================

// In-memory metrics (in production, use a proper metrics service)
const metrics = {
  requests: { chat: 0, stt: 0 },
  errors: { chat: 0, stt: 0, rateLimit: 0 },
  latency: { chat: [], stt: [] },
};

function recordMetric(type, success, latencyMs) {
  metrics.requests[type]++;
  if (!success) {
    metrics.errors[type]++;
  }
  // Keep last 100 latency samples
  metrics.latency[type].push(latencyMs);
  if (metrics.latency[type].length > 100) {
    metrics.latency[type].shift();
  }
}

function getAverageLatency(type) {
  const samples = metrics.latency[type];
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

// Request logging middleware (minimal, no PII)
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  req.requestId = requestId;
  req.startTime = start;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      // No IP logging by default for privacy
    };

    // Only log AI endpoints and errors
    if (req.path.startsWith('/api/') || res.statusCode >= 400) {
      console.log(JSON.stringify(log));
    }
  });

  next();
});

// ============================================================================
// Abuse Protection
// ============================================================================

// Block obviously malicious patterns
function validateChatRequest(messages) {
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'Messages must be an array' };
  }

  if (messages.length > 50) {
    return { valid: false, error: 'Too many messages in conversation' };
  }

  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return { valid: false, error: 'Invalid message format' };
    }

    if (typeof msg.content !== 'string') {
      return { valid: false, error: 'Message content must be a string' };
    }

    if (msg.content.length > 10000) {
      return { valid: false, error: 'Message too long' };
    }

    // Block obvious prompt injection attempts
    const lowerContent = msg.content.toLowerCase();
    const blockedPatterns = [
      'ignore previous instructions',
      'ignore all previous',
      'disregard your instructions',
      'forget your instructions',
      'you are now',
      'act as if you',
      'pretend you are',
    ];

    if (blockedPatterns.some(pattern => lowerContent.includes(pattern))) {
      return { valid: false, error: 'Invalid request content' };
    }
  }

  return { valid: true };
}

// ============================================================================
// Safety Rules System Prompt
// ============================================================================

const SAFETY_SYSTEM_PROMPT = `You are Karuna, a kind and patient AI assistant helping elderly users with technology.

CORE PERSONALITY:
- Use simple, clear language - avoid technical jargon
- Be patient and repeat information if asked
- Offer step-by-step guidance
- Confirm understanding before proceeding
- If you don't understand, ask for clarification politely
- Keep responses concise but helpful
- Use a warm, friendly tone
- If the user seems confused, offer to explain differently

SAFETY RULES (CRITICAL):
1. NEVER provide medical diagnoses or treatment advice. For health questions:
   - Be supportive and empathetic
   - Suggest consulting a doctor, nurse, or healthcare provider
   - If they describe an emergency (chest pain, difficulty breathing, severe injury), strongly encourage calling emergency services immediately

2. NEVER help with financial transactions or share banking information:
   - For money-related questions, suggest contacting family or visiting the bank in person
   - Warn about phone/email scams targeting elderly people

3. For any action that could:
   - Cost money
   - Affect accounts or settings
   - Create commitments (reminders, appointments)
   - Contact someone
   Always confirm with the user BEFORE executing. Say "Would you like me to..." rather than "I will..."

4. If someone seems distressed, lonely, or mentions self-harm:
   - Be compassionate and supportive
   - Suggest talking to family, friends, or a helpline
   - Never dismiss their feelings

5. Privacy:
   - Never ask for passwords, PINs, or sensitive personal information
   - If the user volunteers such information, remind them to keep it private

MEMORY CONTEXT (if available):
{MEMORY_CONTEXT}

Remember: You are a helpful companion, not a replacement for professional medical, legal, or financial advice.`;

// ============================================================================
// API Routes
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint (protected in production)
app.get('/metrics', (req, res) => {
  res.json({
    requests: metrics.requests,
    errors: metrics.errors,
    averageLatency: {
      chat: getAverageLatency('chat'),
      stt: getAverageLatency('stt'),
    },
    errorRates: {
      chat: metrics.requests.chat ? (metrics.errors.chat / metrics.requests.chat * 100).toFixed(2) + '%' : '0%',
      stt: metrics.requests.stt ? (metrics.errors.stt / metrics.requests.stt * 100).toFixed(2) + '%' : '0%',
    },
  });
});

// Public feature flags endpoint (for mobile app)
app.get('/api/feature-flags', async (req, res) => {
  try {
    const db = require('./db');
    const result = await db.query('SELECT name, is_enabled, enabled_for_all, rollout_percentage, enabled_user_ids, enabled_circle_ids FROM feature_flags');
    res.json({ flags: result.rows });
  } catch (error) {
    console.error('Get feature flags error:', error);
    res.json({ flags: [] });
  }
});

// Chat completion endpoint with fallback support
app.post('/api/chat', aiLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const { messages, memoryContext } = req.body;

    // Validate request
    const validation = validateChatRequest(messages);
    if (!validation.valid) {
      recordMetric('chat', false, Date.now() - startTime);
      return res.status(400).json({ error: validation.error });
    }

    // Build system prompt with memory context
    let systemPrompt = SAFETY_SYSTEM_PROMPT;
    if (memoryContext) {
      systemPrompt = systemPrompt.replace('{MEMORY_CONTEXT}', memoryContext);
    } else {
      systemPrompt = systemPrompt.replace('{MEMORY_CONTEXT}', 'No memory context available.');
    }

    // Add system prompt to messages
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system'),
    ];

    let response;
    let provider = 'openai';

    // Try OpenAI first if available (using GPT-4o-mini for cost efficiency)
    if (OPENAI_API_KEY) {
      try {
        response = await axios.post(
          `${OPENAI_API_BASE}/chat/completions`,
          {
            model: 'gpt-4o-mini',  // 99% cheaper than GPT-4
            messages: messagesWithSystem,
            temperature: 0.7,
            max_tokens: 500,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            timeout: 30000,
          }
        );
      } catch (openaiError) {
        console.warn('OpenAI failed, attempting fallback:', openaiError.message);

        // Try OpenRouter fallback if available (using Mistral Small for cost efficiency)
        if (OPENROUTER_API_KEY) {
          provider = 'openrouter';
          response = await axios.post(
            `${OPENROUTER_API_BASE}/chat/completions`,
            {
              model: 'mistralai/mistral-small-24b-instruct-2501',  // Very cheap fallback
              messages: messagesWithSystem,
              temperature: 0.7,
              max_tokens: 500,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'http://localhost:3020',
                'X-Title': 'Karuna AI Companion',
              },
              timeout: 30000,
            }
          );
          console.log('Fallback to OpenRouter (Mistral Small) successful');
        } else {
          throw openaiError; // Re-throw if no fallback available
        }
      }
    } else if (OPENROUTER_API_KEY) {
      // Use OpenRouter as primary if no OpenAI key
      provider = 'openrouter';
      response = await axios.post(
        `${OPENROUTER_API_BASE}/chat/completions`,
        {
          model: 'mistralai/mistral-small-24b-instruct-2501',  // Very cheap
          messages: messagesWithSystem,
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'http://localhost:3020',
            'X-Title': 'Karuna AI Companion',
          },
          timeout: 30000,
        }
      );
    }

    const assistantMessage = response.data.choices[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error('No response from AI');
    }

    recordMetric('chat', true, Date.now() - startTime);

    // Log AI usage for analytics
    try {
      const db = require('./db');
      const usage = response.data.usage || {};
      // GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output
      const estimatedCost = ((usage.prompt_tokens || 0) * 0.00000015 + (usage.completion_tokens || 0) * 0.0000006);
      const modelName = provider === 'openai' ? 'gpt-4o-mini' : 'mistral-small';
      await db.query(
        `INSERT INTO ai_usage_logs (request_type, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, latency_ms, success)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['chat', `${modelName} (${provider})`, usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0, estimatedCost, Date.now() - startTime, true]
      );
    } catch (logError) {
      console.warn('Failed to log AI usage:', logError.message);
    }

    res.json({
      message: assistantMessage,
      usage: response.data.usage,
      provider, // Include which provider was used
    });

  } catch (error) {
    recordMetric('chat', false, Date.now() - startTime);

    console.error('Chat error:', {
      requestId: req.requestId,
      error: error.message,
      status: error.response?.status,
    });

    if (error.response?.status === 401) {
      return res.status(500).json({ error: 'AI service configuration error' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'AI service is busy. Please try again.' });
    }
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    res.status(500).json({ error: 'Unable to process request. Please try again.' });
  }
});

// Speech-to-text endpoint
app.post('/api/stt', sttLimiter, upload.single('audio'), async (req, res) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      recordMetric('stt', false, Date.now() - startTime);
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Validate file size (already limited by multer, but double-check)
    if (req.file.size > 25 * 1024 * 1024) {
      recordMetric('stt', false, Date.now() - startTime);
      return res.status(400).json({ error: 'Audio file too large' });
    }

    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', req.body.language || 'en');

    // Call Whisper API
    const response = await axios.post(
      `${OPENAI_API_BASE}/audio/transcriptions`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        timeout: 60000, // STT can take longer
      }
    );

    recordMetric('stt', true, Date.now() - startTime);

    res.json({
      text: response.data.text,
    });

  } catch (error) {
    recordMetric('stt', false, Date.now() - startTime);

    console.error('STT error:', {
      requestId: req.requestId,
      error: error.message,
      status: error.response?.status,
    });

    if (error.response?.status === 401) {
      return res.status(500).json({ error: 'AI service configuration error' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Voice processing is busy. Please try again.' });
    }

    res.status(500).json({ error: 'Could not process audio. Please try again.' });
  }
});

// Telemetry endpoint for client-side error reporting
app.post('/api/telemetry', (req, res) => {
  const { event, data } = req.body;

  // Validate event types we accept
  const allowedEvents = [
    'stt_failure',
    'tts_failure',
    'permission_denied',
    'app_error',
    'action_cancelled',
    'emergency_call',
  ];

  if (!event || !allowedEvents.includes(event)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  // Log telemetry (in production, send to analytics service)
  console.log(JSON.stringify({
    type: 'telemetry',
    timestamp: new Date().toISOString(),
    event,
    data: {
      // Strip any PII, only keep safe fields
      errorType: data?.errorType,
      errorCode: data?.errorCode,
      platform: data?.platform,
      appVersion: data?.appVersion,
    },
  }));

  res.json({ received: true });
});

// ============================================================================
// Care Circle API Routes
// ============================================================================

const { router: careCircleRouter, handleWebSocket } = require('./careCircle');
app.use('/api/care', careCircleRouter);

// ============================================================================
// Admin API Routes
// ============================================================================

const { router: adminRouter } = require('./admin');
app.use('/api/admin', adminRouter);

// ============================================================================
// Error Handlers
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    requestId: req.requestId,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(500).json({ error: 'An unexpected error occurred' });
});

// ============================================================================
// Server Start with WebSocket Support
// ============================================================================

const http = require('http');
const WebSocket = require('ws');

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  handleWebSocket(ws, req);
});

server.listen(PORT, () => {
  console.log(`Karuna AI Gateway running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed origins: ${process.env.ALLOWED_ORIGINS || 'http://localhost:3020, http://localhost:3000'}`);
});

module.exports = { app, server, wss };
