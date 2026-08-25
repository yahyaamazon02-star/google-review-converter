export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { url } = req.body || {};
  if (!url || (!url.includes('maps.app.goo.gl') && !url.includes('google.com/maps') && !url.includes('goo.gl/maps') && !url.includes('maps.google.com'))) {
    return res.status(400).json({ error: 'Please enter a valid Google Maps URL.' });
  }

  try {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+; SOCS=CAESEwgDEgk2MDQ1NjkyODQaAmVuIAEaBgiA_LyaBg;',
    };

    // 1. Initial request to resolve the shortlink
    let response = await fetch(url, {
      headers,
      redirect: 'follow',
    });

    let finalUrl = response.url || url;
    let html = await response.text();

    // 2. If redirected to consent page, extract and fetch the actual target URL
    if (finalUrl.includes('consent.google.com') && finalUrl.includes('continue=')) {
      try {
        const parsedUrl = new URL(finalUrl);
        const continueUrl = decodeURIComponent(parsedUrl.searchParams.get('continue') || '');
        if (continueUrl) {
          finalUrl = continueUrl;
          const retryRes = await fetch(continueUrl, { headers, redirect: 'follow' });
          html = await retryRes.text();
        }
      } catch (e) {}
    }

    const combinedData = decodeURIComponent(finalUrl) + ' ' + html;

    // 3. Look for standard Google Place ID (ChIJ...)
    const placeIdMatch = combinedData.match(/ChIJ[a-zA-Z0-9_-]{23,}/);
    let placeId = placeIdMatch ? placeIdMatch[0] : null;

    // 4. Look for CID / Feature ID (0x...:0x[hex]) as fallback
    let cid = null;
    const hexMatch = combinedData.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      try {
        cid = BigInt('0x' + hexMatch).toString();
      } catch (e) {}
    }

    const directCidMatch = combinedData.match(/(?:cid|ludocid)[=\/:\\]+([0-9]{10,})/i);
    if (directCidMatch) {
      cid = directCidMatch;
    }

    let reviewUrl = '';
    if (placeId) {
      reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
    } else if (cid) {
      reviewUrl = `https://maps.google.com/?cid=${cid}`;
    } else {
      return res.status(404).json({ error: 'Could not extract Place ID or CID from the link.' });
    }

    return res.status(200).json({
      success: true,
      placeId: placeId || cid,
      reviewUrl,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve the Maps link.', details: error.message });
  }
}
