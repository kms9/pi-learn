#!/usr/bin/env python3
"""Exercise real HTTP/SQLite commit windows against an isolated visible Controller.

Requires a pisquad_integration build already running. This uses a synthetic busy
adapter, never starts Pi, and does not count as real Pi acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', type=Path, required=True)
    parser.add_argument('--role', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.project_root.resolve()
    discovery = json.loads((root / '.agents/pisquad/.runtime/controller.json').read_text())
    operator = (root / '.agents/pisquad/.runtime/operator.token').read_text().strip()
    report = {'scope': 'real HTTP/SQLite with synthetic busy adapter; no Pi/model',
              'project': str(root), 'controller_epoch': discovery['controller_epoch'], 'cases': []}
    # Never overwrite a previous failure or successful run's evidence.
    with args.output.open('x') as stream:
        json.dump(report, stream, indent=2)

    def save():
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    def call(route, body=None):
        request = urllib.request.Request(
            discovery['endpoint'] + route,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Content-Type': 'application/json',
                     'X-Pi-Squad-Protocol': 'pi-squad/2',
                     'X-Pi-Squad-Controller': discovery['controller_id'],
                     'Authorization': 'Bearer ' + operator})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    def fault(name, action):
        status, response = call('/v2/__integration/fault', {'name': name, 'action': action})
        if status != 200:
            raise RuntimeError('integration fault endpoint unavailable')
        return response

    def cancel(task_id):
        status, task = call('/v2/tasks/' + task_id)
        if status != 200:
            raise RuntimeError('cannot inspect fixture task for cleanup')
        status, _ = call('/v2/tasks/' + task_id + '/cancel', {
            'request_id': str(uuid.uuid4()), 'expected_revision': task['revision'],
            'note': 'Close isolated HTTP transaction fixture'})
        if status != 200:
            raise RuntimeError('fixture task cancellation needs inspection')

    name = 'txn-probe-' + uuid.uuid4().hex[:12]
    binding = None
    created = set()
    try:
        fault('transaction-driver-check', 'release')
        status, instance = call('/v2/agents/register', {
            'agent_id': name, 'runtime_id': str(uuid.uuid4()), 'session_id': str(uuid.uuid4()),
            'runtime_token': str(uuid.uuid4()) + str(uuid.uuid4()),
            'mode': 'role', 'role_id': args.role, 'activity': 'working',
            'capabilities': {'sections': True, 'agent_settled': True,
                             'before_provider_request': True, 'native_input': True},
            'role_hash': hashlib.sha256((root / '.agents/pisquad/roles' / args.role / 'role.md').read_bytes()).hexdigest(),
            'available_tools': ['read', 'grep', 'find', 'ls']})
        if status != 200:
            raise RuntimeError('synthetic adapter registration failed: ' + str(instance))
        binding = instance['binding']
        report['agent_id'] = name
        for point in ('transaction_before_commit', 'transaction_after_commit'):
            request = {'request_id': str(uuid.uuid4()), 'target': name,
                       'goal': point + ' response uncertainty integration', 'kind': 'execute',
                       'write_set': [], 'dependencies': [], 'refs': []}
            before = call('/v2/snapshot')[1]
            box = []

            def submit():
                try:
                    box.append(call('/v2/tasks/direct', request))
                except Exception as error:
                    box.append(error)

            fault('task_before_persist', 'pause')
            thread = threading.Thread(target=submit)
            thread.start()
            try:
                for _ in range(50):
                    if fault('transaction-driver-check', 'release').get('task_before_persist') == 'paused':
                        break
                    time.sleep(0.1)
                else:
                    raise RuntimeError('specific task persistence pause not observed')
                fault(point, 'fail')
                fault('task_before_persist', 'release')
                thread.join(10)
                if thread.is_alive() or not box or isinstance(box[0], Exception):
                    raise RuntimeError('request outcome requires inspection')
                after = call('/v2/snapshot')[1]
                records = call('/v2/requests/' + request['request_id'])[1]['records']
                prior = [task for task in after['views']['tasks']
                         if task['source'].get('input_id') == request['request_id']]
                created.update(task['task_id'] for task in prior)
                committed = point == 'transaction_after_commit'
                retry_status, retried = call('/v2/tasks/direct', request)
                if retry_status == 200:
                    created.add(retried['task_id'])
                rows = call('/v2/snapshot')[1]['views']['tasks']
                matches = [task for task in rows if task['source'].get('input_id') == request['request_id']]
                matched = (box[0][0] == 400 and len(prior) == int(committed)
                           and len(records) == int(committed) and retry_status == 200 and len(matches) == 1
                           and (not committed or retried['task_id'] == prior[0]['task_id'])
                           and (committed or before['revision'] == after['revision']))
                report['cases'].append({'point': point, 'request_id': request['request_id'],
                                        'first_status': box[0][0], 'first_response': box[0][1],
                                        'before_revision': before['revision'], 'after_revision': after['revision'],
                                        'task_count_before_retry': len(prior), 'request_records_before_retry': len(records),
                                        'retry_status': retry_status, 'retry_task_id': retried.get('task_id'),
                                        'task_count_after_retry': len(matches), 'matched': matched})
                save()
                if not matched:
                    raise RuntimeError('commit-window expectation failed; evidence retained')
            finally:
                fault('transaction-driver-cleanup', 'reset')
                thread.join(20)
        report['result'] = 'MATCHED'
    except Exception as error:
        report['result'] = 'FAILED'
        report['error'] = str(error)
        raise
    finally:
        cleanup_errors = []
        for task_id in created:
            try:
                cancel(task_id)
            except Exception as error:
                cleanup_errors.append(str(error))
        if binding:
            try:
                status, _ = call('/v2/agents/' + name + '/release', {
                    'request_id': str(uuid.uuid4()), 'expected_revision': binding['binding_epoch'],
                    'expected_runtime': binding['runtime_id'], 'note': 'Synthetic adapter never injected model input'})
                report['adapter_release_status'] = status
                if status != 200:
                    cleanup_errors.append('synthetic adapter release needs inspection')
            except Exception as error:
                cleanup_errors.append(str(error))
        if cleanup_errors:
            report['result'] = 'FAILED'
            report['cleanup_errors'] = cleanup_errors
        save()
        if cleanup_errors:
            raise RuntimeError('fixture cleanup incomplete; see retained evidence')
    print(str(args.output))


if __name__ == '__main__':
    main()
