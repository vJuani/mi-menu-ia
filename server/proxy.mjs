// Backend mínimo y OPCIONAL para la IA online. La clave del proveedor vive acá
// (variable de entorno), nunca en la app. Desplegalo en un servicio propio
// (Cloudflare Workers, Fly.io, Render, una Raspberry en casa con HTTPS, etc.).
//
//   ANTHROPIC_API_KEY=... node server/proxy.mjs
//
// La app valida SIEMPRE la respuesta con las reglas locales (seguridad infantil,
// restricciones): este servidor no puede anular nada.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AI_MODEL ?? 'claude-sonnet-5-5';

const SYSTEM = `Sos el asistente de cocina de una familia en Argentina (español rioplatense, sistema métrico).
Respondé breve y práctico. Respetá estrictamente los alimentos rechazados de cada integrante.
Para el bebé: sin sal, sin azúcar, sin miel antes de los 12 meses, sin formatos con riesgo de atragantamiento,
y nunca propongas alimentos nuevos sin aclarar que requieren confirmación del adulto y del pediatra.
Si proponés comidas, devolvé además un JSON en la última línea con la forma
{"proposal":[{"memberId":"...","ingredientNames":["..."]}]}.`;

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/assistant') { res.writeHead(404).end(); return; }
  if (!KEY) { res.writeHead(500).end('Falta ANTHROPIC_API_KEY'); return; }
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200_000) { res.writeHead(413).end(); return; } }
  try {
    const input = JSON.parse(body);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 800, system: SYSTEM,
        messages: [{ role: 'user', content: `Contexto: ${JSON.stringify({ members: input.members, babyAgeMonths: input.babyAgeMonths, inventory: input.inventory, recipes: input.recipes })}\n\nPregunta: ${input.question}` }],
      }),
    });
    const data = await r.json();
    const text = (data.content ?? []).map((c) => c.text ?? '').join('');
    const last = text.trim().split('\n').at(-1) ?? '';
    let proposal;
    try { proposal = JSON.parse(last).proposal; } catch { /* sin propuesta estructurada */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: proposal ? text.replace(last, '').trim() : text, proposal }));
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ text: 'Error consultando la IA.' }));
  }
}).listen(PORT, () => console.log(`Proxy IA en :${PORT}`));
