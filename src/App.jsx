import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  BarChart3,
  Check,
  Copy,
  CreditCard,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { fetchImportantMatches, fetchMatchStatus, formatKickoff } from "./footballApi";
import {
  addSharedParticipant,
  createSharedPool,
  deleteSharedParticipant,
  fetchSharedPool,
  normalizePoolCode,
  updateSharedParticipant,
  updateSharedPool,
} from "./poolApi";
import { buildPixPayload, formatCurrency } from "./pix";

const BRAZIL = { code: "BR", name: "Brasil" };
const SEARCH_WINDOWS = [
  { days: 1, label: "1 dia" },
  { days: 3, label: "3 dias" },
  { days: 7, label: "7 dias" },
];
const PAYMENT_FEATURE_VISIBLE = false;
const TERMS_UPDATED_AT = "junho de 2026";
const EMPTY_BET_FORM = { name: "", homeGoals: 0, awayGoals: 0 };

function scoreKey(homeGoals, awayGoals) {
  return `${homeGoals} x ${awayGoals}`;
}

function formatSearchDaysLabel(days) {
  return days === 1 ? "1 dia" : `${days} dias`;
}

function formatSearchDaysScope(days) {
  return days === 1 ? "o próximo 1 dia" : `os próximos ${days} dias`;
}

function formatSearchDaysNotice(days) {
  return days === 1 ? "no próximo 1 dia" : `nos próximos ${days} dias`;
}

function adminStorageKey(code) {
  return `bolao-facil-admin-${normalizePoolCode(code)}`;
}

function makePoolLink(code, adminToken = "") {
  if (!code) return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("bolao", normalizePoolCode(code));
  if (adminToken) url.searchParams.set("admin", adminToken);
  return url.toString();
}

function makeBetDescription(match, participant) {
  if (!match || !participant) return "Bolao de futebol";
  return `${participant.name}: ${match.home} ${participant.homeGoals}x${participant.awayGoals} ${match.away}`;
}

function liveMatchSignature(match) {
  if (!match) return "";
  const minute = Number.isFinite(Number(match.minute)) ? Number(match.minute) : "";
  return [
    match.id || match.providerId || "",
    match.statusKey || "",
    Number(match.homeGoals || 0),
    Number(match.awayGoals || 0),
    minute,
    match.isFinished ? "finished" : "",
  ].join("|");
}

function dataUrlToFile(dataUrl, filename) {
  const [header, content] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], filename, { type: mime });
}

function useNow() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function LegalFooter({ onOpen }) {
  return (
    <footer className="legal-footer" aria-label="Termos e privacidade">
      <button className="legal-link" type="button" onClick={onOpen}>
        Termos de uso e privacidade
      </button>
      <span>Uso privado. Apenas gestão de palpites.</span>
    </footer>
  );
}

function LegalModal({ onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="terms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="terms-header">
          <div>
            <p className="eyebrow">Aviso legal</p>
            <h2 id="terms-title">Termos de uso e privacidade</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar termos">
            <X size={18} />
          </button>
        </header>

        <div className="terms-body">
          <p className="terms-meta">Atualizado em {TERMS_UPDATED_AT}. Este texto é informativo e não substitui orientação jurídica, contábil, tributária, regulatória ou financeira.</p>

          <div className="terms-alert">
            <strong>Use somente se tiver certeza de que o seu uso é permitido.</strong>
            <p>
              O Bolão Fácil é apenas uma ferramenta tecnológica para organizar palpites entre pessoas conhecidas.
              Ele não autoriza, licencia, regulariza nem torna lícita qualquer atividade que dependa de autorização
              pública, análise jurídica ou cumprimento de regras específicas.
            </p>
          </div>

          <section className="terms-section">
            <h3>Natureza do aplicativo</h3>
            <ul>
              <li>O app não é casa de apostas, loteria, rifa, sorteio, promoção comercial, cassino, jogo online, bolsa de apostas, instituição financeira, instituição de pagamento, carteira digital, escrow, meio de cobrança ou serviço de distribuição de prêmios.</li>
              <li>O app não define odds, cotas, probabilidades, banca, margem, comissão, taxa de administração, lucro da casa ou qualquer remuneração pela participação.</li>
              <li>A versão atual do app não apresenta recursos de pagamento, cobrança, confirmação de pagamento, QR Code Pix, cópia e cola Pix ou divisão de valores.</li>
              <li>O app não recebe, capta, guarda, retém, movimenta, compensa, garante, audita, confirma, fiscaliza, reparte ou paga valores. Qualquer acerto externo entre pessoas é responsabilidade exclusiva delas e não é gerenciado pelo app.</li>
            </ul>
          </section>

          <section className="terms-section">
            <h3>Responsabilidade do coordenador e dos participantes</h3>
            <ul>
              <li>O coordenador do bolão é o único responsável por verificar se pode criar, divulgar e conduzir qualquer dinâmica do grupo. O app não administra pagamentos, prêmios, repasses ou cobranças.</li>
              <li>Participantes devem conferir jogo, placar e regras combinadas fora do app. Qualquer pagamento, se existir por decisão externa do grupo, ocorre fora do Bolão Fácil.</li>
              <li>Não use o app com menores de idade, público indeterminado, publicidade, patrocínio, comissão, lucro, habitualidade, escala comercial, promessa de rentabilidade, vantagem econômica organizada ou qualquer situação que possa exigir autorização, registro, licença, contabilidade formal ou análise regulatória.</li>
              <li>Se houver dúvida sobre palpites esportivos, apostas esportivas, prêmios, sorteios, promoções, jogos, tributação, direito do consumidor, LGPD ou qualquer obrigação legal, não use até obter orientação profissional e, se aplicável, autorização do órgão competente.</li>
            </ul>
          </section>

          <section className="terms-section">
            <h3>Regulação e cautela</h3>
            <p>
              No Brasil, apostas de quota fixa, promoções comerciais, sorteios, loterias, prêmios e atividades próximas podem
              estar sujeitas a regras e fiscalização de autoridades competentes, incluindo a Secretaria de Prêmios e
              Apostas do Ministério da Fazenda. O Bolão Fácil não é autorização governamental e não deve ser usado para
              contornar exigências legais.
            </p>
            <div className="terms-links">
              <a href="https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas" target="_blank" rel="noreferrer">
                Secretaria de Prêmios e Apostas
              </a>
              <a href="https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14790.htm" target="_blank" rel="noreferrer">
                Lei 14.790/2023
              </a>
            </div>
          </section>

          <section className="terms-section">
            <h3>Dados, privacidade e segurança</h3>
            <ul>
              <li>Para funcionar, o app pode armazenar dados do bolão, como código compartilhado, jogo escolhido, nomes ou apelidos dos participantes, palpites, dados de acompanhamento do jogo e credenciais técnicas de administração.</li>
              <li>Use apelidos quando possível e evite inserir CPF, telefone, endereço, documentos, dados bancários, informações sensíveis ou qualquer dado que não seja indispensável.</li>
              <li>Dados podem ser processados por serviços técnicos usados pelo app, como hospedagem, banco de dados, APIs de futebol, navegador e armazenamento local do aparelho. Links compartilhados podem permitir acesso às informações do bolão por qualquer pessoa que receba o link.</li>
              <li>O link de administração deve ser tratado como senha. Quem tiver esse link pode alterar dados do bolão. Não envie esse link para participantes se a intenção for apenas acompanhar.</li>
              <li>Nenhum sistema é imune a falhas, indisponibilidade, atraso, perda de dados, erro humano, acesso indevido ou mudança de regra de terceiros. Mantenha registros próprios se a organização do grupo depender disso.</li>
            </ul>
          </section>

          <section className="terms-section">
            <h3>Dados esportivos e resultado</h3>
            <p>
              Jogos, horários, placares e status vêm de API externa e podem ter atraso, erro, indisponibilidade,
              alteração posterior ou cobertura limitada. O app não garante tempo real perfeito nem valida oficialmente
              resultado, súmula, punições, W.O., cancelamentos, prorrogação ou critérios especiais definidos pelo grupo.
            </p>
          </section>

          <section className="terms-section">
            <h3>Aceite</h3>
            <p>
              Ao usar o Bolão Fácil, você declara que leu estes termos, entende as limitações do app e assume a
              responsabilidade pelo uso. Se não concordar, se o uso envolver risco regulatório ou se você não tiver
              certeza sobre a legalidade, não use o aplicativo.
            </p>
          </section>
        </div>

        <footer className="terms-actions">
          <button className="primary-action" type="button" onClick={onClose}>
            Entendi
          </button>
        </footer>
      </section>
    </div>
  );
}

function App() {
  const now = useNow();
  const lastSavedLiveSignatureRef = useRef("");
  const [poolCode, setPoolCode] = useState("");
  const [entryCode, setEntryCode] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [poolNotice, setPoolNotice] = useState("");
  const [shareCopied, setShareCopied] = useState("");
  const [initialPoolChecked, setInitialPoolChecked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  const [matchesNotice, setMatchesNotice] = useState("");
  const [matchSource, setMatchSource] = useState("");
  const [searchDays, setSearchDays] = useState(7);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedMatchData, setSelectedMatchData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [form, setForm] = useState(EMPTY_BET_FORM);
  const [participantSaving, setParticipantSaving] = useState(false);
  const [betValue, setBetValue] = useState(20);
  const [pixKey, setPixKey] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [pixPayload, setPixPayload] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [pixSendStatus, setPixSendStatus] = useState("");
  const [betsClosed, setBetsClosed] = useState(false);
  const [liveMatch, setLiveMatch] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [tracking, setTracking] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  const selectedMatch = useMemo(
    () => selectedMatchData || matches.find((match) => match.id === selectedMatchId) || null,
    [matches, selectedMatchData, selectedMatchId],
  );

  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.id === selectedParticipantId) || participants[0],
    [participants, selectedParticipantId],
  );

  const histogram = useMemo(() => {
    const counts = participants.reduce((accumulator, participant) => {
      const key = scoreKey(participant.homeGoals, participant.awayGoals);
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score));
  }, [participants]);

  const totalPool = useMemo(() => Number(betValue || 0) * participants.length, [betValue, participants.length]);
  const maxHistogramCount = Math.max(...histogram.map((item) => item.count), 1);
  const currentLive = liveMatch || selectedMatch || {
    homeGoals: 0,
    awayGoals: 0,
    statusLabel: "Pré-jogo",
    statusKey: "SCHEDULED",
    minute: null,
  };
  const matchFinished = currentLive.statusKey === "FINISHED" || currentLive.isFinished;

  const winners = useMemo(() => {
    if (!matchFinished) return [];
    return participants.filter(
      (participant) =>
        participant.homeGoals === Number(currentLive.homeGoals || 0) &&
        participant.awayGoals === Number(currentLive.awayGoals || 0),
    );
  }, [currentLive, matchFinished, participants]);

  const searchWindowLabel = formatSearchDaysLabel(searchDays);
  const searchWindowScope = formatSearchDaysScope(searchDays);
  const searchWindowNotice = formatSearchDaysNotice(searchDays);
  const windowEnd = new Date(now.getTime() + searchDays * 24 * 60 * 60 * 1000);
  const homeTeamLabel = selectedMatch?.home || "Time 1";
  const awayTeamLabel = selectedMatch?.away || "Time 2";
  const participantLink = poolCode ? makePoolLink(poolCode) : "";
  const coordinatorLink = poolCode && adminToken ? makePoolLink(poolCode, adminToken) : "";

  function resetPoolState(options = {}) {
    const hasEntryCode = Object.hasOwn(options, "entryCode");

    setPoolCode("");
    setAdminToken("");
    setIsCoordinator(false);
    setParticipants([]);
    setSelectedMatchId("");
    setSelectedMatchData(null);
    setLiveMatch(null);
    setBetsClosed(false);
    setTracking(false);
    setSelectedParticipantId("");
    setForm(EMPTY_BET_FORM);
    setParticipantSaving(false);
    setPixPayload("");
    setQrCodeUrl("");
    setCopied(false);
    setPixSendStatus("");
    setPoolNotice("");
    setPoolError("");
    setShareCopied("");
    setMatches([]);
    setMatchesLoading(false);
    setMatchesError("");
    setMatchesNotice("");
    setMatchSource("");
    lastSavedLiveSignatureRef.current = "";

    if (hasEntryCode) setEntryCode(options.entryCode);
  }

  function applyPoolBundle(bundle, token = "", options = {}) {
    const nextPool = bundle.pool;
    const nextCode = nextPool.code;
    const nextAdminToken = token || (options.preserveAccess ? adminToken : "");
    const preserveAccess = Boolean(options.preserveAccess);

    setPoolCode(nextCode);
    setSearchDays(nextPool.searchDays || 7);
    setSelectedMatchId(nextPool.selectedMatchId || nextPool.selectedMatch?.id || "");
    setSelectedMatchData(nextPool.selectedMatch || null);
    setBetsClosed(Boolean(nextPool.betsClosed));
    setBetValue(Number(nextPool.betValue || 0));
    setPixKey(nextPool.pixKey || "");
    setMerchantName(nextPool.merchantName || "");
    const nextLiveMatch = nextPool.liveMatch || nextPool.selectedMatch || null;
    setParticipants(bundle.participants || []);
    setLiveMatch(nextLiveMatch);
    lastSavedLiveSignatureRef.current = liveMatchSignature(nextLiveMatch);
    if (!preserveAccess) {
      const nextIsCoordinator = Boolean(bundle.isCoordinator);
      setIsCoordinator(nextIsCoordinator);

      if (!nextIsCoordinator) setAdminToken("");
    }
    setPoolError("");

    if (!preserveAccess && nextAdminToken && bundle.isCoordinator) {
      setAdminToken(nextAdminToken);
      window.localStorage.setItem(adminStorageKey(nextCode), nextAdminToken);
    }
  }

  async function loadPool(code, token = "", options = {}) {
    const normalizedCode = normalizePoolCode(code);
    if (!normalizedCode) return;
    const currentCode = normalizePoolCode(poolCode);
    const isDifferentPool = Boolean(currentCode && currentCode !== normalizedCode);
    const shouldClearBeforeLoad = Boolean(options.clearBeforeLoad || isDifferentPool);
    const shouldClearOnError = Boolean(options.clearOnError || shouldClearBeforeLoad);

    if (shouldClearBeforeLoad) {
      resetPoolState({ entryCode: normalizedCode });
    }

    setPoolLoading(true);
    setPoolError("");
    setPoolNotice("");

    try {
      const storedAdminToken = token || window.localStorage.getItem(adminStorageKey(normalizedCode)) || "";
      const bundle = await fetchSharedPool(normalizedCode, storedAdminToken);
      applyPoolBundle(bundle, storedAdminToken);
      setEntryCode(normalizedCode);

      const nextUrl = makePoolLink(normalizedCode, bundle.isCoordinator ? storedAdminToken : "");
      window.history.replaceState(null, "", nextUrl);
    } catch (error) {
      if (shouldClearOnError) {
        resetPoolState({ entryCode: normalizedCode });
      }
      setPoolError(error.message);
    } finally {
      setPoolLoading(false);
      setInitialPoolChecked(true);
    }
  }

  async function createNewPool() {
    setPoolLoading(true);
    setPoolError("");
    setPoolNotice("");

    try {
      const bundle = await createSharedPool({ title: "Bolão Fácil", searchDays, betValue });
      applyPoolBundle(bundle, bundle.adminToken);
      const nextUrl = makePoolLink(bundle.pool.code, bundle.adminToken);
      window.history.replaceState(null, "", nextUrl);
      setPoolNotice("Bolão criado.");
    } catch (error) {
      setPoolError(error.message);
    } finally {
      setPoolLoading(false);
      setInitialPoolChecked(true);
    }
  }

  function joinPool(event) {
    event.preventDefault();
    loadPool(entryCode, "", { clearOnError: true });
  }

  function leavePool() {
    resetPoolState();
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function copyShareLink(link, kind) {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setShareCopied(kind);
    window.setTimeout(() => setShareCopied(""), 1600);
  }

  async function shareParticipantLink() {
    if (!participantLink) return;
    const text = `Bolão Fácil\nCódigo: ${poolCode}\nAcompanhar: ${participantLink}`;

    if (navigator.share) {
      await navigator.share({ title: "Bolão Fácil", text, url: participantLink });
      return;
    }

    await copyShareLink(text, "participante");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("bolao") || params.get("code") || "";
    const adminFromUrl = params.get("admin") || "";

    if (codeFromUrl) {
      loadPool(codeFromUrl, adminFromUrl, { clearOnError: true });
    } else {
      setInitialPoolChecked(true);
    }
    // Only run on first load. loadPool is intentionally a function declaration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialPoolChecked || !poolCode || !isCoordinator || selectedMatchId) {
      setMatches([]);
      setMatchesLoading(false);
      setMatchesError("");
      setMatchesNotice("");
      setMatchSource("");
      return undefined;
    }

    let canceled = false;
    setMatchesLoading(true);
    setMatches([]);
    setMatchesError("");
    setMatchesNotice("");
    setMatchSource("");

    fetchImportantMatches(BRAZIL, searchDays)
      .then((data) => {
        if (canceled) return;
        const nextMatches = data.matches || [];
        setMatches(nextMatches);
        setMatchesNotice(data.message || "");
        setMatchSource(data.source || "");
      })
      .catch((error) => {
        if (canceled) return;
        setMatchesError(error.message);
      })
      .finally(() => {
        if (!canceled) setMatchesLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [initialPoolChecked, isCoordinator, poolCode, reloadKey, searchDays, selectedMatchId]);

  const refreshLiveMatch = useCallback(async () => {
    if (!selectedMatch) return;

    setLiveLoading(true);
    try {
      const nextLiveMatch = await fetchMatchStatus(selectedMatch.id);
      const nextLiveSignature = liveMatchSignature(nextLiveMatch);
      setLiveMatch(nextLiveMatch);
      setLiveError("");
      if (poolCode && isCoordinator && nextLiveSignature !== lastSavedLiveSignatureRef.current) {
        lastSavedLiveSignatureRef.current = nextLiveSignature;
        updateSharedPool(poolCode, adminToken, { liveMatch: nextLiveMatch }).catch(() => {});
      }
      if (nextLiveMatch.isFinished) setTracking(false);
    } catch (error) {
      setLiveError(error.message);
    } finally {
      setLiveLoading(false);
    }
  }, [adminToken, isCoordinator, poolCode, selectedMatch]);

  useEffect(() => {
    if (!tracking || !selectedMatch || matchFinished) return undefined;

    refreshLiveMatch();
    const interval = window.setInterval(refreshLiveMatch, 60_000);

    return () => window.clearInterval(interval);
  }, [matchFinished, refreshLiveMatch, selectedMatch, tracking]);

  useEffect(() => {
    if (!legalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setLegalOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("modal-open");

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [legalOpen]);

  useEffect(() => {
    if (participants.length === 0) {
      setSelectedParticipantId("");
      return;
    }

    if (!participants.some((participant) => participant.id === selectedParticipantId)) {
      setSelectedParticipantId(participants[0].id);
    }
  }, [participants, selectedParticipantId]);

  useEffect(() => {
    if (!PAYMENT_FEATURE_VISIBLE) return undefined;

    const description = makeBetDescription(selectedMatch, selectedParticipant);
    const cleanPixKey = pixKey.trim();
    const cleanMerchantName = merchantName.trim();

    if (!cleanPixKey || !cleanMerchantName) {
      setPixPayload("");
      setQrCodeUrl("");
      setCopied(false);
      setPixSendStatus("");
      return;
    }

    const payload = buildPixPayload({
      pixKey: cleanPixKey,
      amount: betValue,
      merchantName: cleanMerchantName,
      merchantCity: "SAO PAULO",
      description,
      txid: `BOLAO${selectedParticipant?.id?.replace(/\W/g, "").slice(-10) || "PIX"}`,
    });

    setPixPayload(payload);
    setCopied(false);
    setPixSendStatus("");

    if (!payload) {
      setQrCodeUrl("");
      return;
    }

    QRCode.toDataURL(payload, { margin: 1, width: 232, errorCorrectionLevel: "M" })
      .then((url) => setQrCodeUrl(url))
      .catch(() => setQrCodeUrl(""));
  }, [betValue, merchantName, pixKey, selectedMatch, selectedParticipant]);

  async function savePoolPatch(patch, successMessage = "Bolão atualizado.") {
    if (!poolCode || !isCoordinator) return null;

    setPoolError("");
    try {
      const bundle = await updateSharedPool(poolCode, adminToken, patch);
      applyPoolBundle(bundle, adminToken, { preserveAccess: true });
      setPoolNotice(successMessage);
      window.setTimeout(() => setPoolNotice(""), 1800);
      return bundle;
    } catch (error) {
      setPoolError(error.message);
      return null;
    }
  }

  function handleSearchDaysChange(days) {
    setSearchDays(days);
    if (poolCode && isCoordinator) {
      savePoolPatch({ searchDays: days }, "Janela de busca salva.");
    }
  }

  async function savePaymentSettings() {
    await savePoolPatch(
      {
        betValue: Number(betValue || 0),
        pixKey,
        merchantName,
      },
      "Dados do Pix salvos no bolão.",
    );
  }

  async function addParticipant(event) {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName || !poolCode || !selectedMatch || betsClosed || participantSaving) return;

    const participant = {
      name: trimmedName,
      homeGoals: Number(form.homeGoals),
      awayGoals: Number(form.awayGoals),
    };

    setPoolError("");
    setParticipantSaving(true);
    try {
      const bundle = await addSharedParticipant(poolCode, participant);
      const addedParticipant =
        bundle.participants?.find((item) => item.name === participant.name) || bundle.participants?.at(-1);
      applyPoolBundle(bundle, adminToken, { preserveAccess: true });
      setSelectedParticipantId(addedParticipant?.id || "");
      setForm(EMPTY_BET_FORM);
    } catch (error) {
      setPoolError(error.message);
    } finally {
      setParticipantSaving(false);
    }
  }

  function updateParticipant(id, patch, sync = true) {
    setParticipants((current) =>
      current.map((participant) => (participant.id === id ? { ...participant, ...patch } : participant)),
    );

    if (!sync || !poolCode) return;

    updateSharedParticipant(poolCode, id, adminToken, patch)
      .then((bundle) => applyPoolBundle(bundle, adminToken, { preserveAccess: true }))
      .catch((error) => setPoolError(error.message));
  }

  async function saveParticipantName(id) {
    const participant = participants.find((item) => item.id === id);
    if (!participant || !poolCode) return;

    try {
      const bundle = await updateSharedParticipant(poolCode, id, adminToken, { name: participant.name });
      applyPoolBundle(bundle, adminToken, { preserveAccess: true });
    } catch (error) {
      setPoolError(error.message);
    }
  }

  async function saveParticipantScore(id, patch = {}) {
    const participant = participants.find((item) => item.id === id);
    if (!participant || !poolCode) return;

    try {
      const bundle = await updateSharedParticipant(poolCode, id, adminToken, {
        homeGoals: Number(Object.hasOwn(patch, "homeGoals") ? patch.homeGoals : participant.homeGoals || 0),
        awayGoals: Number(Object.hasOwn(patch, "awayGoals") ? patch.awayGoals : participant.awayGoals || 0),
      });
      applyPoolBundle(bundle, adminToken, { preserveAccess: true });
    } catch (error) {
      setPoolError(error.message);
    }
  }

  function blurOnEnter(event) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  async function removeParticipant(id) {
    if (!poolCode) return;

    setPoolError("");
    try {
      const bundle = await deleteSharedParticipant(poolCode, id, adminToken);
      applyPoolBundle(bundle, adminToken, { preserveAccess: true });
      if (selectedParticipantId === id) {
        setSelectedParticipantId(bundle.participants?.[0]?.id || "");
      }
    } catch (error) {
      setPoolError(error.message);
    }
  }

  function selectMatch(match) {
    if (!isCoordinator) return;
    setSelectedMatchId(match.id);
    setSelectedMatchData(match);
    setLiveMatch(match);
    setLiveError("");
    setBetsClosed(false);
    setTracking(false);
    savePoolPatch(
      {
        selectedMatchId: match.id,
        selectedMatch: match,
        liveMatch: match,
        betsClosed: false,
      },
      "Jogo salvo no bolão.",
    );
  }

  function clearMatchSelection() {
    if (!isCoordinator) return;
    setSelectedMatchId("");
    setSelectedMatchData(null);
    setLiveMatch(null);
    setLiveError("");
    setBetsClosed(false);
    setTracking(false);
    savePoolPatch(
      {
        selectedMatchId: null,
        selectedMatch: null,
        liveMatch: null,
        betsClosed: false,
      },
      "Escolha do jogo anulada.",
    );
  }

  function closeBets() {
    if (!isCoordinator) return;
    setBetsClosed(true);
    setTracking(false);
    setLiveMatch(selectedMatch);
    savePoolPatch({ betsClosed: true, liveMatch: selectedMatch }, "Palpites fechados.");
  }

  async function copyPixPayload() {
    if (!pixPayload) return;
    await navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function makePixShareText() {
    const participant = selectedParticipant || {};
    return [
      "Bolão Fácil",
      selectedMatch ? `Jogo: ${selectedMatch.home} x ${selectedMatch.away}` : "",
      participant.name
        ? `Aposta de ${participant.name}: ${participant.homeGoals} x ${participant.awayGoals}`
        : "",
      `Valor: ${formatCurrency(betValue)}`,
      `Recebedor: ${merchantName.trim()}`,
      `Chave Pix: ${pixKey.trim()}`,
      poolCode ? `Código do bolão: ${poolCode}` : "",
      participantLink ? `Acompanhe o bolão: ${participantLink}` : "",
      "",
      "Pix copia e cola:",
      pixPayload,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function sendPixInfo() {
    if (!pixPayload) return;

    const text = makePixShareText();

    try {
      if (navigator.share) {
        const files = qrCodeUrl ? [dataUrlToFile(qrCodeUrl, "qrcode-pix-bolao-facil.png")] : [];
        const shareData =
          files.length > 0 && navigator.canShare?.({ files })
            ? { title: "Pix do Bolão Fácil", text, files }
            : { title: "Pix do Bolão Fácil", text };

        await navigator.share(shareData);
        setPixSendStatus("Pix e link enviados.");
        return;
      }

      await navigator.clipboard.writeText(text);
      setPixSendStatus("Pix e link copiados para enviar.");
    } catch (error) {
      if (error.name === "AbortError") return;
      await navigator.clipboard.writeText(text);
      setPixSendStatus("Pix e link copiados para enviar.");
    }
  }

  if (!initialPoolChecked) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bolão de futebol</p>
            <h1>Bolão Fácil</h1>
          </div>
        </header>
        <section className="panel loading-panel">
          <div className="loading-bar" />
          <p>Carregando bolão...</p>
        </section>
        <LegalFooter onOpen={() => setLegalOpen(true)} />
        {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
      </main>
    );
  }

  if (!poolCode) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bolão de futebol</p>
            <h1>Bolão Fácil</h1>
          </div>
        </header>

        <section className="entry-grid">
          <div className="panel entry-panel">
            <p className="eyebrow">Organizar</p>
            <h2>Bolão novo</h2>
            <div className="window-picker entry-window-picker" aria-label="Janela inicial de busca">
              <span>Buscar jogos em</span>
              <div className="segmented-control">
                {SEARCH_WINDOWS.map((option) => (
                  <button
                    type="button"
                    key={option.days}
                    className={option.days === searchDays ? "active" : ""}
                    onClick={() => setSearchDays(option.days)}
                    aria-pressed={option.days === searchDays}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="primary-action" type="button" onClick={createNewPool} disabled={poolLoading}>
              <Plus size={18} />
              {poolLoading ? "Criando" : "Criar bolão"}
            </button>
          </div>

          <form className="panel entry-panel" onSubmit={joinPool}>
            <p className="eyebrow">Entrar</p>
            <h2>Entrar com código</h2>
            <label>
              Código do bolão
              <input
                value={entryCode}
                onChange={(event) => setEntryCode(event.target.value)}
                placeholder="BOLAO-8K4P"
              />
            </label>
            <button className="secondary-action" type="submit" disabled={poolLoading || !entryCode.trim()}>
              Entrar no bolão
            </button>
          </form>
        </section>

        {poolError && <div className="notice error entry-notice">{poolError}</div>}
        <LegalFooter onOpen={() => setLegalOpen(true)} />
        {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bolão de futebol</p>
          <h1>Bolão Fácil</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => loadPool(poolCode, adminToken)} aria-label="Atualizar bolão">
            <RefreshCw size={18} />
          </button>
          <button className="icon-button" type="button" onClick={leavePool} aria-label="Sair do bolão">
            <X size={18} />
          </button>
        </div>
      </header>

      {(poolError || poolNotice) && (
        <div className={`notice ${poolError ? "error" : ""}`}>{poolError || poolNotice}</div>
      )}

      <section className="summary-strip" aria-label="Resumo do bolão">
        <div>
          <span>Janela</span>
          <strong>{searchWindowLabel}</strong>
        </div>
        <div>
          <span>Participantes</span>
          <strong>{participants.length}</strong>
        </div>
        {PAYMENT_FEATURE_VISIBLE && (
          <div>
            <span>Valor total</span>
            <strong>{formatCurrency(totalPool)}</strong>
          </div>
        )}
        <div>
          <span>Status</span>
          <strong>{betsClosed ? "Palpites fechados" : "Aberto"}</strong>
        </div>
      </section>

      <div className="layout-grid">
        <section className="panel match-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Próximos {searchWindowLabel}</p>
              <h2>Jogos importantes</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              disabled={matchesLoading}
              aria-label="Atualizar jogos"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <p className="time-window">
            Janela: agora até{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(windowEnd)}
            .
          </p>

          <div className="window-picker" aria-label="Janela de busca">
            <span>Buscar em</span>
            <div className="segmented-control">
              {SEARCH_WINDOWS.map((option) => (
                <button
                  type="button"
                  key={option.days}
                  className={option.days === searchDays ? "active" : ""}
                  onClick={() => handleSearchDaysChange(option.days)}
                  aria-pressed={option.days === searchDays}
                  disabled={!isCoordinator}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {matchSource && (
            <p className="source-pill">
              Dados reais via {matchSource}. A lista considera apenas {searchWindowScope}.
            </p>
          )}

          {matchesLoading && <div className="loading-bar" />}
          {matchesError && <div className="notice error">{matchesError}</div>}
          {!matchesError && matchesNotice && <div className="notice">{matchesNotice}</div>}
          {!matchesLoading && !matchesError && matches.length === 0 && !matchesNotice && (
            <div className="notice">Nenhum jogo encontrado {searchWindowNotice}.</div>
          )}

          {selectedMatch ? (
            <div className="chosen-match">
              <div className="match-row selected">
                <div>
                  <strong>
                    {selectedMatch.home} x {selectedMatch.away}
                  </strong>
                  <span>
                    {selectedMatch.competition} · {selectedMatch.importance}
                    {selectedMatch.statusLabel ? ` · ${selectedMatch.statusLabel}` : ""}
                  </span>
                </div>
                <time>{formatKickoff(selectedMatch.kickoff)}</time>
              </div>
              {isCoordinator && (
                <button className="secondary-action clear-match-button" type="button" onClick={clearMatchSelection}>
                  <X size={18} />
                  Anular escolha
                </button>
              )}
            </div>
          ) : !isCoordinator ? (
            <div className="notice">Aguardando quem criou o bolão escolher o jogo.</div>
          ) : (
            <div className="match-list">
              {matches.map((match) => (
                <button type="button" key={match.id} className="match-row" onClick={() => selectMatch(match)}>
                  <div>
                    <strong>
                      {match.home} x {match.away}
                    </strong>
                    <span>
                      {match.competition} · {match.importance}
                      {match.statusLabel ? ` · ${match.statusLabel}` : ""}
                    </span>
                  </div>
                  <time>{formatKickoff(match.kickoff)}</time>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Palpitar</p>
              <h2>Participantes e placares</h2>
            </div>
            <Users size={22} />
          </div>

          <form className="bet-form" onSubmit={addParticipant}>
            <label>
              Nome
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Participante"
                disabled={participantSaving || betsClosed || !selectedMatch}
              />
            </label>
            <label>
              <span className="team-label-text">{homeTeamLabel}</span>
              <input
                type="number"
                min="0"
                max="20"
                placeholder="0"
                value={form.homeGoals}
                onChange={(event) => setForm((current) => ({ ...current, homeGoals: event.target.value }))}
                disabled={participantSaving || betsClosed || !selectedMatch}
              />
            </label>
            <label>
              <span className="team-label-text">{awayTeamLabel}</span>
              <input
                type="number"
                min="0"
                max="20"
                placeholder="0"
                value={form.awayGoals}
                onChange={(event) => setForm((current) => ({ ...current, awayGoals: event.target.value }))}
                disabled={participantSaving || betsClosed || !selectedMatch}
              />
            </label>
            <button className="icon-action" type="submit" disabled={participantSaving || betsClosed || !selectedMatch}>
              <Plus size={18} />
              {participantSaving ? "Adicionando..." : "Adicionar"}
            </button>
          </form>

          <button
            className="close-bets-button inline-close-button"
            type="button"
            onClick={closeBets}
            disabled={!isCoordinator || !selectedMatch || betsClosed || participants.length === 0}
          >
            <Lock size={18} />
            Fechar palpites
          </button>

          <div
            className={`participants-table ${PAYMENT_FEATURE_VISIBLE ? "" : "palpites-only"}`}
            role="table"
            aria-label="Participantes"
          >
            <div className="table-head" role="row">
              <span>Nome</span>
              <span>Placar</span>
              {PAYMENT_FEATURE_VISIBLE && <span>Pago</span>}
              <span />
            </div>
            {participants.map((participant) => (
              <div className="table-row" role="row" key={participant.id}>
                <input
                  value={participant.name}
                  onChange={(event) => updateParticipant(participant.id, { name: event.target.value }, false)}
                  onBlur={() => saveParticipantName(participant.id)}
                  disabled={betsClosed}
                  aria-label={`Nome de ${participant.name}`}
                />
                <div className="score-inputs">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="0"
                    value={participant.homeGoals}
                    onChange={(event) =>
                      updateParticipant(participant.id, { homeGoals: Number(event.target.value) }, false)
                    }
                    onBlur={(event) => saveParticipantScore(participant.id, { homeGoals: event.target.value })}
                    onKeyDown={blurOnEnter}
                    disabled={betsClosed}
                    aria-label={`Gols do mandante para ${participant.name}`}
                  />
                  <span>x</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="0"
                    value={participant.awayGoals}
                    onChange={(event) =>
                      updateParticipant(participant.id, { awayGoals: Number(event.target.value) }, false)
                    }
                    onBlur={(event) => saveParticipantScore(participant.id, { awayGoals: event.target.value })}
                    onKeyDown={blurOnEnter}
                    disabled={betsClosed}
                    aria-label={`Gols do visitante para ${participant.name}`}
                  />
                </div>
                {PAYMENT_FEATURE_VISIBLE && (
                  <label className="paid-toggle">
                    <input
                      type="checkbox"
                      checked={participant.paid}
                      onChange={(event) => updateParticipant(participant.id, { paid: event.target.checked })}
                      disabled={!isCoordinator}
                    />
                    <span />
                  </label>
                )}
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => removeParticipant(participant.id)}
                  disabled={betsClosed || participants.length <= 1}
                  aria-label={`Remover ${participant.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {PAYMENT_FEATURE_VISIBLE && (
          <section className="panel payment-panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">Pagamento</p>
                <h2>Pix com QR Code</h2>
              </div>
              <CreditCard size={22} />
            </div>

            <div className="payment-grid">
              <label>
                Valor por aposta
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={betValue}
                  onChange={(event) => setBetValue(event.target.value)}
                  disabled={!isCoordinator}
                />
              </label>
              <label>
                Participante
                <select
                  value={selectedParticipantId}
                  onChange={(event) => setSelectedParticipantId(event.target.value)}
                >
                  {participants.length === 0 && <option value="">Sem participantes</option>}
                  {participants.map((participant) => (
                    <option value={participant.id} key={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-field">
                Chave Pix
                <input
                  value={pixKey}
                  onChange={(event) => setPixKey(event.target.value)}
                  placeholder="Inclua chave Pix"
                  disabled={!isCoordinator}
                />
              </label>
              <label className="full-field">
                Recebedor
                <input
                  value={merchantName}
                  onChange={(event) => setMerchantName(event.target.value)}
                  placeholder="Titular da conta Pix"
                  disabled={!isCoordinator}
                />
              </label>
            </div>

            {isCoordinator && (
              <button className="secondary-action save-payment-button" type="button" onClick={savePaymentSettings}>
                <Check size={18} />
                Salvar Pix no bolão
              </button>
            )}

            <div className="qr-area">
              <div className="qr-box">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code Pix" />
                ) : (
                  <div className="qr-placeholder">
                    <QrCode size={40} />
                    <span>Informe chave Pix e recebedor</span>
                  </div>
                )}
              </div>
              <div className="pix-details">
                <span>Valor</span>
                <strong>{formatCurrency(betValue)}</strong>
                <span>Aposta</span>
                <strong>{makeBetDescription(selectedMatch, selectedParticipant)}</strong>
                <div className="pix-actions">
                  <button className="secondary-action" type="button" onClick={copyPixPayload} disabled={!pixPayload}>
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? "Copiado" : "Copiar Pix"}
                  </button>
                  <button className="primary-action" type="button" onClick={sendPixInfo} disabled={!pixPayload}>
                    <Send size={18} />
                    Enviar Pix e link
                  </button>
                </div>
                {pixPayload && (
                  <details className="pix-code">
                    <summary>Pix copia e cola</summary>
                    <code>{pixPayload}</code>
                  </details>
                )}
                {pixSendStatus && <p className="send-status">{pixSendStatus}</p>}
              </div>
            </div>
          </section>
        )}

        <section className="panel share-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Compartilhar</p>
              <h2>Código e acesso</h2>
            </div>
            <Send size={22} />
          </div>
          <div className="pool-access">
            <div className="pool-code-card">
              <span>Código do bolão</span>
              <strong>{poolCode}</strong>
            </div>
            <div className="pool-access-actions">
              <button className="secondary-action" type="button" onClick={shareParticipantLink}>
                <Send size={18} />
                Enviar link para acompanhar
              </button>
              {isCoordinator && (
                <details className="organizer-access">
                  <summary>Meu acesso para editar este bolão</summary>
                  <p>Guarde este link para voltar depois e mudar o jogo, editar participantes ou fechar palpites.</p>
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => copyShareLink(coordinatorLink, "organizador")}
                  >
                    <Lock size={18} />
                    {shareCopied === "organizador" ? "Copiado" : "Copiar meu link de edição"}
                  </button>
                </details>
              )}
            </div>
          </div>
        </section>

        <section className="panel close-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Fechamento</p>
              <h2>Histograma e resultado</h2>
            </div>
            <BarChart3 size={22} />
          </div>

          <div className="histogram-wrap">
            <div className="histogram-table">
              <div className="table-head">
                <span>Placar</span>
                <span>Palpites</span>
              </div>
              {histogram.map((item) => (
                <div className="histogram-row" key={item.score}>
                  <span>{item.score}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>

            <div className="bars" aria-label="Histograma de placares">
              {histogram.map((item) => (
                <div className="bar-line" key={item.score}>
                  <span>{item.score}</span>
                  <div>
                    <i style={{ width: `${Math.max(10, (item.count / maxHistogramCount) * 100)}%` }} />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel live-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Ao vivo</p>
              <h2>Acompanhamento do jogo</h2>
            </div>
            <Timer size={22} />
          </div>

          <div className="scoreboard">
            <span>{selectedMatch?.home || "Mandante"}</span>
            <strong>
              {Number(currentLive.homeGoals || 0)} x {Number(currentLive.awayGoals || 0)}
            </strong>
            <span>{selectedMatch?.away || "Visitante"}</span>
          </div>

          <div className="live-meta">
            <span>{currentLive.statusLabel || "Pré-jogo"}</span>
            <span>{Number.isFinite(currentLive.minute) ? `${currentLive.minute}'` : "API"}</span>
          </div>

          <p className="api-disclaimer">
            Dados por {matchSource || "football-data.org"}. As atualizações de placar podem ter atraso de alguns
            minutos.
          </p>

          {liveError && <div className="notice error">{liveError}</div>}

          <div className="live-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => setTracking((current) => !current)}
              disabled={!isCoordinator || !betsClosed || !selectedMatch || liveLoading || matchFinished}
            >
              <Timer size={18} />
              {tracking ? "Pausar" : liveLoading ? "Atualizando" : "Acompanhar"}
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={refreshLiveMatch}
              disabled={!isCoordinator || !betsClosed || !selectedMatch || liveLoading || matchFinished}
            >
              {liveLoading ? "Atualizando" : "Atualizar agora"}
            </button>
          </div>

          <div className="winner-box">
            <div>
              <Trophy size={22} />
              <strong>{matchFinished ? "Resultado final" : "Vencedores"}</strong>
            </div>
            {!matchFinished && <p>Feche os palpites e acompanhe o placar real da API para identificar vencedores.</p>}
            {matchFinished && winners.length > 0 && (
              <p>{winners.map((winner) => winner.name).join(", ")} acertaram o placar exato.</p>
            )}
            {matchFinished && winners.length === 0 && (
              <p>Ninguém acertou o placar exato.</p>
            )}
          </div>
        </section>
      </div>
      <LegalFooter onOpen={() => setLegalOpen(true)} />
      {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
    </main>
  );
}

export default App;
