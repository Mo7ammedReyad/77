#!/usr/bin/env python3
import requests, subprocess, time, os, sys, textwrap

WORKER = "https://zctxhsyfk.mo7ammedreyad.workers.dev"
POLL_EVERY = 3  # seconds

def get_next_job():
    try:
        r = requests.get(f"{WORKER}/api/next", timeout=10)
        data = r.json()

        # تحقق من أن البيانات مش None وأنها عبارة عن dict
        if not isinstance(data, dict):
            print("⚠️ Unexpected response format:", data)
            return None, None

        return data.get("id"), data.get("cmd")

    except Exception as e:
        print("poll error:", e)
        return None, None

def post_result(job_id, output):
    try:
        requests.post(f"{WORKER}/api/respond",
                      json={"id": job_id, "output": output},
                      timeout=10)
    except Exception as e:
        print("post error:", e)

def run_cmd(cmd):
    try:
        completed = subprocess.run(cmd, shell=True,
                                   capture_output=True, text=True)
        out = completed.stdout + completed.stderr
        return out.strip() or "<no output>"
    except Exception as e:
        return f"agent error: {e}"

print("=== Remote-CMD agent started, polling … ===")
while True:
    job_id, cmd = get_next_job()

    if job_id and cmd:
        print(f"Got job {job_id}: {cmd}")
        output = run_cmd(cmd)
        print(textwrap.indent(output, "│ "))
        post_result(job_id, output)

    time.sleep(POLL_EVERY)
