async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Nao foi possivel conectar ao Bolao Facil. Atualize a pagina e confirme se esta usando o link publico do app.");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const message = data.message || "Nao foi possivel acessar o bolao.";
    const error = new Error(message);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Nao foi possivel acessar a API do Bolao Facil. Use o link publico do app e tente novamente.");
  }

  return data;
}

function normalizePoolCode(code) {
  const clean = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (clean.startsWith("BOLAO-")) return clean;
  if (clean.startsWith("BOLAO")) return `BOLAO-${clean.slice(5).replace(/^-/, "")}`;
  return clean;
}

function adminQuery(adminToken) {
  return adminToken ? `?admin=${encodeURIComponent(adminToken)}` : "";
}

export { normalizePoolCode };

export async function createSharedPool(payload) {
  return requestJson("/api/pools", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function fetchSharedPool(code, adminToken = "") {
  const normalizedCode = normalizePoolCode(code);
  return requestJson(`/api/pools/${encodeURIComponent(normalizedCode)}${adminQuery(adminToken)}`);
}

export async function updateSharedPool(code, adminToken, patch) {
  const normalizedCode = normalizePoolCode(code);
  return requestJson(`/api/pools/${encodeURIComponent(normalizedCode)}${adminQuery(adminToken)}`, {
    method: "PATCH",
    body: JSON.stringify(patch || {}),
  });
}

export async function addSharedParticipant(code, participant, adminToken = "") {
  const normalizedCode = normalizePoolCode(code);
  return requestJson(`/api/pools/${encodeURIComponent(normalizedCode)}/participants${adminQuery(adminToken)}`, {
    method: "POST",
    body: JSON.stringify(participant || {}),
  });
}

export async function updateSharedParticipant(code, participantId, adminToken, patch) {
  const normalizedCode = normalizePoolCode(code);
  return requestJson(
    `/api/pools/${encodeURIComponent(normalizedCode)}/participants/${encodeURIComponent(participantId)}${adminQuery(
      adminToken,
    )}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch || {}),
    },
  );
}

export async function deleteSharedParticipant(code, participantId, adminToken) {
  const normalizedCode = normalizePoolCode(code);
  return requestJson(
    `/api/pools/${encodeURIComponent(normalizedCode)}/participants/${encodeURIComponent(participantId)}${adminQuery(
      adminToken,
    )}`,
    {
      method: "DELETE",
    },
  );
}
