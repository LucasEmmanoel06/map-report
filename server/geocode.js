// Endereço aproximado a partir do OpenStreetMap (Nominatim). Melhor esforço: falhar não bloqueia a denúncia.
export async function reverseGeocode(lat, lng, { fetchImpl = fetch } = {}) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'olho-no-risco-hackathon/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return {};
    const { address = {} } = await res.json();
    return {
      bairro: address.suburb || address.neighbourhood || address.city_district || null,
      rua: address.road || null,
    };
  } catch {
    return {};
  }
}
