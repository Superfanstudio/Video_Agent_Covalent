// Returns the avatar + voice catalogs the user can pick from.
// Avatar list is public (no auth). Voice list needs the API key.

export default async function handler(req, res) {
  const apiKey = process.env.HEYGEN_API_KEY
  try {
    const [avatarsRes, voicesRes] = await Promise.all([
      fetch('https://api.liveavatar.com/v1/avatars/public?page_size=24'),
      apiKey
        ? fetch('https://api.liveavatar.com/v1/voices?page_size=50', {
            headers: { 'X-API-KEY': apiKey },
          })
        : Promise.resolve(null),
    ])

    const avatarsJson = await avatarsRes.json()
    const avatars = (avatarsJson?.data?.results || [])
      .filter(a => a.status === 'ACTIVE' && a.preview_url)
      .map(a => ({ id: a.id, name: a.name, preview_url: a.preview_url }))

    let voices = []
    if (voicesRes?.ok) {
      const voicesJson = await voicesRes.json()
      voices = (voicesJson?.data?.results || [])
        .filter(v => /^en/i.test(v.language || ''))
        .map(v => ({ id: v.id, name: v.name, gender: v.gender, language: v.language }))
    }

    res.status(200).json({
      avatars,
      voices,
      defaults: {
        avatar_id: process.env.HEYGEN_DEFAULT_AVATAR_ID || null,
      },
    })
  } catch (err) {
    res.status(502).json({ error: 'options_fetch_failed', detail: String(err) })
  }
}
