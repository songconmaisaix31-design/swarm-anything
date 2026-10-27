import os
import signal
import sys
import time

# 仅使用普通内核进程，不实现 Agent 或模型协议。
print("ROOT " + str(os.getpid()), flush=True)
for line in sys.stdin:
    command = line.strip()
    if command == "fork":
        intermediate = os.fork()
        if intermediate == 0:
            os.setsid()
            leaf = os.fork()
            if leaf == 0:
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                print("LEAF " + str(os.getpid()), flush=True)
                while True:
                    time.sleep(1)
            os._exit(0)
        os.waitpid(intermediate, 0)
    elif command == "leave":
        os._exit(0)
    else:
        print("ECHO " + command, flush=True)
