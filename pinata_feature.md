# Pin static build to IPFS and record a CID

Proposal for a future change. Not implemented yet.

On each production build, pin `dist/` to a pinning service from GitHub Actions, get a CID back, and keep that CID in a small receipt file next to the existing static zip.

## Why this is feasible

`.github/workflows/static-ipfs.yml` already:

- runs `npm run build` on `main`
- zips `dist/`
- uploads a workflow artifact
- attaches `theblocknote-static.zip` to the GitHub Release named `static`

It does not talk to IPFS yet.

The Vite build is already gateway-ready:

- `base: './'` so URLs work under `/ipfs/<cid>/`
- `vite-plugin-singlefile` inlines the app into `index.html`
- `crossorigin` is stripped from the HTML

Existing IPFS code in `services/immutables/publishImmutables.js` already posts a file with `PINATA_JWT` or `IPFS_API` and reads back a CID. That path is only used for `immutables.json`, not the site.

## What “automatic pinning” must do

1. Build `dist/`.
2. Hash the folder (or a CAR of it) → CID. This can happen in CI; no public Kubo node is required.
3. **Upload the bytes** to a pinning service so the CID stays online after the runner exits.
4. Write a receipt (`theblocknote-ipfs.json`) with `cid`, gateway URL, commit SHA, and timestamp.

A “pin this CID” request with no upload only works if some other node already has the data. A GitHub-hosted runner is gone when the job ends, so the workflow must upload files or a CAR, not only the hash.

Do **not** commit the CID back onto `main`. That retriggers the workflow. Attach the receipt to the `static` release (and as a workflow artifact) with `--clobber`.

## Recommended provider: Pinata

Pinata only needs a JWT in GitHub Actions secrets (`PINATA_JWT`). Upload `dist/` (folder) or a CAR; the JSON response includes `IpfsHash`, which is the CID:

```json
{
  "IpfsHash": "bafybei…",
  "PinSize": 123456,
  "Timestamp": "2026-09-07T00:00:00.000Z"
}
```

- Keep the JWT as a **repository secret**. Never prefix it with `VITE_` or ship it to the browser.
- A **folder** upload yields a **directory CID** (needed for `/ipfs/<cid>/` with `index.html`). Uploading only `index.html` yields a file CID.
- The pin counts against the Pinata plan.

The repo already uses this JWT pattern for immutables. Reuse the same secret if it is already set.

### Suggested receipt

```json
{
  "provider": "pinata",
  "cid": "bafybei…",
  "url": "https://dweb.link/ipfs/bafybei…",
  "pinataGateway": "https://gateway.pinata.cloud/ipfs/bafybei…",
  "commit": "96320ac",
  "publishedAt": "2026-09-07T04:00:00.000Z"
}
```

Default Kubo / IPIP-0499 CIDs are CIDv1 (`bafy…`). Older `Qm…` hashes are CIDv0 of the same idea; only force `unixfs-v0-2015` if something still requires `Qm…`.

## How to wire it into the existing workflow

After `npm run build` on `main` (not necessarily on PRs from forks, which cannot see secrets):

1. Optionally merkleize `dist` with [`ipshipyard/ipfs-deploy-action@v2`](https://docs.ipfs.tech/how-to/websites-on-ipfs/deploy-github-action/) so the CID is computed in CI (`cid` + `car-path` outputs).
2. Upload the folder or CAR to Pinata with `Authorization: Bearer ${{ secrets.PINATA_JWT }}`.
   - Legacy: `POST https://api.pinata.cloud/pinning/pinFileToIPFS` → `IpfsHash` (same as `publishImmutables.js`).
   - Current: Pinata V3 Files API, CAR upload with `car=true` ([recipe](https://github.com/ipshipyard/ipfs-deploy-action/blob/main/docs/recipes/pinata.md)).
3. Write `theblocknote-ipfs.json`.
4. `gh release upload static theblocknote-ipfs.json theblocknote-static.zip --clobber`.
5. Print the CID and gateway URL in `$GITHUB_STEP_SUMMARY`.

After a successful pin, the app should load at `https://dweb.link/ipfs/<cid>/` (or Pinata’s gateway).

`ipfs-deploy-action` can run **CAR-only** (no pin) if the JWT is missing, so PRs still get a CID for inspection while only `main` pins.

## Why not a public Kubo node

Kubo’s write API (`POST /api/v0/add`, port 5001) is localhost-only on purpose. An open add endpoint is admin-level access to that node (disk fill, often worse). Public IPFS infrastructure exposes **read gateways** (`/ipfs/<cid>`), not anonymous add.

Do not hunt for a public Kubo to upload to:

- Legitimate operators do not leave `/api/v0/add` open.
- An accidental open node may refuse the add, garbage-collect immediately, or be untrustworthy.
- The CID is only a content hash; you do not need a remote Kubo to compute it.

`IPFS_API=http://127.0.0.1:5001` in `.env.example` only works on a machine that actually runs Kubo. GitHub-hosted runners cannot reach a home node. A **self-hosted runner beside Kubo**, or a Kubo RPC URL with auth (`KUBO_API_URL` / `KUBO_API_AUTH`), would work — that is “our node,” not a public one.

Public gateways (`ipfs.io`, `dweb.link`) are for **fetching** a CID after something has pinned it.

## Other pinning providers

All of these can return a CID after an authenticated upload. None replace the need to upload bytes from CI.

| Provider | Secret | Notes |
|---|---|---|
| **Pinata** | JWT | Simplest for this repo; already sketched. |
| **Filebase** | S3 access key, secret, bucket | Official `ipfs-deploy-action` recipe; S3-shaped API. |
| **Lighthouse** | API key | REST upload; Filecoin-oriented “permanent” storage. |
| **4EVERLAND** | API or S3-style keys | Hosting plus IPFS; more product surface. |
| **Own Kubo / IPFS Cluster** | API URL + auth | Only if we operate the node or a runner next to it. |
| **Storacha / old Web3.Storage** | — | Shut down (April 2026). Do not use. |

Filebase is the next-best alternative if Pinata is unavailable. Pinata remains the default recommendation.

## Implementation checklist (when building this)

- [ ] Add `PINATA_JWT` as a GitHub Actions repository secret (reuse if already used for immutables).
- [ ] Extend `.github/workflows/static-ipfs.yml` after `npm run build`.
- [ ] Pin `dist/` (directory) or the CAR; do not pin a zip blob unless we also unpack it.
- [ ] Write `theblocknote-ipfs.json`; attach to the `static` release; do not commit it to `main`.
- [ ] Skip pin (or fail softly) when the secret is missing, so forks/PRs still build.
- [ ] Confirm `https://dweb.link/ipfs/<cid>/` serves the app (relative `base`, single-file HTML).
- [ ] Never expose Pinata/Kubo credentials to the client bundle.

## References

- Current workflow: `.github/workflows/static-ipfs.yml`
- Existing Pinata/Kubo helper: `services/immutables/publishImmutables.js`
- Env names: `.env.example` (`PINATA_JWT`, `IPFS_API`)
- Official CI guide: <https://docs.ipfs.tech/how-to/websites-on-ipfs/deploy-github-action/>
- Pinata CAR recipe: <https://github.com/ipshipyard/ipfs-deploy-action/blob/main/docs/recipes/pinata.md>
- Filebase recipe: <https://github.com/ipshipyard/ipfs-deploy-action/blob/main/docs/recipes/filebase.md>
