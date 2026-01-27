import { ParsedIntent, IntentType } from '../types';

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  entityExtractors?: {
    [key: string]: RegExp;
  };
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Emergency - check first for safety
  {
    type: 'emergency',
    patterns: [
      /\b(emergency|help me|i('m| am) (hurt|injured|dying|having|falling))\b/i,
      /\bcall\s+(911|ambulance|police|fire|emergency)\b/i,
      /\bi need (an? )?ambulance\b/i,
      /\bi('m| am) not (okay|ok|feeling well)\b/i,
      /\bsomething('s| is) wrong\b/i,
      /\bi('ve| have) fallen\b/i,
    ],
  },
  // Ride requests - Uber, Ola, Lyft
  {
    type: 'ride_request',
    patterns: [
      /\b(book|get|call|order)\s+(an?\s+)?(uber|ola|lyft|taxi|cab|ride)\b/i,
      /\bi need (a\s+)?(ride|cab|taxi|uber|ola|lyft)\b/i,
      /\btake me to\b/i,
      /\b(uber|ola|lyft)\s+to\b/i,
      /\bgo to\s+.+\s+(by|via|using)\s+(uber|ola|lyft|taxi)\b/i,
      /\bcan you (book|get|call)\s+(me\s+)?(a\s+)?(ride|cab|taxi|uber|ola)\b/i,
    ],
    entityExtractors: {
      destination: /(?:to|go to|take me to|ride to|drop me at|drop at)\s+(.+?)(?:\s+(?:by|via|using|from|please)|\s*$)/i,
      pickup: /(?:from|pick(?:up|\s+me\s+up)?\s+(?:at|from)?)\s+(.+?)(?:\s+(?:to|and|please)|\s*$)/i,
      rideProvider: /\b(uber|ola|lyft)\b/i,
    },
  },
  // Navigation - Maps, directions
  {
    type: 'navigation',
    patterns: [
      /\b(directions?|navigate|how do i get|route)\s+to\b/i,
      /\b(show|open|find)\s+(me\s+)?(the\s+)?(way|route|directions?)\b/i,
      /\bwhere is\b/i,
      /\bhow (far|long|to get)\b/i,
      /\bmap\s+of\b/i,
      /\btake me to\b(?!.*(uber|ola|lyft|taxi|cab))/i,
      /\bfind\s+(.+?)\s+(near|nearby|around)\s+(me|here)\b/i,
    ],
    entityExtractors: {
      destination: /(?:directions? to|navigate to|how do i get to|where is|way to|route to|take me to|find)\s+(.+?)(?:\s*\?|\s*$)/i,
      query: /(?:find|search for|look for|nearby)\s+(.+?)(?:\s+near|\s*$)/i,
    },
  },
  // YouTube
  {
    type: 'youtube',
    patterns: [
      /\b(play|show|open|search|find)\s+(?:on\s+)?youtube\b/i,
      /\byoutube\s+(video|search|play)\b/i,
      /\b(watch|see)\s+(.+?)\s+(on|video)\b/i,
      /\bplay\s+(.+?)\s+video\b/i,
      /\bshow me\s+(.+?)\s+(video|on youtube)\b/i,
    ],
    entityExtractors: {
      query: /(?:play|show|search|find|watch|see)\s+(?:on\s+youtube\s+)?(.+?)(?:\s+(?:on|video|youtube)|\s*$)/i,
    },
  },
  // Music - Spotify and general
  {
    type: 'music',
    patterns: [
      /\b(play|put on|start)\s+(some\s+)?music\b/i,
      /\bplay\s+(?:song|track|album)?\s*(.+?)\s*(?:by|from)?\s*(.+?)?\s*$/i,
      /\b(spotify|music|songs?)\b/i,
      /\blisten to\b/i,
      /\bput on\s+(.+)/i,
    ],
    entityExtractors: {
      query: /(?:play|listen to|put on)\s+(.+?)(?:\s+by\s+|\s*$)/i,
      artist: /(?:by|from)\s+(.+?)$/i,
      song: /(?:play|listen to)\s+(.+?)(?:\s+by|\s*$)/i,
    },
  },
  // OTP Help
  {
    type: 'otp_help',
    patterns: [
      /\botp\b/i,
      /\b(read|tell|say|what('s| is))\s+(my\s+)?(the\s+)?otp\b/i,
      /\b(verification|security|confirmation)\s+code\b/i,
      /\bone[- ]?time[- ]?(password|code|pin)\b/i,
      /\bhelp\s+(me\s+)?(with\s+)?(my\s+)?otp\b/i,
      /\bwhat('s| is) the code\b/i,
      /\bread (the|my) code\b/i,
    ],
    entityExtractors: {
      otpSource: /(?:from|for)\s+(\w+)/i,
    },
  },
  // WhatsApp specific
  {
    type: 'whatsapp',
    patterns: [
      /\bwhatsapp\b/i,
      /\bsend\s+(a\s+)?whatsapp\b/i,
      /\bwhatsapp\s+(message|call|video)\b/i,
      /\b(message|call|video call)\s+(?:on|via|through)\s+whatsapp\b/i,
    ],
    entityExtractors: {
      contact: /(?:whatsapp|message|call)\s+(?:to\s+)?(?:my\s+)?(\w+(?:\s+\w+)?)/i,
      message: /(?:saying|that says|with message)\s+(.+?)$/i,
    },
  },
  // Existing intents
  {
    type: 'call',
    patterns: [
      /\b(call|phone|dial|ring)\b.*\b(my|the)?\s*(\w+)/i,
      /\b(can you|please|could you)\s+(call|phone|dial)\b/i,
      /\bi want to (call|speak to|talk to)\b/i,
    ],
    entityExtractors: {
      contact: /(?:call|phone|dial|ring|speak to|talk to)\s+(?:my\s+)?(\w+(?:\s+\w+)?)/i,
    },
  },
  {
    type: 'reminder',
    patterns: [
      /\b(remind|reminder|remember)\b.*\b(me|to)\b/i,
      /\b(set|create|add)\s+(?:a\s+)?reminder\b/i,
      /\bdon't let me forget\b/i,
      /\bremind me\b/i,
    ],
    entityExtractors: {
      message: /(?:remind me to|reminder to|remember to)\s+(.+?)(?:\s+(?:at|in|on|tomorrow|today|every)|\s*$)/i,
      time: /(?:at|in|on|tomorrow|today|every)\s+(.+?)(?:\s+to|\s*$)/i,
    },
  },
  {
    type: 'message',
    patterns: [
      /\b(send|text|message)\b.*\b(to)?\s*(\w+)/i,
      /\b(write|compose)\s+(?:a\s+)?message\b/i,
      /\btext\s+(?:my\s+)?(\w+)/i,
    ],
    entityExtractors: {
      contact: /(?:send|text|message)\s+(?:to\s+)?(?:my\s+)?(\w+(?:\s+\w+)?)/i,
      message: /(?:saying|that says|with)\s+(.+?)$/i,
    },
  },
  {
    type: 'help',
    patterns: [
      /\b(help|assist|support)\b/i,
      /\bhow do i\b/i,
      /\bwhat can you do\b/i,
      /\bi need help\b/i,
      /\bi('m| am) confused\b/i,
      /\bi don't (understand|know)\b/i,
    ],
  },
  {
    type: 'question',
    patterns: [
      /^(what|who|where|when|why|how|is|are|can|could|would|will|do|does)\b/i,
      /\?$/,
    ],
  },
];

export function parseIntent(text: string): ParsedIntent {
  const normalizedText = text.trim().toLowerCase();

  for (const intentPattern of INTENT_PATTERNS) {
    for (const pattern of intentPattern.patterns) {
      if (pattern.test(normalizedText)) {
        const entities: ParsedIntent['entities'] = {};

        if (intentPattern.entityExtractors) {
          for (const [entityName, extractor] of Object.entries(
            intentPattern.entityExtractors
          )) {
            const match = text.match(extractor);
            if (match && match[1]) {
              entities[entityName] = match[1].trim();
            }
          }
        }

        const confidence = calculateConfidence(
          normalizedText,
          intentPattern.patterns
        );

        return {
          type: intentPattern.type,
          confidence,
          entities,
          rawText: text,
        };
      }
    }
  }

  return {
    type: 'unknown',
    confidence: 0,
    entities: {},
    rawText: text,
  };
}

function calculateConfidence(text: string, patterns: RegExp[]): number {
  let matchCount = 0;
  let totalPatterns = patterns.length;

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      matchCount++;
    }
  }

  const baseConfidence = (matchCount / totalPatterns) * 0.5 + 0.5;

  return Math.min(1, baseConfidence);
}

export function isActionableIntent(intent: ParsedIntent): boolean {
  const actionableTypes: IntentType[] = [
    'call',
    'reminder',
    'message',
    // Phase 13: New actionable intents
    'ride_request',
    'navigation',
    'youtube',
    'music',
    'otp_help',
    'emergency',
    'whatsapp',
  ];

  // Emergency intents are always actionable
  if (intent.type === 'emergency') {
    return intent.confidence > 0.3;
  }

  // OTP help is actionable without entities
  if (intent.type === 'otp_help') {
    return intent.confidence > 0.5;
  }

  // Music can be actionable without specific entities
  if (intent.type === 'music') {
    return intent.confidence > 0.5;
  }

  return (
    actionableTypes.includes(intent.type) &&
    intent.confidence > 0.5 &&
    Object.keys(intent.entities).length > 0
  );
}

export function formatIntentForDisplay(intent: ParsedIntent): string {
  switch (intent.type) {
    case 'call':
      return intent.entities.contact
        ? `Calling ${intent.entities.contact}`
        : 'Making a call';
    case 'reminder':
      const reminderText = intent.entities.message || 'something';
      const timeText = intent.entities.time ? ` at ${intent.entities.time}` : '';
      return `Setting reminder: ${reminderText}${timeText}`;
    case 'message':
      return intent.entities.contact
        ? `Sending message to ${intent.entities.contact}`
        : 'Sending a message';
    case 'help':
      return 'Getting help';
    case 'question':
      return 'Answering question';
    // Phase 13: New intent display formats
    case 'ride_request':
      const provider = intent.entities.rideProvider || 'ride';
      const dest = intent.entities.destination;
      return dest ? `Booking ${provider} to ${dest}` : `Booking a ${provider}`;
    case 'navigation':
      return intent.entities.destination
        ? `Getting directions to ${intent.entities.destination}`
        : 'Opening maps';
    case 'youtube':
      return intent.entities.query
        ? `Searching YouTube for "${intent.entities.query}"`
        : 'Opening YouTube';
    case 'music':
      if (intent.entities.song && intent.entities.artist) {
        return `Playing "${intent.entities.song}" by ${intent.entities.artist}`;
      } else if (intent.entities.query) {
        return `Playing "${intent.entities.query}"`;
      }
      return 'Playing music';
    case 'otp_help':
      return 'Reading your OTP';
    case 'emergency':
      return 'Calling emergency services';
    case 'whatsapp':
      return intent.entities.contact
        ? `WhatsApp to ${intent.entities.contact}`
        : 'Opening WhatsApp';
    default:
      return 'Processing request';
  }
}

export function getIntentSuggestion(intent: ParsedIntent): string | null {
  if (intent.type === 'call' && !intent.entities.contact) {
    return 'Who would you like me to call?';
  }
  if (intent.type === 'reminder' && !intent.entities.message) {
    return 'What would you like me to remind you about?';
  }
  if (intent.type === 'message' && !intent.entities.contact) {
    return 'Who would you like to send a message to?';
  }
  // Phase 13: New intent suggestions
  if (intent.type === 'ride_request' && !intent.entities.destination) {
    return 'Where would you like to go?';
  }
  if (intent.type === 'navigation' && !intent.entities.destination && !intent.entities.query) {
    return 'Where would you like directions to?';
  }
  if (intent.type === 'youtube' && !intent.entities.query) {
    return 'What would you like to search for on YouTube?';
  }
  if (intent.type === 'whatsapp' && !intent.entities.contact) {
    return 'Who would you like to WhatsApp?';
  }
  return null;
}
