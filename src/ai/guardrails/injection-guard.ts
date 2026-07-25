/**
 * Advanced Prompt Injection Guard - PRODUCTION READY
 * 
 * Multi-layer defense against prompt injection attacks:
 * 1. Pattern-based detection (fast, catches obvious attempts)
 * 2. Structural analysis (detects delimiter manipulation)
 * 3. Behavioral analysis (rate limiting, repetition detection)
 * 4. Encoding attack detection (zero-width chars, homographs)
 * 5. Output validation (verifies response adherence)
 */

import { logger } from '@/lib/logger';

export interface InjectionCheck {
  passed: boolean;
  confidence: number;
  threats: Threat[];
  sanitized: string;
  action: 'allow' | 'warn' | 'block' | 'quarantine';
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface Threat {
  type: 'pattern' | 'structural' | 'semantic' | 'encoding' | 'behavioral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  matchedText?: string;
  position?: number;
}

export interface GuardConfig {
  enablePatternDetection: boolean;
  enableStructuralAnalysis: boolean;
  enableBehavioralAnalysis: boolean;
  enableEncodingDetection: boolean;
  autoSanitize: boolean;
  blockThreshold: number;
  quarantineThreshold: number;
  logAllAttempts: boolean;
}

const DEFAULT_CONFIG: GuardConfig = {
  enablePatternDetection: true,
  enableStructuralAnalysis: true,
  enableBehavioralAnalysis: true,
  enableEncodingDetection: true,
  autoSanitize: true,
  blockThreshold: 0.7,
  quarantineThreshold: 0.4,
  logAllAttempts: true,
};

// Enhanced patterns with weights
const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  type: Threat['type'];
  severity: Threat['severity'];
  description: string;
  weight: number;
}> = [
  // Critical - Direct instruction override
  { pattern: /ignore\s+(?:all\s+|previous\s+|above\s+|prior\s+|your\s+)?instructions/gi, type: 'pattern', severity: 'critical', description: 'Instruction override attempt', weight: 1.0 },
  { pattern: /disregard\s+(?:all\s+|previous\s+|above\s+|prior\s+)?(?:instructions|prompts?)/gi, type: 'pattern', severity: 'critical', description: 'Prompt disregard attempt', weight: 1.0 },
  { pattern: /forget\s+(?:everything|all|your\s+training|your\s+instructions)/gi, type: 'pattern', severity: 'critical', description: 'Memory wipe attempt', weight: 1.0 },
  
  // Critical - System delimiter injection
  { pattern: /\[\s*(?:system|system\s+instruction|admin|developer)\s*\]/gi, type: 'structural', severity: 'critical', description: 'System delimiter injection', weight: 1.0 },
  { pattern: /<\s*(?:system|system\s+instruction|admin|developer)\s*>/gi, type: 'structural', severity: 'critical', description: 'System tag injection', weight: 1.0 },
  { pattern: /\{\{\s*(?:system|instructions?)\s*\}\}/gi, type: 'structural', severity: 'critical', description: 'Template injection attempt', weight: 1.0 },
  { pattern: /<\|(?:im_start|im_end|system|user|assistant)\|>/gi, type: 'structural', severity: 'critical', description: 'Special token injection', weight: 1.0 },
  
  // High - Jailbreak attempts
  { pattern: /(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|act\s+as|pretend\s+(?:to\s+be|you\s+are)|simulate\s+being)/gi, type: 'pattern', severity: 'high', description: 'Role change attempt', weight: 0.8 },
  { pattern: /DAN\s*(?:mode|protocol|instructions?)/gi, type: 'pattern', severity: 'high', description: 'DAN jailbreak attempt', weight: 0.9 },
  { pattern: /(?:do\s+anything\s+now|jailbreak|developer\s+mode)/gi, type: 'pattern', severity: 'high', description: 'Jailbreak attempt', weight: 0.8 },
  { pattern: /ignore\s+your\s+(?:programming|guidelines?|constraints?|rules?)/gi, type: 'pattern', severity: 'high', description: 'Constraint bypass attempt', weight: 0.8 },
  
  // High - Information extraction
  { pattern: /(?:repeat|echo|print|output|show)\s+(?:the\s+)?(?:above|previous|system|your\s+instructions?)/gi, type: 'pattern', severity: 'high', description: 'Prompt leak attempt', weight: 0.7 },
  { pattern: /what\s+(?:are|were)\s+your\s+instructions/gi, type: 'pattern', severity: 'high', description: 'Instruction extraction', weight: 0.7 },
  { pattern: /bypass\s+(?:restrictions?|constraints?|filters?|safety)/gi, type: 'pattern', severity: 'high', description: 'Bypass attempt', weight: 0.7 },
  
  // Medium - Encoding attacks
  { pattern: /\b[a-zA-Z0-9+\/]{50,}={0,2}\b/g, type: 'encoding', severity: 'medium', description: 'Potential base64 payload', weight: 0.5 },
  { pattern: /(?:\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|&#x[0-9a-f]+;)/gi, type: 'encoding', severity: 'medium', description: 'Encoded character sequence', weight: 0.4 },
  { pattern: /\x00|\x01|\x02|\x03|\x04|\x05/, type: 'encoding', severity: 'medium', description: 'Null byte injection', weight: 0.6 },
  
  // Medium - Social engineering
  { pattern: /(?:this\s+is\s+a\s+test|debug\s+mode|maintenance\s+mode)/gi, type: 'pattern', severity: 'medium', description: 'False authority claim', weight: 0.4 },
  { pattern: /(?:authorized|administrator|developer)\s+(?:access|override)/gi, type: 'pattern', severity: 'medium', description: 'Privilege escalation attempt', weight: 0.5 },
];

// Behavioral tracking per user/session
interface BehavioralProfile {
  requestCount: number;
  lastRequestTime: number;
  contentHistory: string[];
  violationScore: number;
  patterns: Map<string, number>;
}

const behavioralProfiles = new Map<string, BehavioralProfile>();
const BEHAVIORAL_CONFIG = {
  rapidRequestThreshold: 10, // requests
  rapidRequestWindowMs: 60000, // 1 minute
  repetitionThreshold: 0.85, // 85% similarity
  minContentLengthForCheck: 15,
  characterRepetitionThreshold: 4,
};

function collectMatches(input: string, pattern: RegExp): RegExpMatchArray[] {
  const globalPattern = pattern.flags.includes('g')
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);

  return Array.from(input.matchAll(globalPattern));
}

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Analyze behavioral patterns for a user/session
 */
function analyzeBehavior(identifier: string, input: string): Threat[] {
  const threats: Threat[] = [];
  const now = Date.now();
  
  let profile = behavioralProfiles.get(identifier);
  if (!profile) {
    profile = { 
      requestCount: 0, 
      lastRequestTime: now, 
      contentHistory: [], 
      violationScore: 0,
      patterns: new Map(),
    };
    behavioralProfiles.set(identifier, profile);
  }
  
  // Check request rate
  const timeSinceLastRequest = now - profile.lastRequestTime;
  profile.requestCount++;
  
  if (timeSinceLastRequest < 500) { // Less than 500ms between requests
    threats.push({
      type: 'behavioral',
      severity: 'medium',
      description: 'Requests too rapid for human typing (bot suspected)',
      matchedText: `${timeSinceLastRequest}ms interval`,
    });
    profile.violationScore += 0.3;
  }
  
  // Check for repetitive content (automation indicator)
  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length >= BEHAVIORAL_CONFIG.minContentLengthForCheck) {
    for (const prev of profile.contentHistory.slice(-5)) {
      const similarity = calculateSimilarity(normalized, prev);
      if (similarity > BEHAVIORAL_CONFIG.repetitionThreshold) {
        threats.push({
          type: 'behavioral',
          severity: 'medium',
          description: 'Highly repetitive content (automation suspected)',
          matchedText: `${(similarity * 100).toFixed(0)}% similar to previous`,
        });
        profile.violationScore += 0.4;
        break;
      }
    }
  }
  
  // Check for character repetition (spam indicator)
  const charRepetition = input.match(/(.)\1{4,}/g);
  if (charRepetition && charRepetition.length > 3) {
    threats.push({
      type: 'behavioral',
      severity: 'low',
      description: 'Unusual character repetition detected',
      matchedText: charRepetition.slice(0, 3).join(', '),
    });
    profile.violationScore += 0.2;
  }
  
  // Update profile
  profile.lastRequestTime = now;
  profile.contentHistory.push(normalized);
  if (profile.contentHistory.length > 20) profile.contentHistory.shift();
  
  // Check accumulated violations
  if (profile.violationScore > 1.5) {
    threats.push({
      type: 'behavioral',
      severity: 'high',
      description: 'Accumulated behavioral violations indicate abuse',
      matchedText: `Score: ${profile.violationScore.toFixed(1)}`,
    });
  }
  
  return threats;
}

function analyzeStructure(input: string): Threat[] {
  const threats: Threat[] = [];
  
  const delimiters = [
    { open: '[', close: ']', name: 'square brackets' },
    { open: '<', close: '>', name: 'angle brackets' },
    { open: '{', close: '}', name: 'curly braces' },
    { open: '(', close: ')', name: 'parentheses' },
  ];
  
  for (const { open, close, name } of delimiters) {
    const openCount = (input.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closeCount = (input.match(new RegExp(`\\${close}`, 'g')) || []).length;
    
    if (Math.abs(openCount - closeCount) > 3) {
      threats.push({
        type: 'structural',
        severity: 'medium',
        description: `Unbalanced ${name} may indicate delimiter manipulation`,
        matchedText: `${openCount} open, ${closeCount} close`,
      });
    }
  }
  
  const newlineCount = (input.match(/\n/g) || []).length;
  if (newlineCount > 15 && input.length / newlineCount < 30) {
    threats.push({
      type: 'structural',
      severity: 'low',
      description: 'Excessive line breaks may indicate hiding attempt',
      matchedText: `${newlineCount} newlines`,
    });
  }
  
  return threats;
}

/**
 * Detect encoding-based attacks
 */
function analyzeEncoding(input: string): Threat[] {
  const threats: Threat[] = [];
  
  // Zero-width character detection (steganography)
  const zeroWidthChars = input.match(/[\u200B-\u200D\uFEFF]/g);
  if (zeroWidthChars && zeroWidthChars.length > 2) {
    threats.push({
      type: 'encoding',
      severity: 'high',
      description: 'Zero-width characters detected - possible hidden instructions',
      matchedText: `${zeroWidthChars.length} zero-width characters`,
    });
  }
  
  // Homograph attack detection (Cyrillic lookalikes)
  const cyrillicLookalikes: Record<string, string> = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
    'і': 'i', 'ј': 'j', 'ԛ': 'q', 'ѕ': 's', 'ԝ': 'w', 'у': 'y',
    'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Н': 'H',
  };
  
  let homographCount = 0;
  for (const char of input) {
    if (cyrillicLookalikes[char]) homographCount++;
  }
  
  if (homographCount > 2) {
    threats.push({
      type: 'encoding',
      severity: 'high',
      description: 'Homograph attack detected (Cyrillic characters masquerading as Latin)',
      matchedText: `${homographCount} suspicious characters`,
    });
  }
  
  // Unicode directional override characters
  const directionalChars = input.match(/[\u202A-\u202E]/g);
  if (directionalChars) {
    threats.push({
      type: 'encoding',
      severity: 'critical',
      description: 'Unicode directional override characters detected',
      matchedText: `${directionalChars.length} directional characters`,
    });
  }
  
  return threats;
}

function calculateConfidence(threats: Threat[]): number {
  if (threats.length === 0) return 0;
  
  const severityWeights = { critical: 1.0, high: 0.7, medium: 0.4, low: 0.1 };
  const totalWeight = threats.reduce((sum, t) => sum + severityWeights[t.severity], 0);
  return Math.min(1.0, totalWeight / 1.5);
}

function determineAction(confidence: number, config: GuardConfig): InjectionCheck['action'] {
  if (confidence >= config.blockThreshold) return 'block';
  if (confidence >= config.quarantineThreshold) return 'quarantine';
  if (confidence > 0) return 'warn';
  return 'allow';
}

function sanitizeInput(input: string, threats: Threat[]): string {
  let sanitized = input;
  
  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // Normalize homographs
  const homographMap: Record<string, string> = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
    'і': 'i', 'ј': 'j', 'ԛ': 'q', 'ѕ': 's', 'ԝ': 'w', 'у': 'y',
    'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Н': 'H',
  };
  
  for (const [cyrillic, latin] of Object.entries(homographMap)) {
    sanitized = sanitized.replace(new RegExp(cyrillic, 'g'), latin);
  }
  
  // Escape dangerous delimiters
  sanitized = sanitized
    .replace(/\[system\]/gi, '[SYSTEM_BLOCK]')
    .replace(/<system>/gi, '<SYSTEM_BLOCK>')
    .replace(/\{\{system\}\}/gi, '{{SYSTEM_BLOCK}}')
    .replace(/<\|(\w+)\|>/g, '⟨$1⟩');
  
  // If critical threat, add warning prefix
  const hasCritical = threats.some(t => t.severity === 'critical');
  if (hasCritical) {
    sanitized = `[FILTERED_INPUT] ${sanitized}`;
  }
  
  return sanitized;
}

/**
 * Main detection function - PRODUCTION READY
 */
export function detectInjection(
  input: string,
  identifier = 'anonymous',
  config: Partial<GuardConfig> = {}
): InjectionCheck {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const threats: Threat[] = [];
  
  // Pattern-based detection
  if (finalConfig.enablePatternDetection) {
    for (const { pattern, type, severity, description } of INJECTION_PATTERNS) {
      const matches = collectMatches(input, pattern);
      for (const match of matches) {
        threats.push({
          type,
          severity,
          description,
          matchedText: match[0],
          position: match.index,
        });
      }
    }
  }
  
  // Structural analysis
  if (finalConfig.enableStructuralAnalysis) {
    threats.push(...analyzeStructure(input));
  }
  
  // Behavioral analysis
  if (finalConfig.enableBehavioralAnalysis) {
    threats.push(...analyzeBehavior(identifier, input));
  }
  
  // Encoding detection
  if (finalConfig.enableEncodingDetection) {
    threats.push(...analyzeEncoding(input));
  }
  
  const confidence = calculateConfidence(threats);
  const action = determineAction(confidence, finalConfig);
  const passed = action !== 'block';
  
  // Calculate threat level based on confidence and highest severity
  const threatLevel: InjectionCheck['threatLevel'] = threats.length === 0 
    ? 'none'
    : threats.some(t => t.severity === 'critical') ? 'critical'
    : threats.some(t => t.severity === 'high') ? 'high'
    : threats.some(t => t.severity === 'medium') ? 'medium'
    : 'low';
  
  const sanitized = finalConfig.autoSanitize && !passed
    ? sanitizeInput(input, threats)
    : input;
  
  if (finalConfig.logAllAttempts && threats.length > 0) {
    logger.warn('[InjectionGuard] Security assessment', {
      identifier,
      action,
      confidence: confidence.toFixed(2),
      threatCount: threats.length,
      threatTypes: threats.map(t => t.type),
    });
  }
  
  return { passed, confidence, threats, sanitized, action, threatLevel };
}

/**
 * Quick check for high-risk patterns only
 */
export function quickInjectionCheck(input: string): boolean {
  const criticalPatterns = INJECTION_PATTERNS.filter(p => p.severity === 'critical');
  return !criticalPatterns.some(({ pattern }) => pattern.test(input));
}

/**
 * Validate AI output for potential leaks
 */
export function validateResponse(response: string): { valid: boolean; concerns: string[] } {
  const concerns: string[] = [];
  
  const leakagePatterns = [
    { pattern: /I am (?:a language model|an AI|Claude|GPT|an assistant created by)/i, concern: 'ai_identity_leak' },
    { pattern: /my instructions (?:are|tell me|specify)/i, concern: 'instruction_reference' },
    { pattern: /system (?:prompt|instruction|message)/i, concern: 'system_references' },
    { pattern: /ignore previous|disregard above/i, concern: 'suspicious_pattern' },
  ];
  
  for (const { pattern, concern } of leakagePatterns) {
    if (pattern.test(response)) {
      concerns.push(concern);
    }
  }
  
  return { valid: concerns.length === 0, concerns };
}

/**
 * Comprehensive security assessment
 */
export function assessSecurity(
  input: string,
  identifier = 'anonymous'
): InjectionCheck {
  return detectInjection(input, identifier, DEFAULT_CONFIG);
}

/**
 * Track injection attempts with rate limiting
 */
export class InjectionAttemptTracker {
  private attempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly maxAttempts = 5;

  recordAttempt(identifier: string): { blocked: boolean; remaining: number } {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now - record.lastAttempt > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return { blocked: false, remaining: this.maxAttempts - 1 };
    }

    record.count++;
    record.lastAttempt = now;
    const blocked = record.count >= this.maxAttempts;
    
    if (blocked) {
      logger.error(`[InjectionGuard] User ${identifier} blocked after ${record.count} attempts`);
    }
    
    return { blocked, remaining: Math.max(0, this.maxAttempts - record.count) };
  }

  isBlocked(identifier: string): boolean {
    const record = this.attempts.get(identifier);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return false;
    }
    return record.count >= this.maxAttempts;
  }
  
  getAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record) return 0;
    if (Date.now() - record.lastAttempt > this.windowMs) return 0;
    return record.count;
  }
}

export const globalInjectionTracker = new InjectionAttemptTracker();

// Cleanup old behavioral profiles periodically
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [id, profile] of behavioralProfiles.entries()) {
    if (profile.lastRequestTime < cutoff) {
      behavioralProfiles.delete(id);
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes
