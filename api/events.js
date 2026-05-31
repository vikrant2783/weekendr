module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cityName, stateName, startDate, endDate, vibe } = req.body || {};
  if (!cityName) return res.status(400).json({ error: 'cityName required' });

  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    return res.status(200).json({ events: getFallbackEvents(cityName, vibe), fallback: true });
  }

  // Vibe → Eventbrite category mapping
  const vibeCategories = {
    'food':      { cats: ['110'], keywords: 'food market farmer restaurant' },
    'culture':   { cats: ['105'], keywords: 'museum art gallery exhibition' },
    'nature':    { cats: ['108'], keywords: 'outdoor hiking nature park' },
    'nightlife': { cats: ['103'], keywords: 'rooftop bar nightlife cocktail' },
    'music':     { cats: ['103'], keywords: 'live music concert jazz' },
    'adventure': { cats: ['108'], keywords: 'adventure sports outdoor activity' },
    'wellness':  { cats: ['107'], keywords: 'yoga wellness meditation' },
    'family':    { cats: ['115'], keywords: 'family kids activities' },
    'default':   { cats: ['110','105','103','108'], keywords: cityName + ' events weekend' }
  };

  const vc = vibeCategories[vibe] || vibeCategories['default'];
  const location = encodeURIComponent(cityName + ', ' + (stateName || ''));

  try {
    // Search Eventbrite for specific events
    const searchUrl = 'https://www.eventbriteapi.com/v3/events/search/?' +
      'location.address=' + location +
      '&location.within=25mi' +
      '&start_date.range_start=' + startDate + 'T00:00:00' +
      '&start_date.range_end=' + endDate + 'T23:59:59' +
      '&categories=' + vc.cats.join(',') +
      '&q=' + encodeURIComponent(vc.keywords) +
      '&sort_by=best' +
      '&expand=venue,category' +
      '&page_size=8';

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Eventbrite API ' + response.status);
    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      return res.status(200).json({ events: getFallbackEvents(cityName, vibe), fallback: true });
    }

    const events = data.events.map(function(ev) {
      return {
        name: ev.name.text,
        description: ev.description ? ev.description.text.slice(0, 100) : '',
        venue: ev.venue ? ev.venue.name : cityName,
        address: ev.venue ? (ev.venue.address.localized_address_display || '') : '',
        date: ev.start.local,
        url: ev.url,
        price: ev.is_free ? 'Free' : (ev.ticket_availability ? 'From $' + (ev.ticket_availability.minimum_ticket_price ? ev.ticket_availability.minimum_ticket_price.major_value : '?') : 'Paid'),
        image: ev.logo ? ev.logo.url : null,
        category: ev.category ? ev.category.name : 'Event'
      };
    });

    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json({ events: events });

  } catch (err) {
    console.error('Eventbrite error:', err.message);
    return res.status(200).json({ events: getFallbackEvents(cityName, vibe), fallback: true });
  }
};

// Fallback curated events per city
function getFallbackEvents(city, vibe) {
  var c = (city || '').toLowerCase();
  
  var curated = {
    'fort lauderdale': [
      { name: 'Las Olas Farmers Market', venue: 'Las Olas Blvd', address: 'Las Olas Blvd, Fort Lauderdale, FL', date: 'Every Sunday 8am–2pm', url: 'https://www.google.com/maps/search/Las+Olas+Farmers+Market', price: 'Free', category: 'Market' },
      { name: 'NSU Art Museum', venue: 'NSU Art Museum', address: '1 E Las Olas Blvd, Fort Lauderdale', date: 'Tue–Sun 11am–5pm', url: 'https://nsuartmuseum.org', price: 'From $10', category: 'Museum' },
      { name: 'Rooftop @ The Dalmar', venue: 'The Dalmar Hotel', address: '299 N Federal Hwy, Fort Lauderdale', date: 'Daily 4pm–2am', url: 'https://www.thedalmar.com', price: 'Free entry', category: 'Rooftop Bar' }
    ],
    'miami': [
      { name: 'Wynwood Farmers Market', venue: 'Wynwood Walls', address: '2520 NW 2nd Ave, Miami', date: 'Every Saturday 10am–4pm', url: 'https://www.google.com/maps/search/Wynwood+Farmers+Market', price: 'Free', category: 'Market' },
      { name: 'Pérez Art Museum Miami', venue: 'PAMM', address: '1103 Biscayne Blvd, Miami', date: 'Daily 11am–6pm', url: 'https://pamm.org', price: 'From $16', category: 'Museum' },
      { name: 'E11EVEN Miami', venue: 'E11EVEN', address: '29 NE 11th St, Miami', date: 'Fri–Sun 11pm+', url: 'https://11miami.com', price: 'Varies', category: 'Nightlife' }
    ],
    'savannah': [
      { name: 'Forsyth Farmers Market', venue: 'Forsyth Park', address: 'Forsyth Park, Savannah, GA', date: 'Every Saturday 9am–1pm', url: 'https://www.google.com/maps/search/Forsyth+Farmers+Market+Savannah', price: 'Free', category: 'Market' },
      { name: 'Telfair Museums', venue: 'Telfair Academy', address: '121 Barnard St, Savannah', date: 'Daily 10am–5pm', url: 'https://www.telfair.org', price: 'From $12', category: 'Museum' },
      { name: 'The Rooftop Bar at Bohemian', venue: 'Bohemian Hotel', address: '102 W Bay St, Savannah', date: 'Daily 4pm–midnight', url: 'https://www.bohemianhotelsavannah.com', price: 'Free entry', category: 'Rooftop Bar' }
    ],
    'nashville': [
      { name: 'Nashville Farmers Market', venue: 'Nashville Farmers Market', address: '900 Rosa L Parks Blvd, Nashville', date: 'Daily 8am–6pm', url: 'https://nashvillefarmersmarket.org', price: 'Free', category: 'Market' },
      { name: 'Frist Art Museum', venue: 'Frist Art Museum', address: '919 Broadway, Nashville', date: 'Mon–Sat 10am–5pm', url: 'https://fristartmuseum.org', price: 'From $15', category: 'Museum' },
      { name: 'L27 Rooftop Bar', venue: 'Loews Vanderbilt', address: '2100 West End Ave, Nashville', date: 'Daily 4pm–midnight', url: 'https://www.google.com/maps/search/L27+Rooftop+Nashville', price: 'Free entry', category: 'Rooftop Bar' }
    ],
    'default': [
      { name: 'Local Farmers Market', venue: city + ' Market', address: 'Downtown ' + city, date: 'Weekend mornings', url: 'https://www.google.com/maps/search/farmers+market+' + encodeURIComponent(city), price: 'Free', category: 'Market' },
      { name: 'City Art Museum', venue: city + ' Museum', address: 'Downtown ' + city, date: 'Tue–Sun 10am–5pm', url: 'https://www.google.com/maps/search/art+museum+' + encodeURIComponent(city), price: 'From $10', category: 'Museum' },
      { name: 'Rooftop Bar', venue: 'Downtown ' + city, address: 'Downtown ' + city, date: 'Daily 5pm–late', url: 'https://www.google.com/maps/search/rooftop+bar+' + encodeURIComponent(city), price: 'Free entry', category: 'Rooftop' }
    ]
  };

  // Find matching city
  for (var key in curated) {
    if (c.indexOf(key) >= 0 || key.indexOf(c.split(' ')[0]) >= 0) {
      return curated[key];
    }
  }
  return curated['default'];
}
