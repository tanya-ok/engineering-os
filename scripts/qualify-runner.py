#!/usr/bin/env python3
"""Synthetic OpenCode shell cancellation and macOS worktree-boundary probe."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import datetime
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import tempfile
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected-version', required=True)
    args = parser.parse_args()
    executable = shutil.which('opencode')
    version = subprocess.check_output([executable, '--version'], text=True, timeout=5).strip()
    if version != args.expected_version:
        parser.error('Runtime changed; verify the contract before running')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='im-runner-') as tmp:
        root = Path(tmp).resolve()
        repo, work, runtime = [root / name for name in ('origin', 'worktree', 'runtime')]
        runtime.mkdir()
        env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
               'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1', 'TMPDIR': str(runtime)}
        def git(*args, cwd=repo):
            return subprocess.check_output(['git', *args], cwd=cwd, env=env, text=True, stderr=subprocess.PIPE).strip()
        repo.mkdir()
        git('init', '-q')
        (repo / 'fixture.txt').write_text('original\n')
        git('add', 'fixture.txt')
        git('-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic fixture')
        git('worktree', 'add', '--detach', str(work))
        secret = root / 'outside.txt'
        secret.write_text('outside sentinel\n')
        profile = root / 'sandbox.sb'
        profile.write_text('(version 1)\n(allow default)\n(deny file-write*)\n'
            f'(allow file-write* (subpath {json.dumps(str(work))}) (subpath {json.dumps(str(runtime))}) (literal "/dev/null"))\n'
            f'(deny file-read* (subpath {json.dumps(str(Path.home()))}))\n'
            '(deny network*)\n(allow network-inbound (local ip "localhost:18769"))\n'
            '(allow network-bind (local ip "localhost:18769"))\n')
        sandbox = ['/usr/bin/sandbox-exec', '-f', str(profile)]
        def run(code):
            return subprocess.run(sandbox + ['/usr/bin/python3', '-c', code], cwd=work, env=env, capture_output=True, timeout=5)
        (work / 'escape').symlink_to(repo / 'fixture.txt')
        boundary = {
            'outside_write_blocked': run(f'open({str(secret)!r},"w").write("bad")').returncode != 0,
            'symlink_write_blocked': run('open("escape","w").write("bad")').returncode != 0,
            'git_metadata_write_blocked': run(f'open({str(repo / ".git/config")!r},"w").write("bad")').returncode != 0,
            'worktree_edit_allowed': run('open("fixture.txt","w").write("reviewable change\\n")').returncode == 0,
        }
        (work / 'escape').unlink()
        boundary['origin_unchanged'] = (repo / 'fixture.txt').read_text() == 'original\n' and secret.read_text() == 'outside sentinel\n' and not git('status', '--porcelain')
        diff = git('diff', '--', 'fixture.txt', cwd=work)
        boundary['reviewable_diff'] = '+reviewable change' in diff
        password = secrets.token_urlsafe(32)
        config = runtime / 'opencode.json'
        config.write_text(json.dumps({'share': 'disabled', 'permission': {'*': 'deny'}, 'agent': {'probe': {'mode': 'primary', 'permission': {'*': 'deny'}}}}))
        env.update(OPENCODE_CONFIG=str(config), OPENCODE_DISABLE_MODELS_FETCH='true', OPENCODE_SERVER_PASSWORD=password)
        for key in ('CONFIG', 'DATA', 'CACHE', 'STATE'):
            env['XDG_' + key + '_HOME'] = str(runtime / key.lower())
        auth = 'Basic ' + base64.b64encode(('opencode:' + password).encode()).decode()
        def request(path, body=None):
            req = urllib.request.Request('http://127.0.0.1:18769' + path,
                data=None if body is None else json.dumps(body).encode(),
                headers={'Authorization': auth, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=15) as response:
                data = response.read()
                return json.loads(data) if data else None
        process = subprocess.Popen(sandbox + [executable, '--pure', 'serve', '--hostname', '127.0.0.1', '--port', '18769'], cwd=work, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        cancellation = {}
        try:
            for _ in range(60):
                try:
                    health = request('/global/health')
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Isolated runtime did not start')
            if health.get('version') != version:
                raise RuntimeError('Unexpected runtime health version')
            contract = request('/doc')['paths']
            for suffix in ('shell', 'abort'):
                assert 'post' in contract['/session/{sessionID}/' + suffix]
            session = request('/session', {'title': 'Synthetic active-shell cancellation'})['id']
            # This direct shell endpoint needs no model. Only this fixed synthetic command is submitted.
            command = "echo $$ > probe.pid; /bin/sh -c 'echo $$ > child.pid; while true; do echo tick >> heartbeat; sleep 0.2; done' & wait"
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(request, '/session/' + session + '/shell', {'agent': 'probe', 'command': command})
                for _ in range(80):
                    if (work / 'heartbeat').exists() and (work / 'heartbeat').stat().st_size >= 10:
                        break
                    if future.done():
                        raise RuntimeError('Shell ended before active-tool confirmation: ' + str(future.result())[:250])
                    time.sleep(.1)
                else:
                    raise RuntimeError('No heartbeat from active shell')
                cancellation['active_before_abort'] = True
                started = time.monotonic()
                request('/session/' + session + '/abort', {})
                response = future.result(timeout=10)
                cancellation['request_completed_after_abort'] = True
                cancellation['abort_seconds'] = round(time.monotonic() - started, 3)
                size = (work / 'heartbeat').stat().st_size
                time.sleep(1)
                cancellation['heartbeat_stopped'] = (work / 'heartbeat').stat().st_size == size
                for name, field in [('probe.pid', 'shell_process_gone'), ('child.pid', 'child_process_gone')]:
                    pid = int((work / name).read_text())
                    try:
                        os.kill(pid, 0)
                        cancellation[field] = False
                    except ProcessLookupError:
                        cancellation[field] = True

        finally:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        result = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'runtime_version': version,
                  'boundary': boundary, 'cancellation': cancellation, 'execution_qualified': False,
                  'scope': 'Synthetic direct-shell cancellation and filesystem boundaries only; no model, application repository, or dashboard executor.'}
        for name, content in [('report.json', json.dumps(result, indent=2)), ('review.diff', diff + '\n')]:
            target = output / name
            target.write_text(content)
            target.chmod(0o600)
        print(json.dumps(result))
        if not all(boundary.values()) or not all(cancellation.get(k) for k in ('active_before_abort', 'request_completed_after_abort', 'heartbeat_stopped', 'shell_process_gone', 'child_process_gone')):
            raise SystemExit(1)


if __name__ == '__main__':
    main()
