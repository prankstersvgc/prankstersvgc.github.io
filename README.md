# Site do Team Pranksters

Site do time de Pokémon VGC Pranksters: feed de notícias, liga semanal (rodando na loja
**Muito!**) e torneios da região. Feito pra substituir a planilha.

**Stack**: [Astro](https://astro.build) + React (ilhas) + Tailwind CSS, hospedado de graça no
GitHub Pages, com [Supabase](https://supabase.com) (Postgres + Auth + Storage, plano free) como
banco de dados.

## Como funciona

- As páginas públicas (`/`, `/liga`, `/torneios`) são estáticas e buscam os dados direto do
  Supabase quando alguém abre a página — não precisa de rebuild do site toda vez que alguém
  lança um resultado ou publica uma notícia.
- A home (`/`) é o feed de notícias — mostra as 5 mais recentes, com botão "carregar mais" pras
  antigas. Uma notícia pode ter foto de capa e uma tabela de resultados avulsa (pra eventos que
  não são rodada da liga, tipo um Challenge).
- `/admin` é a área de login. Só funciona para contas criadas manualmente no Supabase (vocês 4).
- `/admin/dashboard` tem os formulários pra lançar rodada da liga, notícia e torneio.

> **Já tinha o site rodando e só quer pegar as novidades (notícias + link de paste)?** Pula pra
> [Mudanças no banco (migrations)](#mudanças-no-banco-migrations) — é só `make db-push`.

## Mudanças no banco (migrations)

O schema do banco vive em `supabase/migrations/` (um arquivo `.sql` por mudança, nessa ordem,
nunca edita um antigo) e é aplicado com a [CLI do Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started)
(já vem instalada como dependência do projeto — não precisa instalar nada globalmente).

**Configuração única** (uma vez por pessoa/máquina):

Precisa de um `.env` com pelo menos a `PUBLIC_SUPABASE_URL` preenchida (`cp .env.example .env`,
a URL fica em **Project Settings > API** do seu projeto Supabase) — é dali que o `make db-link`
descobre qual projeto ligar, sem precisar digitar nada.

```sh
npx supabase login          # abre o navegador pra autenticar
make db-link                 # liga essa pasta ao projeto Supabase de vocês
```

**Aplicar as migrations** (sempre que `supabase/migrations/` tiver arquivo novo — inclusive
agora, na primeira vez):

```sh
make db-push
```

Vai pedir a senha do banco (a que você gerou lá na criação do projeto Supabase). Ele só roda o
que ainda não rodou — seguro de repetir sempre que quiser.

**Criar uma mudança nova** (quando o site precisar de uma tabela/coluna nova):

```sh
make migration name=nome-curto-da-mudanca
```

Isso cria um arquivo vazio em `supabase/migrations/` com timestamp — escreve o SQL nele, dá
`make db-push` de novo, e commita o arquivo no git junto com o resto do site.

## Passo a passo pra colocar no ar

### 1. Criar o projeto no Supabase (grátis)

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto (escolha uma região
   perto do Brasil, ex: São Paulo). Guarde a senha do banco que você definir aqui — vai precisar
   dela no passo de migrations.
2. Siga [Mudanças no banco (migrations)](#mudanças-no-banco-migrations) pra aplicar o schema
   (tabelas, view de classificação, permissões, bucket de fotos).
3. Vá em **Project Settings > API** e copie a **Project URL** e a **anon public key**.
4. Vá em **Authentication > Users** e crie manualmente uma conta (e-mail + senha) pra cada um dos
   4 membros do time que vai atualizar o site. Não existe cadastro público no site — só vocês
   entram. Dica: pode criar com uma senha qualquer e pedir pra pessoa entrar em `/admin` >
   "Esqueci minha senha" antes do primeiro login — ela define a própria senha por e-mail sem
   nunca precisar saber a temporária.
5. Vá em **Authentication > URL Configuration** e configure:
   - **Site URL**: `https://prankstersvgc.github.io`
   - **Redirect URLs**: adicione `https://prankstersvgc.github.io/admin/redefinir-senha`, e também
     a versão local `http://localhost:4321/admin/redefinir-senha` (pra conseguir testar o
     "esqueci minha senha" rodando local).

   Sem isso o link de redefinição de senha do e-mail não funciona (o Supabase recusa redirecionar
   pra uma URL que não está nessa lista).

### 2. Configurar as variáveis de ambiente localmente

```sh
cp .env.example .env
```

Preencha `.env` com a URL e a anon key copiadas no passo anterior.

### 3. Rodar localmente

```sh
npm install
npm run dev
```

Abre em `http://localhost:4321/`.

### 4. Criar a organização e o repositório no GitHub

O site usa uma **organização do GitHub** chamada `prankstersvgc` (não uma conta pessoal), pra
ficar com a URL limpa (`prankstersvgc.github.io`) e pros 4 administrarem juntos sem senha
compartilhada:

1. No GitHub, crie uma **Organization** chamada `prankstersvgc` (grátis). Sua conta vira Owner.
2. Convide os outros 3 membros pra organização (Settings > People > Invite member).
3. Dentro da organização, crie um repositório chamado **exatamente** `prankstersvgc.github.io`
   (pode ser público).

```sh
git init
git add .
git commit -m "Site inicial do Team Pranksters"
git remote add origin https://github.com/prankstersvgc/prankstersvgc.github.io.git
git push -u origin main
```

### 5. Ativar o GitHub Pages

Em **Settings > Pages** do repositório, em "Build and deployment", escolha **GitHub Actions**
(o workflow já está em `.github/workflows/deploy.yml`, ele builda e publica sozinho a cada push
na branch `main`). O `astro.config.mjs` já está configurado pra essa URL
(`site: 'https://prankstersvgc.github.io'`, sem caminho base).

Se precisarem trocar de nome de organização/repositório no futuro, é só ajustar o `site` no
`astro.config.mjs` de acordo (e adicionar `base: '/nome-do-repo'` se o repositório não se chamar
`<nome>.github.io`).

### 6. Configurar os secrets do build

Em **Settings > Secrets and variables > Actions**, adicione dois secrets (mesmos valores do seu
`.env`):

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Sem isso o site builda, mas as páginas mostram "sem conexão com o banco".

### 7. Pronto

Todo push na branch `main` builda e publica automaticamente. As atualizações de dados (resultado
da rodada, notícia, torneio) não precisam de novo deploy — aparecem na hora, direto do Supabase.

## Comandos

| Comando                    | Ação                                                           |
| -------------------------- | --------------------------------------------------------------- |
| `make up`                  | Instala dependências (se preciso) e sobe o site em background   |
| `make down`                | Derruba o servidor local                                        |
| `make status`              | Mostra se o servidor tá rodando                                 |
| `make logs`                | Acompanha os logs ao vivo                                       |
| `make build`                | Builda o site estático em `./dist/`                             |
| `make preview`              | Builda e serve a versão de produção localmente                  |
| `make db-link`              | Liga a pasta ao projeto Supabase (uma vez por máquina)           |
| `make db-push`              | Aplica as migrations pendentes no banco                          |
| `make migration name=algo`  | Cria um arquivo novo de migration                                |

(equivalentes em `npm`: `npm install`, `npm run dev`, `npm run build`, `npm run preview`)

## Domínio próprio (no futuro)

Quando quiserem sair do `github.io`, é só comprar um domínio (ex: `.com.br` ou `.gg`), configurar
um CNAME em **Settings > Pages** e adicionar um DNS `CNAME` apontando pro `<seu-usuario>.github.io`.
Nenhuma outra mudança de código é necessária.
