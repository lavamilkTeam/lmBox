import json
import sys

from lmbox_geometry.runner import run

try:
    envelope = json.loads(sys.stdin.readline())
    result = run(envelope)
except Exception as error:
    print(str(error), file=sys.stderr)
    result = {"error": str(error)[:1000]}
print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
