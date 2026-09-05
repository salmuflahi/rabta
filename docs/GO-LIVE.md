# Go live: the steps only the owner can do

Everything below needs an account that is yours, so none of it is automated.
None of it needs a phone: npm's second factor can be a passkey (Touch ID on
this Mac) instead of an app. The site itself deploys from GitHub Actions on
every push to `main`, with no account beyond GitHub and no secrets.

Work top to bottom. Each step says how to check it worked.

## 1. The MCP server on npm

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

## 2. The next app release

Agent access (Settings, Agents) is in the code but not in the 0.1.0 DMG
people download today. Cut the release the usual way (`docs/RELEASE.md`),
then bump `RELEASE.version`, `dmgUrl`, `dmgSizeLabel`, `dmgBytes` and
`sha256` in `site/src/config.ts`; the tests hold the site to those numbers.
