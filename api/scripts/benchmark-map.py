"""Measure authenticated map HTTP requests, without ETag cache hits. Python 3.9+."""
import datetime as dt
import json
import math
import os
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo


def main():
    base = os.environ.get('QUACK_BASE_URL', 'http://localhost:8080').rstrip('/')
    cookie = os.environ.get('QUACK_COOKIE')
    if not cookie:
        raise SystemExit('Set QUACK_COOKIE to JSESSIONID=<your real account session ID>.')
    zone = ZoneInfo('America/New_York')
    today = dt.datetime.now(zone).date()
    samples = []
    # Measure each day separately so a slow day cannot hide in a combined percentile.
    for offset in (-1, 0, 1):
        day = today + dt.timedelta(days=offset)
        start = dt.datetime.combine(day, dt.time(), zone)
        end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), zone)
        query = urllib.parse.urlencode({
            'bbox': '-74.03,40.74,-74.02,40.75',
            'from': start.astimezone(dt.timezone.utc).isoformat(),
            'to': end.astimezone(dt.timezone.utc).isoformat(), 'limit': 100})
        timings = []
        for n in range(120):
            request = urllib.request.Request(base + '/api/v1/events?' + query,
                                             headers={'Cookie': cookie})
            began = time.perf_counter()
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError('Expected HTTP 200')
                raw = response.read()
            elapsed = (time.perf_counter() - began) * 1000
            body = json.loads(raw)
            if len(body.get('events', [])) != 100 or not body.get('nextCursor'):
                raise RuntimeError('Expected a full seeded page and nextCursor; seed/check database first.')
            if n >= 20:
                timings.append(elapsed)
        p95 = sorted(timings)[math.ceil(len(timings) * .95) - 1]
        samples.append(p95)
        print(f'{day}: warmup=20 samples=100 p95={p95:.2f}ms target<500ms')
    if max(samples) >= 500:
        raise SystemExit('FAIL: map HTTP p95 target exceeded')
    print('PASS: all three daily first-page HTTP p95 values below 500ms')


if __name__ == '__main__':
    main()
