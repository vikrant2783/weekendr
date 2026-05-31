module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { destName, destState } = req.body || {};
  
  if (!destName || !destState) {
    return res.status(200).json({ stays: getSmartFallback('', '') });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ stays: getSmartFallback(destName, destState), fallback: true });
  }

  const prompt = `You are a travel accommodation expert. For ${destName}, ${destState}, USA analyze which unique stay types are genuinely available for weekend trips.

Return ONLY a valid JSON array with exactly 6 items. No markdown, no explanation:
[{"type":"treehouse","available":true,"priceFrom":89,"priceTo":250,"why":"Short reason max 5 words"},{"type":"cabin","available":true,"priceFrom":65,"priceTo":180,"why":"Short reason max 5 words"},{"type":"glamping","available":true,"priceFrom":95,"priceTo":280,"why":"Short reason max 5 words"},{"type":"farmhouse","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"},{"type":"camping","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"},{"type":"lakefront","available":false,"priceFrom":0,"priceTo":0,"why":"Short reason max 5 words"}]

Rules: Beach city=glamping+beachfront only. Mountain=treehouse+cabin+camping+glamping. Desert=glamping+camping. Wine/rural=farmhouse+glamping+treehouse. Lake=lakefront+cabin+camping.`;

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

    if (!response.ok) throw new Error('API ' + response.status);
    const data = await response.json();
    const text = data && data.content && data.content[0] ? data.content[0].text : '';
    const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!match) throw new Error('No JSON');
    const stays = JSON.parse(match[0]);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ stays: stays });
  } catch (err) {
    return res.status(200).json({ stays: getSmartFallback(destName, destState), fallback: true });
  }
};

function getSmartFallback(name, state) {
  var n = (name || '').toLowerCase();
  var s = (state || '').toLowerCase();
  var isBeach = ['beach','coast','key west','key largo','miami','fort lauderdale','naples','clearwater','malibu','pensacola'].some(function(w){ return n.indexOf(w) >= 0; }) || s === 'hawaii';
  var isMtn = ['colorado','utah','wyoming','vermont','new hampshire','montana','tennessee','north carolina','washington','oregon'].indexOf(s) >= 0 || ['mountain','aspen','vail','breckenridge','sedona','tahoe','big bear','bend','smoky','jackson'].some(function(w){ return n.indexOf(w) >= 0; });
  var isDesert = ['arizona','nevada','new mexico'].indexOf(s) >= 0 || ['desert','canyon','moab','palm springs','joshua tree','scottsdale','phoenix','tucson'].some(function(w){ return n.indexOf(w) >= 0; });
  var isRural = ['wine','napa','sonoma','fredericksburg','galena','catskills','woodstock','hamptons','cape cod'].some(function(w){ return n.indexOf(w) >= 0; });
  var isLake = ['tahoe','michigan','geneva','arrowhead','crater','ozark','travis'].some(function(w){ return n.indexOf(w) >= 0; });

  var all = [
    { type: 'treehouse', available: (isMtn || isRural) && !isBeach && !isDesert, priceFrom: 89, priceTo: 250, why: isMtn ? 'Mountain forest treehouses' : 'Countryside treehouses nearby' },
    { type: 'cabin', available: (isMtn || isLake) && !isBeach && !isDesert, priceFrom: 65, priceTo: 180, why: isMtn ? 'Mountain cabins & lodges' : 'Lakeside cabin retreats' },
    { type: 'glamping', available: true, priceFrom: isBeach ? 110 : isDesert ? 120 : 90, priceTo: isBeach ? 300 : 280, why: isBeach ? 'Luxury coastal glamping' : isDesert ? 'Desert glamping tents' : 'Outdoor glamping nearby' },
    { type: 'farmhouse', available: isRural && !isBeach && !isDesert, priceFrom: 75, priceTo: 200, why: 'Wine country farm stays' },
    { type: 'camping', available: (isMtn || isRural || isLake) && !isBeach, priceFrom: 25, priceTo: 75, why: isMtn ? 'National forest camping' : 'State park camping nearby' },
    { type: 'lakefront', available: isLake && !isBeach, priceFrom: 110, priceTo: 350, why: 'Waterfront homes on the lake' }
  ];

  var available = all.filter(function(s) { return s.available; });
  if (available.length < 2) {
    available = [all[2]];
    if (all[0].available || true) available.push(all[3].available ? all[3] : all[4]);
  }
  return available;
} 
