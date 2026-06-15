# Bolão Fácil

App web para organizar bolões de futebol compartilháveis por código, com jogos importantes nos próximos 1, 3 ou 7 dias, apostas por placar, Pix copia e cola com QR Code, envio das informações ao apostador, histograma de palpites e acompanhamento de resultado.

## Rodar localmente

```bash
npm install
cp .env.example .env
# edite .env e coloque o token do football-data.org
# para compartilhamento real entre usuarios, configure tambem SUPABASE_URL e SUPABASE_SECRET_KEY
npm run dev
```

Abra `http://127.0.0.1:5173/`.

Sem `SUPABASE_URL` e uma chave server-side do Supabase, o servidor guarda os bolões apenas em memória enquanto estiver aberto. Para compartilhar bolões entre pessoas de verdade, configure o Supabase.

## Integrações reais

- O app usa `server.mjs` como proxy local para a API `football-data.org`.
- Configure `FOOTBALL_DATA_TOKEN` no arquivo `.env`. O token fica no servidor local e nao aparece no JavaScript do navegador.
- `GET /api/matches?country=BR&days=1|3|7` busca partidas na janela escolhida em competicoes monitoradas: Brasileirão Série A, Série B, Libertadores, Copa América, Eurocopa e Copa do Mundo.
- `GET /api/matches/:id` atualiza status, minuto e placar da partida selecionada.
- `POST /api/pools` cria um bolão compartilhável com código público e token secreto de coordenador.
- `GET /api/pools/:code` abre o bolão pelo código. Com `?admin=...`, abre em modo coordenador.
- `PATCH /api/pools/:code?admin=...` salva jogo escolhido, Pix, valor, janela e fechamento das apostas.
- `POST/PATCH/DELETE /api/pools/:code/participants` gerencia participantes e palpites.
- O arquivo `src/pix.js` gera o BR Code Pix estático com valor, chave, descrição da aposta e CRC16.
- O SQL inicial do Supabase está em `supabase/schema.sql`.
- Para produção, valide regras de Pix, limites de descrição e política do provedor de pagamento antes de receber valores reais.

## Publicar

### GitHub

1. Crie um repositório vazio chamado `bolao`.
2. Não adicione README, `.gitignore` ou licença pelo site, porque este projeto já tem esses arquivos.
3. No terminal da pasta do app:

```bash
git remote add origin https://github.com/SEU_USUARIO/bolao.git
git push -u origin main
```

### Supabase

1. Crie ou selecione um projeto no Supabase.
2. Abra o SQL Editor e rode o arquivo `supabase/schema.sql`.
3. Confirme que as tabelas `bolao_pools` e `bolao_participants` aparecem em Table Editor.
4. Em Project Settings > API Keys, copie:
   - Project URL
   - Secret key (`sb_secret_...`) ou, se estiver usando chaves legadas, `service_role`
5. Se seu projeto novo nao expuser tabelas public automaticamente pela Data API, abra Data API settings e inclua o schema `public`.
6. Configure no `.env` local e, depois, no provedor de hospedagem:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sua_sb_secret_key
# ou, com chave legada:
# SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

Depois de salvar o `.env`, reinicie o servidor local. A rota `GET /api/health` deve retornar `hasSupabase: true`.

### Vercel

O frontend Vite pode ser publicado pela Vercel a partir do GitHub. As rotas `/api/*` rodam pela Vercel Function `api/[...path].js`, reaproveitando a mesma lógica de `server.mjs`.

No painel da Vercel:

1. Importe o repositório `MSR-BR/bolao`.
2. Confira se o build command é `npm run build`.
3. Confira se o output directory é `dist`.
4. Configure as variáveis abaixo em Environment Variables.

Variáveis necessárias no projeto Vercel:

```bash
FOOTBALL_DATA_TOKEN=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
```

## Observacoes

- A cobertura depende das competicoes disponíveis no provedor escolhido.
- O Pix ainda nao confirma pagamento automaticamente; ele gera o QR Code/copia e cola e prepara o compartilhamento das informacoes para o apostador.
- Guarde o link de edição do organizador. O link de acompanhamento abre apenas o bolão para apostar e acompanhar.
