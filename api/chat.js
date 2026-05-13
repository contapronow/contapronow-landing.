// ──────────────────────────────────────────────────────────────────────
// Serverless Function de Vercel — Proxy seguro a OpenAI
// Ubicación en el repo: /api/chat.js (en la raíz del repo)
// Variable de entorno requerida en Vercel: OPENAI_API_KEY
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS para permitir llamadas desde contapronow.com y subpáginas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ text: 'Método no permitido.' });
  }

  try {
    const { messages, system } = req.body;

    // OpenAI espera el system prompt como un mensaje al inicio del array
    const openaiMessages = [
      { role: 'system', content: system },
      ...messages
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.7,
        messages: openaiMessages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(500).json({
        text: 'Error temporal del asistente. Inténtalo en unos segundos.'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ text: 'Error de conexión.' });
  }
}
