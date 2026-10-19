import { Router } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { requireAuth } from './auth';

const router = Router();

// npm workspace scripts may start with either the repository root or backend
// as their working directory. Load the backend's local environment file in
// both cases, while allowing real process environment variables to win.
const backendEnvCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/backend/.env'),
];
const backendEnvPath = backendEnvCandidates.find((candidate) => require('fs').existsSync(candidate));
if (backendEnvPath) dotenv.config({ path: backendEnvPath });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Use a model that's actually available on Groq
const GROQ_MODEL = 'openai/gpt-oss-120b';

router.post('/explain', requireAuth, async (req: any, res) => {
  const { code, language, question } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(503).json({
      answer: '⚠️ AI features are disabled. Add GROQ_API_KEY to your backend .env file.\n\nGet your free key at: https://console.groq.com',
    });
  }

  if (!code && !question) {
    return res.status(400).json({ error: 'Code or question required' });
  }

  const systemPrompt = `You are an expert ${language} developer and senior code reviewer embedded inside a collaborative code editor.
Be concise, direct, and helpful. If explaining bugs, always show the corrected code snippet.
Respond in plain text — no markdown headers, keep formatting minimal.`;

  const userPrompt = `The user asked: "${question || 'Please explain this code'}"

\`\`\`${language}
${code?.slice(0, 8000) || '(no code provided)'}
\`\`\``;

  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error?.message || `Groq API error (${resp.status})`);
    }

    const answer = data.choices?.[0]?.message?.content || 'No response generated.';
    res.json({ answer });
  } catch (err: any) {
    if (err?.message === 'fetch failed') {
      console.error('[AI] Could not reach the Groq API:', err?.cause?.code || err.message);
      return res.status(502).json({
        answer: 'AI Error: Could not connect to the Groq API. Check that this computer has internet access and that a firewall or VPN is not blocking api.groq.com.',
      });
    }
    res.status(500).json({ answer: `AI Error: ${err.message}` });
  }
});

export default router;
