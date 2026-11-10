# PrivateVIP CI/CD

## Active dual-site deployment

PrivateVIP (`privatevip.mmlnkits.com`) and App (`app.mmlnkits.com`) deploy
the same triggering source SHA. App retains `https://api1.mmlnkits.com` as
its backend; PrivateVIP retains `https://apivision.winterarc.asia`.
The retired `yankinfoodhouse.mmlnkits.com` domain must never be probed.

`scripts/deploy-both-production.sh` is the reviewed copy of the actual installed
`/usr/local/sbin/privatevip-deploy` command. It builds both images before rollout,
checks both sites, checks both running image revision labels against the requested
SHA, and rolls both containers back on activation/probe/revision failure.
Legacy App container/image/config names still contain `yankinfoodhouse`; do not
rename them or replace the site's backend during a frontend deployment.
The older `scripts/deploy-production.sh` is a PrivateVIP-only reference, not the
installed dual-site command. Repository edits do not automatically install either
script on the server.

The workflow in `.github/workflows/deploy.yml` runs CI for pull requests to
`main`, and CI plus deployment for pushes to `main`. It can also be started
manually from the GitHub Actions tab (select `main`). Other branches never deploy.

## Required repository Actions secrets

- `DEPLOY_SSH_KEY`: dedicated PEM-format SSH private key.
- `DEPLOY_KNOWN_HOSTS`: verified SSH host-key entry for `118.27.147.101`.

Neither secret belongs in the repository. The server authorizes the deployment
key with a forced command and disables shell access, port forwarding, and PTYs.
The deployment command runs as root, so protect access to these secrets and
review changes to `main`, especially the Dockerfile and workflow.

## Pipeline

1. Validate Compose and Bash syntax and run the required sandboxed deployment
   tests. Compile with the Dockerfile's Node 24 build stage using SHA-pinned Docker
   Buildx actions and persistent GitHub Actions layer caches. Build-stage,
   PrivateVIP runtime and App runtime caches have separate scopes.
2. Run the repository test suite. **Tests are currently advisory** because the
   baseline has a cashier table-state failure and two Burmese locale failures.
   Failures produce a workflow warning and summary. Remove `continue-on-error`
   once the baseline is fixed to make tests a required deployment gate.
3. Build both site-specific runtime images, including Nginx configuration
   validation. Start each with the default VPS ceilings (0.5 CPU / 128 MB RAM),
   wait for container health, check the SPA login route and precompressed assets.
4. SSH to the server and request deployment of the triggering commit SHA.
5. The server only accepts the current `main` tip. It reuses an existing commit
   image or an image with the same build-input fingerprint; otherwise it builds
   an isolated source archive using BuildKit caches. It starts the image with
   Docker health checks. Concurrent deployments are serialized with `flock`.
6. Local HTTP/TLS probes verify the new release. Failed activation/probes restore
   the previous image and fail the deployment. GitHub verifies public HTTPS too.

This is a single-container replacement, so a brief interruption is possible.
The server rebuilds the validated commit rather than pulling from a registry.
Images are tagged by commit and the previous image is retained as
`vision-pos-web:rollback`. A retry with unchanged image contents does not overwrite
that rollback. After successful health checks, old generated commit and timestamp
rollback tags in this repository are removed without `--force`; images used by
other containers and manually named tags are protected. No global image/cache
prune runs. BuildKit cache is separate: monitor `docker system df` and configure
builder garbage collection to match the server disk budget.

The build fingerprint includes tracked Dockerfile inputs and the build-time API
origin. Keep its file list aligned with Dockerfile `COPY` instructions. When
reusing an image for a docs-only commit, its OCI revision remains the original
build commit; the deployed commit tag and `deployed-sha` record the requested
release. To deliberately refresh base images for unchanged inputs, perform a
reviewed manual `docker build --pull` with the desired tag rather than relying
on an automatic deployment retry to rebuild it.

## Server configuration

### Local deployment-flow validation

```bash
node --test scripts/deploy-production.test.cjs
```

Requires Bash (Git for Windows Bash is used on Windows). These tests sandbox the
script with mocked Git/Docker/network commands, covering image reuse, first
deployment, failed builds, rollback, and scoped cleanup. They do not replace a
real Docker build and container health check.

### Installed production configuration

- Repository: `/opt/pos-normal-user-interface`
- Administrator-owned deployment command: `/usr/local/sbin/privatevip-deploy`
- Administrator-owned Compose file: `/etc/privatevip/compose.yml`
- Last deployed SHA: `/etc/privatevip/deployed-sha`
- Internal port: `127.0.0.1:8080`
- Frontend: `https://privatevip.mmlnkits.com`
- Backend: `https://apivision.winterarc.asia`

The deployment command is copied from `scripts/deploy-production.sh` by an
administrator. Workflow changes do not automatically replace that trusted command
or the server-owned Compose file. Reinstall explicitly after reviewing changes.
Nginx, Certbot, and their certificates are not changed during application deploys.

**Rollout requirement:** these repository edits do not change a running VPS.
Review and reinstall the trusted deployment command before expecting
image reuse/retention changes. The checked-in script and workflow target only
PrivateVIP and App using the dual-site command described above. Yankin's old
domain is retired: do not probe it in this pipeline.
Inspect the installed forced SSH command for legacy dual-site logic before
replacing it; its actual configuration is not present in this checkout.
Merge the runtime limits
and Nginx tuning into the relevant server-owned configuration as appropriate.
Do not replace `/etc/privatevip/compose.yml` blindly: retain its site-specific
ports/environment, `${APP_IMAGE}` selection, and any additional frontend services.

## Check and manually restore a release

```bash
cat /etc/privatevip/deployed-sha
docker inspect vision-pos-web --format '{{.Config.Image}} {{.State.Health.Status}}'
docker logs --tail 100 vision-pos-web
docker image ls vision-pos-web

# Choose an existing commit or rollback image tag from the image list:
APP_IMAGE=vision-pos-web:<selected-tag> docker compose \
  -p pos-normal-user-interface -f /etc/privatevip/compose.yml \
  up -d --no-build --pull never --wait --wait-timeout 120
```

After a manual rollback, align `vision-pos-web:latest` and the server checkout
before using the repository's original Compose file for manual deployment.