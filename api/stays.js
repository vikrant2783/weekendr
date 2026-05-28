// Vercel Serverless Function: /api/stays

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { destName, destState } = req.body || {};
  
  if (!destName || !destState) {
    return res.status(200).json({ stays: getSmartFallback(destName || '', destState || '') });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ stays: getSmartFallback(destName, destState), fallback: true });
  }

  const prompt = `You are a travel accommodation expert. For ${destName}, ${destState}, USA analyze which unique stay types are genuinely available and popular for weekend trips.

Return ONLY a valid JSON array with exactly 6 items in this order. No markdown, no explanation:
[
{"type":"treehouse","available":true,"priceFrom":89,"priceTo":250,"why":"Short reason max 5 words"},
{"type":"cabin","available":true,"priceFrom":65,"priceTo":180,"why":"Short reason max 5 words"},
{"type":"glamping","available":true,"priceFrom":95,"priceTo":280,"why":"Short reason max 5 words"},
{"type":"farmhouse","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"},
{"type":"camping","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"},
{"type":"lakefront","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"}
]

Geography rules:
- Beach/coastal: glamping=yes, treehouse=rare, cabin=no, farmhouse=no, camping=no, lakefront=no
- Mountain: treehouse=yes, cabin=yes, camping=yes, glamping=yes, farmhouse=maybe, lakefront=maybe
- Desert: glamping=yes, camping=maybe, treehouse=rare, cabin=no, farmhouse=no, lakefront=no  
- Wine/rural: farmhouse=yes, glamping=yes, treehouse=yes, cabin=maybe, camping=maybe
- Lake area: lakefront=yes, cabin=yes, camping=yes, glamping=yes, treehouse=maybe
- Price ranges must reflect actual market rates for that specific region.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    
    const data = await response.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!match) throw new Error('No JSON');
    
    const stays = JSON.parse(match[0]);
    
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ stays });
    
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(200).json({ stays: getSmartFallback(destName, destState), fallback: true });
  }
}

function getSmartFallback(name, state) {
  const n = name.toLowerCase();
  const s = state.toLowerCase();
  
  const isBeach = ['beach','coast','key west','key largo','miami','fort lauderdale','naples','clearwater','gulf shores','malibu','santa monica','pensacola'].some(w => n.includes(w)) || s === 'hawaii';
  const isMtn = ['colorado','utah','wyoming','vermont','new hampshire','montana','tennessee','north carolina','washington','oregon'].includes(s) || ['mountain','aspen','vail','breckenridge','sedona','tahoe','big bear','bend','smoky','jackson'].some(w => n.includes(w));
  const isDesert = ['arizona','nevada','new mexico'].includes(s) || ['desert','canyon','moab','palm springs','joshua tree','scottsdale','phoenix','tucson'].some(w => n.includes(w));
  const isRural = ['wine','napa','sonoma','fredericksburg','galena','catskills','woodstock','hamptons','cape cod'].some(w => n.includes(w));
  const isLake = ['tahoe','michigan','geneva','arrowhead','crater','ozark','travis'].some(w => n.includes(w));

  const all = [
    { type:'treehouse', available: isMtn||isRural, priceFrom:89, priceTo:250, why:'Forest treehouses in the area' },
    { type:'cabin', available: isMtn||isLake||isRural, priceFrom:65, priceTo:180, why: isMtn?'Mountain cabins very popular here':'Cozy cabin retreats nearby' },
    { type:'glamping', available: true, priceFrom: isBeach?120:isDesert?130:95, priceTo: isBeach?320:280, why: isBeach?'Beachside luxury glamping':isDesert?'Desert glamping popular':'Luxury outdoor stays nearby' },
    { type:'farmhouse', available: isRural||(!isBeach&&!isDesert&&!isMtn), priceFrom:75, priceTo:200, why:'Rural farmhouse retreats nearby' },
    { type:'camping', available: isMtn||isRural||isLake, priceFrom:25, priceTo:75, why: isMtn?'National forest camping nearby':'State parks and campgrounds nearby' },
    { type:'lakefront', available: isLake||(!isBeach&&!isDesert&&isMtn), priceFrom:110, priceTo:350, why: isLake?'Prime lakefront properties here':'Mountain waterfront properties' }
  ];

  const available = all.filter(s => s.available);
  // Always return min 3
  if (available.length < 3) {
    all.forEach(s => { if (available.length < 3 && !s.available) available.push(s); });
  }
  return available;
}
