#!/usr/bin/env bash
# Root-owned forced SSH endpoint. Deploy both frontends from one immutable commit.
set -Eeuo pipefail
umask 077
command=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$command" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  echo "Only 'deploy <40-character commit SHA>' is permitted." >&2; exit 2
fi
sha=${BASH_REMATCH[1]}
exec 9>/run/privatevip-deploy.lock
flock -w 1200 9
exec > >(tee -a /var/log/vision-frontends-deploy.log) 2>&1
repo=/opt/pos-normal-user-interface
private_compose=/etc/privatevip/compose.yml
yankin_compose=/etc/yankinfoodhouse/compose.yml
private_image="vision-pos-web:$sha"
yankin_image="yankinfoodhouse-web:$sha"
cd "$repo"
git fetch --no-tags origin main
if [[ "$(git rev-parse origin/main)" != "$sha" ]]; then
  echo "Skipping superseded commit $sha; only the current main tip is deployed."; exit 0
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'Refusing to overwrite tracked changes in server checkout.' >&2; exit 1
fi
context=$(mktemp -d /opt/vision-frontends-build.XXXXXX)
trap 'rm -rf "$context"' EXIT
git archive "$sha" | tar -x -C "$context"
# Build BOTH targets before replacing either running container.
docker build --build-arg VITE_API_URL=https://apivision.winterarc.asia \
 --label "org.opencontainers.image.revision=$sha" -t "$private_image" "$context"
docker build --build-arg VITE_API_URL=https://api1.mmlnkits.com \
 --label "org.opencontainers.image.revision=$sha" -t "$yankin_image" "$context"
# Validate each compiled bundle's intended backend before rollout.
docker run --rm --entrypoint sh "$private_image" -c 'grep -rq "https://apivision.winterarc.asia" /usr/share/nginx/html/assets'
docker run --rm --entrypoint sh "$yankin_image" -c 'grep -rq "https://api1.mmlnkits.com" /usr/share/nginx/html/assets'
previous_private=$(docker inspect vision-pos-web --format '{{.Image}}')
previous_yankin=$(docker inspect yankinfoodhouse-web --format '{{.Image}}')
rollback_private="vision-pos-web:rollback-$(date +%s)"
rollback_yankin="yankinfoodhouse-web:rollback-$(date +%s)"
docker tag "$previous_private" "$rollback_private"
docker tag "$previous_yankin" "$rollback_yankin"
was_managed=false
[[ ! -f /etc/yankinfoodhouse/managed-mode ]] || was_managed=true
activate_private() {
 APP_IMAGE="$1" docker compose -p pos-normal-user-interface -f "$private_compose" up \
  -d --no-build --pull never --wait --wait-timeout 120
}
activate_yankin() {
 APP_IMAGE="$1" docker compose --env-file /etc/yankinfoodhouse/release.env \
  -p yankinfoodhouse-frontend -f "$yankin_compose" up \
  -d --no-build --pull never --wait --wait-timeout 120
}
verify_site() {
 local domain="$1" port="$2"
 curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \
  --max-time 10 "http://127.0.0.1:$port/healthz"
 curl --fail --silent --show-error --max-time 15 --resolve "$domain:443:127.0.0.1" "https://$domain/healthz"
 curl --fail --silent --show-error --max-time 15 --output /dev/null \
  --resolve "$domain:443:127.0.0.1" "https://$domain/login"
}
rollback() {
 local rc=$?
 trap - ERR INT TERM
 set +e
 echo 'Frontend rollout failed; restoring BOTH previous containers.' >&2
 activate_private "$rollback_private"
 if [[ "$was_managed" == true ]]; then
  activate_yankin "$rollback_yankin"
 else
  # Initial conversion: restore the original host-networked Yankin container.
  docker compose -p yankinfoodhouse-frontend -f /opt/yankinfoodhouse-frontend/compose.yankin.yml \
   up -d --no-build --pull never --wait --wait-timeout 120
 fi
 verify_site privatevip.mmlnkits.com 8080
 verify_site app.mmlnkits.com 8081
 exit "$rc"
}
trap rollback ERR INT TERM
activate_private "$private_image"
verify_site privatevip.mmlnkits.com 8080
activate_yankin "$yankin_image"
verify_site app.mmlnkits.com 8081
# Fail and roll back both sites unless the running images match this release.
verify_revision() {
 local container="$1" image_id revision
 image_id=$(docker inspect "$container" --format '{{.Image}}')
 revision=$(docker image inspect "$image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
 if [[ "$revision" != "$sha" ]]; then
  echo "Commit mismatch: $container expected=$sha actual=$revision" >&2
  return 1
 fi
}
verify_revision vision-pos-web
verify_revision yankinfoodhouse-web
# Backend and uploads are NOT changed by frontend deployments.
docker tag "$private_image" vision-pos-web:latest
docker tag "$yankin_image" yankinfoodhouse-web:latest
git merge --ff-only "$sha"
printf '%s\n' "$sha" > /etc/privatevip/deployed-sha
printf '%s\n' "$sha" > /etc/yankinfoodhouse/deployed-sha
printf 'APP_IMAGE=%s\n' "$yankin_image" > /etc/yankinfoodhouse/release.env.tmp
mv /etc/yankinfoodhouse/release.env.tmp /etc/yankinfoodhouse/release.env
touch /etc/yankinfoodhouse/managed-mode
trap - ERR INT TERM
echo "DUAL_FRONTEND_DEPLOY_SUCCESS commit=$sha privatevip=$private_image yankin=$yankin_image"
