// Run with: node --test scripts/deploy-production.test.cjs
// These are shell-flow tests with mocked Git/Docker/network commands. No daemon,
// production filesystem, SSH credentials, or live server is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : 'bash';
const sha = 'a'.repeat(40);
const oldSha = 'b'.repeat(40);
const source = readFileSync(path.join(__dirname, 'deploy-production.sh'), 'utf8');

test('production workflow verifies both active sites, never the retired domain', () => {
  const workflow = readFileSync(path.join(__dirname, '../.github/workflows/deploy.yml'), 'utf8');
  assert.doesNotMatch(workflow, /yankinfoodhouse\.mmlnkits\.com/i);
  assert.match(workflow, /https:\/\/app\.mmlnkits\.com\/healthz/);
  assert.match(workflow, /https:\/\/app\.mmlnkits\.com\/login/);
  assert.match(workflow, /https:\/\/privatevip\.mmlnkits\.com\/healthz/);
  assert.match(workflow, /https:\/\/privatevip\.mmlnkits\.com\/login/);
  assert.match(workflow, /needs: ci/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
});

test('installed dual-site command verifies both running revisions before recording success', () => {
  const dual = readFileSync(path.join(__dirname, 'deploy-both-production.sh'), 'utf8');
  assert.match(dual, /verify_site app\.mmlnkits\.com 8081/);
  assert.match(dual, /verify_revision vision-pos-web/);
  assert.match(dual, /verify_revision yankinfoodhouse-web/);
  assert.match(dual, /"\$revision" != "\$sha"/);
  assert.ok(dual.indexOf('verify_revision yankinfoodhouse-web') < dual.indexOf('> /etc/privatevip/deployed-sha'));
});

function runDeployment(scenario, command = `deploy ${sha}`) {
  const directory = mkdtempSync(path.join(tmpdir(), 'vision-deploy-test-'));
  const shellDirectory = directory.replaceAll('\\', '/');
  const sandboxed = source
    .replaceAll('/run/privatevip-deploy.lock', `${shellDirectory}/deploy.lock`)
    .replaceAll('/opt/pos-normal-user-interface', shellDirectory)
    .replaceAll('/opt/privatevip-build.XXXXXX', `${shellDirectory}/build.XXXXXX`)
    .replaceAll('/etc/privatevip/deployed-sha', `${shellDirectory}/deployed-sha`);
  const mocks = String.raw`
set -euo pipefail
log() { printf '%s\n' "$*" >> "$TEST_ROOT/calls"; }
flock() { log flock "$@"; }
git() {
  log git "$@"
  case "$1" in
    rev-parse) printf '%s\n' "$TEST_SHA" ;;
    ls-tree) printf 'tracked build inputs\n' ;;
    hash-object) cat > /dev/null; printf 'input-fingerprint\n' ;;
    archive) printf 'archive\n' ;;
  esac
}
tar() { cat > /dev/null; log tar "$@"; }
curl() { log curl "$@"; }
docker() {
  log docker "$@"
  if [[ "$1" == inspect ]]; then
    if [[ "$SCENARIO" == first ]]; then return 1; fi
    if [[ "$SCENARIO" == repeated ]]; then
      printf 'sha256:target\n'
    else
      printf 'sha256:previous\n'
    fi
  elif [[ "$1 $2" == 'image inspect' ]]; then
    case "$3" in
      "vision-pos-web:$TEST_SHA")
        if [[ "$#" == 3 && "$SCENARIO" != repeated ]]; then return 1; fi
        printf 'sha256:target\n'
        ;;
      vision-pos-web:rollback) printf 'sha256:superseded\n' ;;
      sha256:superseded)
        if [[ "$SCENARIO" == tagged ]]; then
          printf '["vision-pos-web:manual"]\n'
        else
          printf '[]\n'
        fi
        ;;
    esac
  elif [[ "$1 $2" == 'image ls' ]]; then
    if [[ "$3" == --filter ]]; then
      if [[ "$SCENARIO" == cached ]]; then printf 'cached-image\n'; fi
    else
      printf '%s\n' "$TEST_SHA" "$TEST_OLD_SHA" rollback-123 latest rollback manual
    fi
  elif [[ "$1" == build && "$SCENARIO" == build-failure ]]; then
    return 1
  elif [[ "$1" == compose ]]; then
    log activate "$APP_IMAGE"
    if [[ "$SCENARIO" == rollback && ! -e "$TEST_ROOT/activation-failed" ]]; then
      touch "$TEST_ROOT/activation-failed"
      return 1
    fi
  elif [[ "$1 $2" == 'image rm' && "$SCENARIO" == in-use ]]; then
    return 1
  fi
  return 0
}
`;
  try {
    const script = path.join(directory, 'deploy.sh');
    writeFileSync(script, `${mocks}\n${sandboxed}`);
    let status = 0;
    try {
      execFileSync(bash, [script.replaceAll('\\', '/')], {
        env: {
          ...process.env,
          TEST_ROOT: shellDirectory,
          TEST_SHA: sha,
          TEST_OLD_SHA: oldSha,
          SSH_ORIGINAL_COMMAND: command,
          SCENARIO: scenario,
        },
        stdio: 'pipe',
      });
    } catch (error) {
      if (typeof error.status !== 'number') throw error;
      status = error.status;
    }
    return {
      status,
      calls: existsSync(path.join(directory, 'calls'))
        ? readFileSync(path.join(directory, 'calls'), 'utf8') : '',
      deployed: existsSync(path.join(directory, 'deployed-sha')),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('repeated deployment reuses the image and preserves the existing rollback', () => {
  const result = runDeployment('repeated');
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.calls, /docker build /);
  assert.doesNotMatch(result.calls, /docker tag sha256:target vision-pos-web:rollback/);
  assert.match(result.calls, /--no-build --pull never --wait/);
  assert.equal(result.deployed, true);
});

test('unchanged build inputs reuse an image without creating a build archive', () => {
  const result = runDeployment('cached');
  assert.equal(result.status, 0);
  assert.match(result.calls, new RegExp(`docker tag cached-image vision-pos-web:${sha}`));
  assert.doesNotMatch(result.calls, /docker build |git archive /);
});

test('new inputs build once, retain one rollback, and retire only generated tags', () => {
  const result = runDeployment('new');
  assert.equal(result.status, 0);
  assert.equal(result.calls.split('\n').filter(line => line.startsWith('docker build ')).length, 1);
  assert.match(result.calls, /com\.vision-pos\.build-inputs=input-fingerprint/);
  assert.match(result.calls, /docker tag sha256:previous vision-pos-web:rollback/);
  assert.match(result.calls, new RegExp(`docker image rm vision-pos-web:${oldSha}`));
  assert.match(result.calls, /docker image rm vision-pos-web:rollback-123/);
  assert.match(result.calls, /docker image rm sha256:superseded/);
  assert.doesNotMatch(result.calls, /docker image rm vision-pos-web:(latest|rollback\n|manual)/);
  assert.doesNotMatch(result.calls, /--force|prune/);
});

test('superseded rollback images with operator tags are preserved', () => {
  const result = runDeployment('tagged');
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.calls, /docker image rm sha256:superseded/);
});

test('failed activation restores the previous image and does not clean releases', () => {
  const result = runDeployment('rollback');
  assert.equal(result.status, 1);
  assert.match(result.calls, /activate vision-pos-web:rollback/);
  assert.doesNotMatch(result.calls, /docker image rm /);
  assert.equal(result.deployed, false);
});

test('failed builds leave the active and rollback tags untouched', () => {
  const result = runDeployment('build-failure');
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.calls, /docker tag |docker compose |docker image rm /);
  assert.equal(result.deployed, false);
});

test('first deployment does not require a previous container', () => {
  const result = runDeployment('first');
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.calls, /docker tag .* vision-pos-web:rollback/);
  assert.equal(result.deployed, true);
});

test('images in use do not cause a healthy deployment to fail during cleanup', () => {
  const result = runDeployment('in-use');
  assert.equal(result.status, 0);
  assert.equal(result.deployed, true);
});

test('unexpected forced SSH commands are rejected before any deployment work', () => {
  const result = runDeployment('new', 'deploy main; echo forbidden');
  assert.equal(result.status, 2);
  assert.equal(result.calls, '');
  assert.equal(result.deployed, false);
});