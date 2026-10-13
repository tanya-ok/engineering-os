#!/usr/bin/env python3
"""Bounded macOS/OpenCode read and patch smoke tests; never authorizes repository execution."""
import argparse
import ast
import datetime
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import urllib.request


def evaluate(events, marker):
    rows = []
    for line in events.splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    read = any(x.get('type') == 'tool_use' and x.get('part', {}).get('tool') == 'read'
               and x.get('part', {}).get('state', {}).get('status') == 'completed' for x in rows)
    answer = '\n'.join(x.get('part', {}).get('text', '') for x in rows if x.get('type') == 'text').strip()
    return read and answer == marker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, help='Exact locally installed Ollama model name')
    parser.add_argument('--reasoning-effort', choices=['default', 'none', 'low'], default='default')
    parser.add_argument('--case', choices=['read', 'patch'], default='read')
    parser.add_argument('--output', required=True, help='Private output directory outside application repositories')
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--timeout', type=int, default=90)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 180:
        parser.error('timeout must be between 1 and 180 seconds')
    executable = shutil.which('opencode')
    if not executable or not Path('/usr/bin/sandbox-exec').exists():
        parser.error('Requires installed OpenCode and macOS sandbox-exec')
    version = subprocess.check_output([executable, '--version'], text=True, timeout=5).strip()
    if version != args.expected_version:
        parser.error('Installed runtime version changed; verify its contract first')
    with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=5) as r:
        models = json.load(r)['models']
    model = next((m for m in models if m['name'] == args.model), None)
    if not model or 'tools' not in model.get('capabilities', []):
        parser.error('Model must already be installed locally and advertise tools')
    memory = int(subprocess.check_output(['/usr/sbin/sysctl', '-n', 'hw.memsize'], text=True))
    if model.get('size', memory) > memory * .6:
        parser.error('Model weights exceed the conservative memory budget; no model was loaded')
    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='im-qualification-') as temporary:
        root = Path(temporary).resolve()
        project = root / 'project'; project.mkdir()
        marker = 'fixture-' + os.urandom(8).hex()
        fixture = project / ('fixture.txt' if args.case == 'read' else 'fixture.py')
        fixture.write_text('Deployment marker: ' + marker + '\n' if args.case == 'read' else 'def total(values):\n    return sum(values) + 1\n')
        permission = {'*': 'deny', 'read': {'*': 'deny', str(fixture): 'allow', str(fixture).lstrip('/'): 'allow', fixture.name: 'allow'}}
        if args.case == 'patch': permission['edit'] = dict(permission['read'])
        prompt = ('Read the file using the read tool. Return exactly the marker with no explanation, punctuation or markdown.' if args.case == 'read' else 'Read and edit only the fixture file so total(values) returns the sum of the values. Preserve the function name. Do not create other files or use shell.')
        config = {'share': 'disabled', 'enabled_providers': ['ollama'], 'permission': permission,
                  'provider': {'ollama': {'npm': '@ai-sdk/openai-compatible', 'options': {'baseURL': 'http://127.0.0.1:11434/v1'}, 'models': {args.model: {'name': 'Qualification model', 'options': {} if args.reasoning_effort == 'default' else {'reasoningEffort': args.reasoning_effort}, 'limit': {'context': 8192, 'output': 1024}}}}},
                  'agent': {'qualify': {'mode': 'primary', 'permission': permission, 'temperature': 0, 'prompt': prompt}}}
        (project / 'opencode.json').write_text(json.dumps(config))
        profile = root / 'sandbox.sb'
        # Only local model access and a fixed test-server port. No shell tools are granted to the model.
        profile.write_text('(version 1)\n(allow default)\n(deny file-write*)\n'
                           f'(allow file-write* (subpath {json.dumps(str(root))}) (literal "/dev/null"))\n'
                           f'(deny file-read* (subpath {json.dumps(str(Path.home()))}))\n'
                           '(deny network*)\n(allow network-outbound (remote ip "localhost:11434") (remote ip "localhost:18769"))\n'
                           '(allow network-inbound (local ip "localhost:18769"))\n(allow network-bind (local ip "localhost:18769"))\n')
        env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'TMPDIR': str(root),
               'OPENCODE_DISABLE_MODELS_FETCH': 'true', 'OPENCODE_CONFIG': str(project / 'opencode.json')}
        for key in ['CONFIG', 'DATA', 'CACHE', 'STATE']:
            env['XDG_' + key + '_HOME'] = str(root / key.lower())
        command = ['/usr/bin/sandbox-exec', '-f', str(profile), executable, '--pure', 'run', '--agent', 'qualify', '--model', 'ollama/' + args.model, '--port', '18769', '--format', 'json', prompt + ' Use this exact absolute path: ' + str(fixture) + (' Final output must match ^fixture-[0-9a-f]{16}$.' if args.case == 'read' else '')]
        proc = subprocess.Popen(command, cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        timed_out = False
        try:
            stdout, stderr = proc.communicate(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True; os.killpg(proc.pid, signal.SIGKILL); stdout, stderr = proc.communicate()
        passed = args.case == 'read' and not timed_out and proc.returncode == 0 and evaluate(stdout, marker)
        finish_reasons = []
        read_tool_completed = False
        for line in stdout.splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get('type') == 'tool_use' and event.get('part', {}).get('tool') == 'read':
                read_tool_completed |= event.get('part', {}).get('state', {}).get('status') == 'completed'
            if event.get('type') == 'step_finish':
                finish_reasons.append(event.get('part', {}).get('reason'))
        patch_passed = False
        if args.case == 'patch' and not timed_out and proc.returncode == 0:
            try: patch_passed = ast.dump(ast.parse(fixture.read_text())) == ast.dump(ast.parse('def total(values):\n    return sum(values)\n'))
            except (SyntaxError, ValueError): pass
        result = {'case': args.case, 'patch_passed': patch_passed if args.case == 'patch' else None, 'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'runtime_version': version,
                  'model': args.model, 'model_read_passed': passed if args.case == 'read' else None, 'timeout': timed_out,
                  'read_tool_completed': read_tool_completed, 'returncode': proc.returncode, 'finish_reasons': finish_reasons,
                  'configuration': {'context': 8192, 'output': 1024, 'reasoningEffort': args.reasoning_effort, 'temperature': 0},
                  'execution_qualified': False, 'reason': 'Synthetic ' + args.case + ' probe only; running-tool cancellation and repository isolation acceptance remain required.'}
        for name, content in [('report.json', json.dumps(result, indent=2)), ('events.jsonl', stdout), ('stderr.log', stderr)]:
            p = output / name; p.write_text(content); p.chmod(0o600)
        print(json.dumps(result))


if __name__ == '__main__':
    main()
