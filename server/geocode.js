// Endereço aproximado a partir do OpenStreetMap (Nominatim). Melhor esforço: falhar não bloqueia a denúncia.
// No OSM do Recife o bairro oficial às vezes aparece em "suburb", às vezes em "city_district" ou "quarter";
// devolvemos todos os nomes para cruzar com a base da Defesa Civil.
export async function reverseGeocode(lat, lng, { fetchImpl = fetch } = {}) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'olho-no-risco-hackathon/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return {};
    const { address = {} } = await res.json();
    const nomes = [address.suburb, address.city_district, address.quarter, address.neighbourhood].filter(Boolean);
    return {
      bairro: nomes[0] || null,
      rua: address.road || null,
      alternativas: nomes.slice(1),
    };
  } catch {
    return {};
  }
}
