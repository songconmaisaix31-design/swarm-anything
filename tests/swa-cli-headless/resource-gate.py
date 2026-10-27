import datetime
import json

import psutil

print(json.dumps({
    "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "cpu_percent": psutil.cpu_percent(interval=1),
    "available_bytes": psutil.virtual_memory().available,
}))
