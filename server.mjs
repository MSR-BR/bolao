import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const apiBaseUrl = "https://api.football-data.org/v4";
const port = Number(process.env.PORT || 5173);
const jsonBodyLimit = 1_000_000;

const COUNTRY_COMPETITIONS = {
  BR: ["BSA", "BSB", "CLI", "CA", "EC", "WC"],
};

const ALLOWED_SEARCH_DAYS = new Set([1, 3, 7]);

const COMPETITION_IMPORTANCE = {
  BSA: "Liga principal",
  BSB: "Segunda divisão nacional",
  CLI: "Competição continental",
  CA: "Competição continental",
  EC: "Torneio internacional",
  WC: "Torneio mundial",
};

const STATUS_LABELS = {
  SCHEDULED: "Agendado",
  TIMED: "Agendado",
  IN_PLAY: "Ao vivo",
  PAUSED: "Intervalo",
  EXTRA_TIME: "Prorrogacao",
  PENALTY_SHOOTOUT: "Penaltis",
  FINISHED: "Encerrado",
  SUSPENDED: "Suspenso",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
  AWARDED: "Resultado atribuido",
};

const memoryPools = new Map();
const memoryParticipants = new Map();

const POOL_SELECT_COLUMNS = [
  "id",
  "code",
  "title",
  "admin_token_hash",
  "search_days",
  "selected_match_id",
  "selected_match",
  "live_match",
  "bets_closed",
  "bet_value",
  "pix_key",
  "merchant_name",
  "created_at",
  "updated_at",
].join(",");

const PARTICIPANT_SELECT_COLUMNS = [
  "id",
  "pool_id",
  "name",
  "home_goals",
  "away_goals",
  "paid",
  "created_at",
  "updated_at",
].join(",");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > jsonBodyLimit) {
        rejectBody(Object.assign(new Error("Payload muito grande."), { statusCode: 413 }));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(Object.assign(new Error("JSON invalido."), { statusCode: 400 }));
      }
    });

    request.on("error", rejectBody);
  });
}

function normalizeCode(value) {
  const clean = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (clean.startsWith("BOLAO-")) return clean;
  if (clean.startsWith("BOLAO")) return `BOLAO-${clean.slice(5).replace(/^-/, "")}`;
  return clean;
}

function generatePoolCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = randomBytes(6);

  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
    if (suffix.length === 5) break;
  }

  return `BOLAO-${suffix}`;
}

function generateAdminToken() {
  return randomBytes(18).toString("base64url");
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function publicPool(pool, storageMode) {
  if (!pool) return null;

  return {
    id: pool.id,
    code: pool.code,
    title: pool.title,
    searchDays: pool.search_days,
    selectedMatchId: pool.selected_match_id,
    selectedMatch: pool.selected_match,
    betsClosed: pool.bets_closed,
    betValue: Number(pool.bet_value || 0),
    pixKey: pool.pix_key || "",
    merchantName: pool.merchant_name || "",
    liveMatch: pool.live_match,
    createdAt: pool.created_at,
    updatedAt: pool.updated_at,
    storageMode,
  };
}

function publicParticipant(participant) {
  return {
    id: participant.id,
    name: participant.name,
    homeGoals: Number(participant.home_goals || 0),
    awayGoals: Number(participant.away_goals || 0),
    paid: Boolean(participant.paid),
    createdAt: participant.created_at,
    updatedAt: participant.updated_at,
  };
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && getSupabaseServerKey());
}

function getSupabaseServerKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function supabaseRest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = getSupabaseServerKey();

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("Supabase nao configurado.");
    error.statusCode = 501;
    throw error;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || "Erro ao consultar o Supabase.");
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function findSupabasePool(code) {
  const rows = await supabaseRest(
    `/bolao_pools?code=eq.${encodeURIComponent(code)}&select=${POOL_SELECT_COLUMNS}&limit=1`,
    { method: "GET", headers: { Prefer: "" } },
  );

  return rows?.[0] || null;
}

async function listSupabaseParticipants(poolId) {
  const rows = await supabaseRest(
    `/bolao_participants?pool_id=eq.${encodeURIComponent(poolId)}&select=${PARTICIPANT_SELECT_COLUMNS}&order=created_at.asc`,
    { method: "GET", headers: { Prefer: "" } },
  );

  return rows || [];
}

async function fetchPoolBundle(code, adminToken = "") {
  const normalizedCode = normalizeCode(code);
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const pool = storageMode === "supabase" ? await findSupabasePool(normalizedCode) : memoryPools.get(normalizedCode);

  if (!pool) {
    const error = new Error("Bolão não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const participants =
    storageMode === "supabase"
      ? await listSupabaseParticipants(pool.id)
      : Array.from(memoryParticipants.get(pool.id)?.values() || []);
  const isCoordinator = Boolean(adminToken && pool.admin_token_hash === hashToken(adminToken));

  return {
    pool: publicPool(pool, storageMode),
    participants: participants.map(publicParticipant),
    isCoordinator,
  };
}

async function createPoolRecord(payload = {}) {
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const adminToken = generateAdminToken();
  const basePool = {
    title: String(payload.title || "Bolão Fácil").trim().slice(0, 80) || "Bolão Fácil",
    admin_token_hash: hashToken(adminToken),
    search_days: ALLOWED_SEARCH_DAYS.has(Number(payload.searchDays)) ? Number(payload.searchDays) : 7,
    selected_match_id: null,
    selected_match: null,
    live_match: null,
    bets_closed: false,
    bet_value: Number(payload.betValue || 20),
    pix_key: "",
    merchant_name: "",
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePoolCode();

    if (storageMode === "memoria") {
      if (memoryPools.has(code)) continue;

      const now = new Date().toISOString();
      const pool = {
        id: randomUUID(),
        code,
        ...basePool,
        created_at: now,
        updated_at: now,
      };

      memoryPools.set(code, pool);
      memoryParticipants.set(pool.id, new Map());
      return { ...(await fetchPoolBundle(code, adminToken)), adminToken };
    }

    try {
      const rows = await supabaseRest(`/bolao_pools?select=${POOL_SELECT_COLUMNS}`, {
        method: "POST",
        body: JSON.stringify([{ code, ...basePool }]),
      });
      const pool = rows?.[0];
      return { pool: publicPool(pool, storageMode), participants: [], isCoordinator: true, adminToken };
    } catch (error) {
      if (error.statusCode === 409) continue;
      throw error;
    }
  }

  const error = new Error("Nao foi possivel gerar um codigo unico para o bolão.");
  error.statusCode = 500;
  throw error;
}

function requireCoordinator(pool, adminToken) {
  if (!adminToken || pool.admin_token_hash !== hashToken(adminToken)) {
    const error = new Error("Apenas o coordenador pode fazer esta alteração.");
    error.statusCode = 403;
    throw error;
  }
}

function pickPoolPatch(body = {}) {
  const patch = {};

  if (Object.hasOwn(body, "title")) patch.title = String(body.title || "Bolão Fácil").trim().slice(0, 80) || "Bolão Fácil";
  if (Object.hasOwn(body, "searchDays")) {
    const days = Number(body.searchDays);
    if (ALLOWED_SEARCH_DAYS.has(days)) patch.search_days = days;
  }
  if (Object.hasOwn(body, "selectedMatchId")) patch.selected_match_id = body.selectedMatchId ? String(body.selectedMatchId) : null;
  if (Object.hasOwn(body, "selectedMatch")) patch.selected_match = body.selectedMatch || null;
  if (Object.hasOwn(body, "liveMatch")) patch.live_match = body.liveMatch || null;
  if (Object.hasOwn(body, "betsClosed")) patch.bets_closed = Boolean(body.betsClosed);
  if (Object.hasOwn(body, "betValue")) patch.bet_value = Number(body.betValue || 0);
  if (Object.hasOwn(body, "pixKey")) patch.pix_key = String(body.pixKey || "").slice(0, 160);
  if (Object.hasOwn(body, "merchantName")) patch.merchant_name = String(body.merchantName || "").slice(0, 80);

  patch.updated_at = new Date().toISOString();
  return patch;
}

async function updatePoolRecord(code, adminToken, body) {
  const normalizedCode = normalizeCode(code);
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const pool = storageMode === "supabase" ? await findSupabasePool(normalizedCode) : memoryPools.get(normalizedCode);

  if (!pool) {
    const error = new Error("Bolão não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  requireCoordinator(pool, adminToken);
  const patch = pickPoolPatch(body);

  if (storageMode === "memoria") {
    Object.assign(pool, patch);
    memoryPools.set(normalizedCode, pool);
    return fetchPoolBundle(normalizedCode, adminToken);
  }

  await supabaseRest(`/bolao_pools?id=eq.${encodeURIComponent(pool.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });

  const participants = await listSupabaseParticipants(pool.id);

  return {
    pool: publicPool({ ...pool, ...patch }, storageMode),
    participants: participants.map(publicParticipant),
    isCoordinator: true,
  };
}

function pickParticipantPatch(body = {}, includeName = true) {
  const patch = {};

  if (includeName && Object.hasOwn(body, "name")) patch.name = String(body.name || "").trim().slice(0, 80);
  if (Object.hasOwn(body, "homeGoals")) patch.home_goals = Math.max(0, Math.min(20, Number(body.homeGoals || 0)));
  if (Object.hasOwn(body, "awayGoals")) patch.away_goals = Math.max(0, Math.min(20, Number(body.awayGoals || 0)));
  if (Object.hasOwn(body, "paid")) patch.paid = Boolean(body.paid);

  patch.updated_at = new Date().toISOString();
  return patch;
}

async function addParticipantRecord(code, body) {
  const normalizedCode = normalizeCode(code);
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const pool = storageMode === "supabase" ? await findSupabasePool(normalizedCode) : memoryPools.get(normalizedCode);

  if (!pool) {
    const error = new Error("Bolão não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  if (pool.bets_closed) {
    const error = new Error("As apostas deste bolão já foram fechadas.");
    error.statusCode = 409;
    throw error;
  }

  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) {
    const error = new Error("Informe o nome do participante.");
    error.statusCode = 400;
    throw error;
  }

  const participant = {
    id: randomUUID(),
    pool_id: pool.id,
    name,
    home_goals: Math.max(0, Math.min(20, Number(body.homeGoals || 0))),
    away_goals: Math.max(0, Math.min(20, Number(body.awayGoals || 0))),
    paid: false,
  };

  if (storageMode === "memoria") {
    const now = new Date().toISOString();
    const stored = { ...participant, created_at: now, updated_at: now };
    memoryParticipants.get(pool.id).set(stored.id, stored);
    return fetchPoolBundle(normalizedCode);
  }

  await supabaseRest("/bolao_participants", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([participant]),
  });

  const participants = await listSupabaseParticipants(pool.id);

  return {
    pool: publicPool(pool, storageMode),
    participants: participants.map(publicParticipant),
    isCoordinator: false,
  };
}

async function updateParticipantRecord(code, participantId, adminToken, body) {
  const normalizedCode = normalizeCode(code);
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const pool = storageMode === "supabase" ? await findSupabasePool(normalizedCode) : memoryPools.get(normalizedCode);

  if (!pool) {
    const error = new Error("Bolão não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  if (pool.bets_closed || Object.hasOwn(body, "paid")) requireCoordinator(pool, adminToken);

  const patch = pickParticipantPatch(body);
  if (Object.hasOwn(patch, "name") && !patch.name) {
    const error = new Error("Informe o nome do participante.");
    error.statusCode = 400;
    throw error;
  }

  if (storageMode === "memoria") {
    const participants = memoryParticipants.get(pool.id);
    const participant = participants?.get(participantId);
    if (!participant) {
      const error = new Error("Participante não encontrado.");
      error.statusCode = 404;
      throw error;
    }

    participants.set(participantId, { ...participant, ...patch });
    return fetchPoolBundle(normalizedCode, adminToken);
  }

  await supabaseRest(
    `/bolao_participants?id=eq.${encodeURIComponent(participantId)}&pool_id=eq.${encodeURIComponent(pool.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );

  const participants = await listSupabaseParticipants(pool.id);

  return {
    pool: publicPool(pool, storageMode),
    participants: participants.map(publicParticipant),
    isCoordinator: Boolean(adminToken && pool.admin_token_hash === hashToken(adminToken)),
  };
}

async function deleteParticipantRecord(code, participantId, adminToken) {
  const normalizedCode = normalizeCode(code);
  const storageMode = isSupabaseConfigured() ? "supabase" : "memoria";
  const pool = storageMode === "supabase" ? await findSupabasePool(normalizedCode) : memoryPools.get(normalizedCode);

  if (!pool) {
    const error = new Error("Bolão não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  if (pool.bets_closed) requireCoordinator(pool, adminToken);

  if (storageMode === "memoria") {
    memoryParticipants.get(pool.id)?.delete(participantId);
    return fetchPoolBundle(normalizedCode, adminToken);
  }

  await supabaseRest(
    `/bolao_participants?id=eq.${encodeURIComponent(participantId)}&pool_id=eq.${encodeURIComponent(pool.id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );

  const participants = await listSupabaseParticipants(pool.id);

  return {
    pool: publicPool(pool, storageMode),
    participants: participants.map(publicParticipant),
    isCoordinator: Boolean(adminToken && pool.admin_token_hash === hashToken(adminToken)),
  };
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseSearchDays(requestUrl) {
  const requestedDays = Number(requestUrl.searchParams.get("days") || 7);
  return ALLOWED_SEARCH_DAYS.has(requestedDays) ? requestedDays : 7;
}

function formatDaysNotice(days) {
  return days === 1 ? "no próximo 1 dia" : `nos próximos ${days} dias`;
}

function readScore(match) {
  const score = match.score || {};
  const candidates = [score.fullTime, score.regularTime, score.halfTime];
  const currentScore = candidates.find((item) => Number.isFinite(item?.home) && Number.isFinite(item?.away));

  return {
    homeGoals: currentScore?.home ?? 0,
    awayGoals: currentScore?.away ?? 0,
  };
}

function mapMatch(match) {
  const score = readScore(match);
  const statusKey = match.status || "SCHEDULED";
  const competitionCode = match.competition?.code || String(match.competition?.id || "");

  return {
    id: String(match.id),
    providerId: match.id,
    countryCode: match.area?.code || "",
    countryName: match.area?.name || "",
    competition: match.competition?.name || "Competicao",
    competitionCode,
    home: match.homeTeam?.shortName || match.homeTeam?.name || "Mandante",
    away: match.awayTeam?.shortName || match.awayTeam?.name || "Visitante",
    kickoff: match.utcDate,
    importance:
      statusKey === "IN_PLAY" || statusKey === "PAUSED"
        ? "Ao vivo agora"
        : COMPETITION_IMPORTANCE[competitionCode] || "Jogo oficial",
    source: "football-data.org",
    statusKey,
    statusLabel: STATUS_LABELS[statusKey] || statusKey,
    isFinished: statusKey === "FINISHED",
    minute: Number.isFinite(Number(match.minute)) ? Number(match.minute) : null,
    lastUpdated: match.lastUpdated || new Date().toISOString(),
    ...score,
  };
}

async function footballDataRequest(path) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token || token === "cole_seu_token_aqui") {
    const error = new Error("Configure FOOTBALL_DATA_TOKEN no arquivo .env para buscar jogos reais.");
    error.statusCode = 401;
    error.code = "TOKEN_MISSING";
    throw error;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "X-Auth-Token": token,
      "X-Unfold-Goals": "true",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "A API de futebol recusou a consulta.");
    error.statusCode = response.status;
    error.code = data.errorCode || "PROVIDER_ERROR";
    error.details = data;
    throw error;
  }

  return data;
}

async function getMatches(requestUrl, response) {
  const countryCode = (requestUrl.searchParams.get("country") || "").toUpperCase();
  const competitions = COUNTRY_COMPETITIONS[countryCode];
  const searchDays = parseSearchDays(requestUrl);
  const searchDaysNotice = formatDaysNotice(searchDays);

  if (!competitions) {
    json(response, 200, {
      matches: [],
      source: "football-data.org",
      message: "Este app esta configurado somente para jogos do Brasil.",
      supportedCountries: Object.keys(COUNTRY_COMPETITIONS).sort(),
    });
    return;
  }

  const now = new Date();
  const windowEnd = addDays(now, searchDays);
  const providerDateTo = dateKey(addDays(windowEnd, 1));
  const params = new URLSearchParams({
    competitions: competitions.join(","),
    dateFrom: dateKey(now),
    dateTo: providerDateTo,
    status: "SCHEDULED,TIMED,IN_PLAY,PAUSED",
  });

  const data = await footballDataRequest(`/matches?${params.toString()}`);
  const matches = (data.matches || [])
    .map(mapMatch)
    .filter((match) => {
      const kickoff = new Date(match.kickoff);
      return kickoff >= now && kickoff <= windowEnd;
    })
    .sort((a, b) => {
      const liveA = a.statusKey === "IN_PLAY" || a.statusKey === "PAUSED" ? -1 : 0;
      const liveB = b.statusKey === "IN_PLAY" || b.statusKey === "PAUSED" ? -1 : 0;
      return liveA - liveB || new Date(a.kickoff) - new Date(b.kickoff);
    });

  json(response, 200, {
    matches,
    source: "football-data.org",
    providerResultSet: data.resultSet,
    requestedCompetitions: competitions,
    window: {
      from: now.toISOString(),
      to: windowEnd.toISOString(),
      days: searchDays,
    },
    message:
      matches.length === 0
        ? `Nenhum jogo encontrado ${searchDaysNotice} para as competições monitoradas.`
        : "",
  });
}

async function getMatchDetail(matchId, response) {
  const data = await footballDataRequest(`/matches/${matchId}`);
  json(response, 200, {
    match: mapMatch(data),
    source: "football-data.org",
  });
}

function serveProductionAsset(requestUrl, response) {
  const dist = resolve(root, "dist");
  const pathname = decodeURIComponent(requestUrl.pathname);
  const filePath = pathname === "/" ? join(dist, "index.html") : join(dist, pathname);
  const safePath = resolve(filePath);
  const finalPath = safePath.startsWith(dist) && existsSync(safePath) ? safePath : join(dist, "index.html");
  const contentType =
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    }[extname(finalPath)] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  response.end(readFileSync(finalPath));
}

loadEnv();

export async function handleApiRequest(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (requestUrl.pathname === "/api/health") {
      json(response, 200, {
        provider: "football-data.org",
        hasToken: Boolean(process.env.FOOTBALL_DATA_TOKEN),
        poolStorage: isSupabaseConfigured() ? "supabase" : "memoria",
        hasSupabase: isSupabaseConfigured(),
        supportedCountries: Object.keys(COUNTRY_COMPETITIONS).sort(),
      });
      return true;
    }

    if (requestUrl.pathname === "/api/pools" && request.method === "POST") {
      const body = await readRequestBody(request);
      json(response, 201, await createPoolRecord(body));
      return true;
    }

    const poolMatch = requestUrl.pathname.match(/^\/api\/pools\/([^/]+)$/);
    if (poolMatch && request.method === "GET") {
      json(
        response,
        200,
        await fetchPoolBundle(decodeURIComponent(poolMatch[1]), requestUrl.searchParams.get("admin") || ""),
      );
      return true;
    }

    if (poolMatch && request.method === "PATCH") {
      const body = await readRequestBody(request);
      json(
        response,
        200,
        await updatePoolRecord(decodeURIComponent(poolMatch[1]), requestUrl.searchParams.get("admin") || "", body),
      );
      return true;
    }

    const participantCollectionMatch = requestUrl.pathname.match(/^\/api\/pools\/([^/]+)\/participants$/);
    if (participantCollectionMatch && request.method === "POST") {
      const body = await readRequestBody(request);
      json(response, 201, await addParticipantRecord(decodeURIComponent(participantCollectionMatch[1]), body));
      return true;
    }

    const participantMatch = requestUrl.pathname.match(/^\/api\/pools\/([^/]+)\/participants\/([^/]+)$/);
    if (participantMatch && request.method === "PATCH") {
      const body = await readRequestBody(request);
      json(
        response,
        200,
        await updateParticipantRecord(
          decodeURIComponent(participantMatch[1]),
          decodeURIComponent(participantMatch[2]),
          requestUrl.searchParams.get("admin") || "",
          body,
        ),
      );
      return true;
    }

    if (participantMatch && request.method === "DELETE") {
      json(
        response,
        200,
        await deleteParticipantRecord(
          decodeURIComponent(participantMatch[1]),
          decodeURIComponent(participantMatch[2]),
          requestUrl.searchParams.get("admin") || "",
        ),
      );
      return true;
    }

    if (requestUrl.pathname === "/api/matches") {
      await getMatches(requestUrl, response);
      return true;
    }

    const matchDetail = requestUrl.pathname.match(/^\/api\/matches\/([^/]+)$/);
    if (matchDetail) {
      await getMatchDetail(matchDetail[1], response);
      return true;
    }

    return false;
  } catch (error) {
    json(response, error.statusCode || 500, {
      code: error.code || "SERVER_ERROR",
      message: error.message || "Erro inesperado.",
      details: error.details,
    });
    return true;
  }
}

async function startLocalServer() {
  const { createServer: createViteServer } = isProduction ? { createServer: null } : await import("vite");
  const vite = isProduction
    ? null
    : await createViteServer({
        root,
        appType: "spa",
        server: { middlewareMode: true },
      });

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const apiHandled = await handleApiRequest(request, response);

    if (apiHandled) return;

    if (vite) {
      vite.middlewares(request, response);
      return;
    }

    serveProductionAsset(requestUrl, response);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Bolao Facil em http://127.0.0.1:${port}/`);
  });
}

const isCliEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
  startLocalServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
