/**
 * OpenRouter Audio-to-Text & Polish Engine (Flow Lite Architecture)
 */

async function processAudioWithOpenRouter({ audioBase64, context, settings, customDictionary = [] }) {
  const apiKey = settings.openrouterApiKey;
  if (!apiKey) {
    throw new Error('Chave da API OpenRouter não configurada. Configure no menu da bandeja.');
  }

  let model = settings.model || 'google/gemini-2.5-flash';
  // Auto-migrate from deprecated 2.0 models that return 404
  if (model.includes('2.0-flash')) {
    model = 'google/gemini-2.5-flash';
  }

  // System instructions for Flow Lite contextual voice engine
  let promptText = `Você é o motor de digitação por voz inteligente do Flow Lite.
Sua tarefa é ouvir o áudio fornecido e transcrevê-lo com inteligência contextual e formatação impecável.

DIRETRIZES FUNDAMENTAIS:
1. Transcreva com fidelidade absoluta à mensagem do usuário em português (ou no idioma falado).
2. REMOVA hesitações, gaguejos e vícios de linguagem involuntários (ex: 'humm', 'ééé', 'ahn', 'tipo assim' quando for hesitação).
3. Aplique pontuação, parágrafos e letras maiúsculas de forma perfeitamente natural e profissional.
4. Se o usuário ditar explicitamente comandos de pontuação (ex: 'vírgula', 'ponto final', 'ponto de interrogação', 'nova linha'), aplique-os no texto.
`;

  if (context && context.WindowTitle) {
    promptText += `\nCONTEXTO DO APLICATIVO EM USO:
- Aplicativo: ${context.ProcessName || 'Desconhecido'}
- Título da Janela: ${context.WindowTitle}
${context.FocusedText ? `- Texto recente no campo ativo: "${context.FocusedText}"` : ''}
Use este contexto para adequar o tom e o jargão (ex: formal para e-mails, informal para mensageiros, técnico para código/IDEs).
`;
  }

  if (customDictionary && customDictionary.length > 0) {
    promptText += `\nDICIONÁRIO PERSONALIZADO DO USUÁRIO (respeite a grafia exata destes termos):
${customDictionary.map(term => `- ${term}`).join('\n')}
`;
  }

  promptText += `\nREGRA SUPREMA: Retorne EXCLUSIVAMENTE o texto final a ser colado no cursor. NUNCA adicione saudações, explicações, notas ou aspas ao redor.`;

  // Payload for OpenRouter supporting audio input
  const payload = {
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: promptText
          },
          {
            type: 'input_audio',
            input_audio: {
              data: audioBase64,
              format: 'wav'
            }
          }
        ]
      }
    ],
    temperature: 0.1
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://flow-lite.local',
      'X-Title': 'Flow Lite'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    // Try fallback with data URI format if input_audio format is rejected
    if (response.status === 400 && errorBody.includes('input_audio')) {
      return await fallbackAudioCall(apiKey, model, promptText, audioBase64);
    }
    throw new Error(`OpenRouter Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Nenhum texto retornado pela IA.');
  }

  return choice.message.content.trim();
}

async function fallbackAudioCall(apiKey, model, promptText, audioBase64) {
  const payload = {
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          {
            type: 'image_url',
            image_url: {
              url: `data:audio/wav;base64,${audioBase64}`
            }
          }
        ]
      }
    ],
    temperature: 0.1
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://flow-lite.local',
      'X-Title': 'Flow Lite'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter Fallback Error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function testApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Chave de API não informada.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`
    }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Chave inválida (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data;
}

module.exports = {
  processAudioWithOpenRouter,
  testApiKey
};
