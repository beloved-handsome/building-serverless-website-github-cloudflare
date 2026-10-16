interface Env {
  AI: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
}

interface TranslateRequest {
  texts?: string[];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: TranslateRequest;
  try {
    body = await request.json() as TranslateRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const texts = body.texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 40 ||
      texts.some((text) => typeof text !== 'string' || text.length > 3000)) {
    return Response.json({ error: 'Send 1–40 text strings, each up to 3000 characters.' }, { status: 400 });
  }

  try {
    const translations = await Promise.all(texts.map(async (text) => {
      if (!text.trim()) return '';
      const result = await env.AI.run('@cf/meta/m2m100-1.2b', {
        text,
        source_lang: 'zh',
        target_lang: 'en',
      }) as { translated_text?: string };
      if (typeof result?.translated_text !== 'string') {
        throw new Error('Unexpected Workers AI translation response');
      }
      return result.translated_text;
    }));
    return Response.json({ translations }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Workers AI translation failed', error);
    return Response.json({ error: 'Translation temporarily unavailable' }, { status: 503 });
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
