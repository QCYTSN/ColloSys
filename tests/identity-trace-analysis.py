"""Stream Chrome trace events; report source evidence without loading huge traces."""
import gzip, json, sys, collections, pathlib
for filename in sys.argv[1:]:
    totals = collections.defaultdict(lambda: [0, 0, 0])
    functions = collections.defaultdict(lambda: [0, 0, 0])
    samples = collections.Counter()
    nodes = {}
    with gzip.open(filename, 'rt', encoding='utf8') as stream:
        for line in stream:
            raw = line.strip().rstrip(',')
            if not raw.startswith('{"args"'): continue
            try: event = json.loads(raw)
            except json.JSONDecodeError: continue
            name, duration = event.get('name', ''), event.get('dur', 0) / 1000
            if duration:
                bucket = totals[name]; bucket[0] += 1; bucket[1] += duration; bucket[2] = max(bucket[2], duration)
            if name == 'FunctionCall':
                data = event.get('args', {}).get('data', {})
                key = f"{data.get('functionName','')} {data.get('url','')}:{data.get('lineNumber','')}"
                bucket = functions[key]; bucket[0] += 1; bucket[1] += duration; bucket[2] = max(bucket[2], duration)
            if name == 'ProfileChunk':
                profile = event.get('args', {}).get('data', {}).get('cpuProfile', {})
                identity = (event.get('pid'), event.get('id'))
                for node in profile.get('nodes', []): nodes[(identity, node['id'])] = node.get('callFrame', {})
                for sample in profile.get('samples', []):
                    frame = nodes.get((identity, sample), {})
                    if frame.get('url'):
                        samples[f"{frame.get('functionName','')} {frame['url']}:{frame.get('lineNumber',0)+1}"] += 1
    result = {'trace': filename, 'inclusiveTimelineMs': sorted(totals.items(), key=lambda v: -v[1][1])[:22], 'inclusiveFunctionsMs': sorted(functions.items(), key=lambda v: -v[1][1])[:20], 'cpuLeafSamples': samples.most_common(25), 'note': 'Inclusive timeline durations overlap and cannot be summed as CPU time. CPU samples are sampled leaf frames, not exact timings.'}
    target = pathlib.Path(filename).with_name('trace-analysis.json')
    target.write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps(result, indent=2))
