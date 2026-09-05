# Go live: the steps only the owner can do

Everything below needs an account that is yours, so none of it is automated.
None of it needs a phone: Cloudflare signs up with email and password, the
counter's dashboard logs in with a one-time code sent to your email, and npm's
second factor can be a passkey (Touch ID on this Mac) instead of an app.

Work top to bottom. Each step says how to check it worked.

## 1. The counter (Cloudflare Workers + D1)

From `workers/count/`:

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create count
```

Paste the printed `database_id` over `REPLACE_AFTER_wrangler_d1_create` in
`workers/count/wrangler.jsonc`, then:

```bash
pnpm exec wrangler d1 migrations apply count --remote
pnpm exec wrangler secret put STATS_TOKEN      # any long random string; keep it
pnpm exec wrangler deploy
```

The deploy prints a `https://rabta-count.<something>.workers.dev` address.
Until the domain moves (step 2), put that address in `COUNT_ORIGIN` in
`site/src/config.ts`, run `pnpm test:site`, and commit.

Check: open the site, then
`curl -H "Authorization: Bearer <STATS_TOKEN>" https://<worker>/stats.json`
shows one view.

## 2. The domain (Porkbun to Cloudflare, DNS only)

1. In Cloudflare, Add a site: `rabta.build`, Free plan. It imports the
   current records; keep the four `A` records to GitHub Pages and the `www`
   CNAME, and set each of them to **DNS only** (grey cloud), or GitHub's
   certificate stops working.
2. At Porkbun, replace the nameservers with the two Cloudflare gives you.
   Wait for Cloudflare to say Active (minutes to a day).
3. Check `https://rabta.build` still loads with a valid certificate.
4. In the Worker: Settings, Domains and Routes, add the custom domain
   `count.rabta.build`. Set `COUNT_ORIGIN` back to
   `https://count.rabta.build`, run `pnpm test:site`, commit.
5. Zero Trust, Access, Applications, Add, Self-hosted: domain
   `count.rabta.build`, path `stats`, policy Allow with your email, login
   method One-time PIN. Copy the application's Audience tag and your team
   name into `ACCESS_AUD` and `ACCESS_TEAM` in `wrangler.jsonc`, redeploy.

Check: `https://count.rabta.build/stats` asks for a code by email, then
shows the dashboard. A browser with Global Privacy Control on adds nothing.

## 3. Deploys from GitHub

Repository Settings, Secrets and variables, Actions:

- Secrets: `CLOUDFLARE_API_TOKEN` (an API token with Workers Scripts: Edit,
  D1: Edit, Account Settings: Read) and `CLOUDFLARE_ACCOUNT_ID`.
- Variables: `COUNT_DEPLOY = true`.

Check: a push touching `workers/count/` runs `.github/workflows/count.yml`
through to a deploy. The site deploys on every push to `main` through
`.github/workflows/pages.yml` with no secrets at all.

## 4. The MCP server on npm

1. Create the npm account with your email; for the second factor choose a
   security key and use Touch ID.
2. Add Organization, name `rabta`, Unlimited public packages (free).
3. Tag and push:

   ```bash
   git tag mcp-v0.1.0 && git push origin mcp-v0.1.0
   ```

   For the very first publish the workflow needs a granular access token in a
   repository secret named `NPM_TOKEN` (create it at npmjs.com, Access Tokens,
   Granular, publish permission on `@rabta/*`). After the package exists,
   open it on npmjs.com, Settings, Publishing access, add a trusted publisher
   for `salmuflahi/rabta` and workflow `publish-mcp.yml`, then delete the
   `NPM_TOKEN` secret. Every later tag publishes with nothing to rotate.
4. When `npm view @rabta/mcp version` prints `0.1.0`, set `MCP_PUBLISHED` to
   `true` in `site/src/config.ts`, run `pnpm test:site`, commit. The site
   stops saying "ships with the next release".

Check: on a Mac with Rabta installed,
`claude mcp add rabta -- npx -y @rabta/mcp` then ask for a capsule briefing.

## 5. The next app release

Agent access (Settings, Agents) is in the code but not in the 0.1.0 DMG
people download today. Cut the release the usual way (`docs/RELEASE.md`),
then bump `RELEASE.version`, `dmgUrl`, `dmgSizeLabel`, `dmgBytes` and
`sha256` in `site/src/config.ts`; the tests hold the site to those numbers.
