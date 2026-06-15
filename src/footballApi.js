async function requestJson(path) {
  let response;
  try {
    response = await fetch(path);
  } catch {
    throw new Error("Nao foi possivel conectar a API de futebol. Atualize a pagina e tente novamente.");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const message = data.message || "Nao foi possivel consultar a API de futebol.";
    const error = new Error(message);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Nao foi possivel consultar a API de futebol. Use o link publico do app e tente novamente.");
  }

  return data;
}

export async function fetchImportantMatches(country, days) {
  const params = new URLSearchParams({
    country: country.code,
    days: String(days),
  });

  return requestJson(`/api/matches?${params.toString()}`);
}

export async function fetchMatchStatus(matchId) {
  const data = await requestJson(`/api/matches/${encodeURIComponent(matchId)}`);
  return data.match;
}

export function formatKickoff(isoDate) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
