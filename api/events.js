module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cityName, stateName, startDate, endDate, vibe } = req.body || {};
  if (!cityName) return res.status(400).json({ error: 'cityName required' });

  const token = process.env.EVENTBRITE_TOKEN;
  console.log('Token present:', !!token, '| City:', cityName, '| Dates:', startDate, '-', endDate);

  if (token) {
    try {
      // Eventbrite API v3 - correct format
      const location = cityName + (stateName ? ', ' + stateName : '') + ', United States';
      
      const params = new URLSearchParams({
        'location.address': location,
        'location.within': '30mi',
        'start_date.range_start': startDate + 'T00:00:00',
        'start_date.range_end': endDate + 'T23:59:59',
        'sort_by': 'best',
        'expand': 'venue,category,ticket_availability',
        'page_size': '6'
      });

      const url = 'https://www.eventbriteapi.com/v3/events/search/?' + params.toString();
      console.log('Fetching:', url.slice(0, 100));

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/json'
        }
      });

      console.log('Eventbrite response status:', response.status);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Eventbrite error body:', errText.slice(0, 200));
        throw new Error('API ' + response.status);
      }

      const data = await response.json();
      console.log('Events found:', data.events ? data.events.length : 0);

      if (data.events && data.events.length > 0) {
        const events = data.events.map(ev => {
          // Format date nicely
          const startLocal = ev.start && ev.start.local ? ev.start.local : '';
          const dateObj = startLocal ? new Date(startLocal) : null;
          const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }) : startLocal;

          // Get price
          let price = 'Free';
          if (!ev.is_free) {
            if (ev.ticket_availability && ev.ticket_availability.minimum_ticket_price) {
              price = 'From $' + ev.ticket_availability.minimum_ticket_price.major_value;
            } else {
              price = 'Paid';
            }
          }

          return {
            name: ev.name.text,
            description: ev.summary || '',
            venue: ev.venue ? ev.venue.name : cityName,
            address: ev.venue && ev.venue.address ? ev.venue.address.localized_address_display : '',
            date: dateStr,
            url: ev.url,
            price: price,
            category: ev.category ? ev.category.name : 'Event',
            fallback: false
          };
        });

        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        return res.status(200).json({ events, source: 'eventbrite' });
      }
    } catch (err) {
      console.error('Eventbrite failed:', err.message);
    }
  }

  // Smart fallback - Eventbrite filtered search URLs with exact dates
  const citySlug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const dateQ = startDate ? '?start_date=' + startDate + 'T00%3A00%3A00&end_date=' + endDate + 'T23%3A59%3A59' : '';
  const base = 'https://www.eventbrite.com/d/' + citySlug + '/events/' + dateQ;
  const amp = dateQ ? '&' : '?';

  const fallbackEvents = [
    { name: 'All Events in ' + cityName, category: 'Events', venue: cityName,
      address: cityName + (stateName ? ', ' + stateName : ''),
      date: startDate + ' to ' + endDate,
      url: base + amp + 'q=events', price: 'Various', fallback: true },
    { name: 'Food & Drink Events', category: 'Food & Drink', venue: cityName,
      address: cityName + (stateName ? ', ' + stateName : ''),
      date: startDate + ' to ' + endDate,
      url: base + amp + 'q=food+drink', price: 'Various', fallback: true },
    { name: 'Music & Concerts', category: 'Music', venue: cityName,
      address: cityName + (stateName ? ', ' + stateName : ''),
      date: startDate + ' to ' + endDate,
      url: base + amp + 'q=music+concert', price: 'Various', fallback: true },
    { name: 'Arts & Culture', category: 'Arts', venue: cityName,
      address: cityName + (stateName ? ', ' + stateName : ''),
      date: startDate + ' to ' + endDate,
      url: base + amp + 'q=arts+culture', price: 'Various', fallback: true },
  ];

  return res.status(200).json({ events: fallbackEvents, fallback: true });
};
