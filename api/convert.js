export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'Please enter a valid Google Maps URL.' });
  }

  try {
    let collectedData = url;

    // 1. Intercept manual 302 redirect header directly from short link
    const resManual = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const locationHeader = resManual.headers.get('location');
    if (locationHeader) {
      collectedData += ' ' + locationHeader;

      // 2. Fetch destination with cookies to capture full place payload
      try {
        const resFollow = await fetch(locationHeader, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Cookie': 'CONSENT=YES+; SOCS=CAESEwgDEgk2MDQ1NjkyODQaAmVuIAEaBgiA_LyaBg;',
          },
        });
        const html = await resFollow.text();
        collectedData += ' ' + (resFollow.url || '') + ' ' + html;
      } catch (e) {}
    } else {
      const initialHtml = await resManual.text();
      collectedData += ' ' + initialHtml;
    }

    const decoded = decodeURIComponent(collectedData);

    // Look for Place ID (ChIJ...)
    const placeIdMatch = decoded.match(/ChIJ[a-zA-Z0-9_-]{23,}/);
    if (placeIdMatch) {
      const placeId = placeIdMatch[0];
      return res.status(200).json({
        success: true,
        placeId,
        reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`,
      });
    }

    // Look for Hex CID / Feature ID (0x...:0x[hex]) as fallback
    const hexMatch = decoded.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      try {
        const cid = BigInt('0x' + hexMatch).toString();
        return res.status(200).json({
          success: true,
          placeId: cid,
          reviewUrl: `https://maps.google.com/?cid=${cid}`,
        });
      } catch (e) {}
    }

    // Look for decimal CID in URL parameters
    const cidMatch = decoded.match(/(?:cid|ludocid)[=\/:\\]+([0-9]{10,})/i);
    if (cidMatch) {
      const cid = cidMatch;
      return res.status(200).json({
        success: true,
        placeId: cid,
        reviewUrl: `https://maps.google.com/?cid=${cid}`,
      });
    }

    return res.status(404).json({ error: 'Could not extract Place ID or CID from the link.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve the Maps link.' });
  }
}
