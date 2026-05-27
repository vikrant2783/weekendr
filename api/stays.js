// Vercel Serverless Function: /api/stays
// Calls Anthropic API securely (API key hidden from browser)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { destName, destState, checkIn, checkOut, adults } = req.body;
  
  if (!destName || !destState) {
    return res.status(400).json({ error: 'Missing destination' });
  }

  const prompt = `You are a travel stay expert with deep knowledge of US destinations.

For ${destName}, ${destState}, USA — analyze what unique accommodation types are genuinely available and popular. Consider the geography, terrain, and tourism patterns of this specific location.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {"type":"treehouse","available":true,"priceFrom":89,"priceTo":250,"why":"Scenic mountain forest area with many tree house rentals"},
  {"type":"cabin","available":true,"priceFrom":65,"priceTo":180,"why":"Mountain cabins are the most popular stay here"},
  {"type":"glamping","available":false,"priceFrom":0,"priceTo":0,"why":"Not common in urban beach areas"},
  {"type":"farmhouse","available":false,"priceFrom":0,"priceTo":0,"why":"Beach destination, no farm stays"},
  {"type":"camping","available":true,"priceFrom":25,"priceTo":75,"why":"Multiple state parks within 30 mins"},
  {"type":"lakefront","available":false,"priceFrom":0,"priceTo":0,"why":"Coastal area, not lakefront"}
]

Rules:
- Beach/coastal cities: treehouse unlikely, lakefront rare, glamping possible, camping rare
- Mountain cities: cabin very common, camping common, treehouse possible, lakefront rare  
- Desert cities: glamping popular, camping possible, treehouse rare, lakefront rare
- Wine country/rural: farmhouse very common, glamping common, cabin possible
- Lakes/rivers nearby: lakefront common, camping common
- Price ranges should reflect actual market rates for that region
- "why" should be 1 short sentence explaining availability`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Fast + cheap for this use case
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    
    if (!data.content || !data.content[0]) {
      throw new Error('No response from AI');
    }

    const text = data.content[0].text;
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const stays = JSON.parse(jsonMatch[0]);
    
    // Cache for 1 hour - same city shouldn't re-fetch
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json({ stays, cached: false });
    
  } catch (error) {
    console.error('AI stays error:', error);
    // Return fallback data based on simple rules
    return res.status(200).json({ 
      stays: getFallbackStays(destName, destState),
      cached: false,
      fallback: true
    });
  }
}

function getFallbackStays(destName, destState) {
  const name = destName.toLowerCase();
  const state = destState.toLowerCase();
  
  // Simple geographic rules for fallback
  const isBeach = ['florida','hawaii','california'].includes(state) || 
    ['beach','coast','key','island','bay','shore'].some(w => name.includes(w));
  const isMountain = ['colorado','utah','wyoming','montana','vermont','new hampshire'].includes(state) ||
    ['mountain','peak','valley','ridge','falls'].some(w => name.includes(w));
  const isDesert = ['arizona','nevada','new mexico'].includes(state);
  const isRural = ['wine','valley','farm','ranch','hill'].some(w => name.includes(w));
  
  return [
    {type:'treehouse', available: isMountain || isRural, priceFrom:89, priceTo:250, why:'Available in forested areas nearby'},
    {type:'cabin', available: isMountain, priceFrom:65, priceTo:180, why:'Mountain cabins popular here'},
    {type:'glamping', available: isDesert || isRural || isMountain, priceFrom:95, priceTo:280, why:'Luxury outdoor stays available'},
    {type:'farmhouse', available: isRural, priceFrom:75, priceTo:200, why:'Farm stays in the countryside'},
    {type:'camping', available: isMountain || isRural, priceFrom:25, priceTo:75, why:'State parks and campgrounds nearby'},
    {type:'lakefront', available: !isBeach && !isDesert, priceFrom:110, priceTo:350, why:'Lakefront properties available'}
  ];
}
