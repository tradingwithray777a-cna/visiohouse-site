// Netlify serverless function: proxies chat requests to Anthropic's Claude API.
// Keeps the API key server-side — the browser never sees it.
//
// Setup:
// 1. In Netlify: Site settings → Environment variables → add ANTHROPIC_API_KEY (secret).
// 2. Deploy. This function is then reachable at /.netlify/functions/chat
//
// Expects POST body: { system: string, messages: [{role, content}, ...] }
// Returns: { reply: string }

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Add it in Netlify env vars and redeploy.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'messages array is required' }) };
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        system: system || undefined,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return {
        statusCode: anthropicRes.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'Anthropic API error' }),
      };
    }

    const reply = (data.content && data.content[0] && data.content[0].text) || '';
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to reach Anthropic API', detail: String(err) }) };
  }
};
