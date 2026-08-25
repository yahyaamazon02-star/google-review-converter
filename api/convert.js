export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url || (!url.includes('maps.app.goo.gl') && !url.includes('google.com/maps') && !url.includes('goo.gl/maps'))) {
    return res.status(400).json({ error: 'Please enter a valid Google Maps URL.' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    const finalUrl = response.url || url;
    const html = await response.text();

    const placeIdRegex = /ChIJ[a-zA-Z0-9_-]{23,}/;
    const match = html.match(placeIdRegex) || finalUrl.match(placeIdRegex);

    if (!match) {
      return res.status(404).json({ error: 'Could not extract Place ID from the link.' });
    }

    const placeId = match[0];
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;

    return res.status(200).json({ success: true, placeId, reviewUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve the Maps link.' });
  }
}