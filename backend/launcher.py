"""
Dr. Wesen Abdulaziz Eye Clinic - Desktop Launcher
Starts the FastAPI backend (which also serves the built React frontend)
and opens the default browser to the app.
"""
import sys
import os
import time
import threading
import webbrowser
import socket
from pathlib import Path

import uvicorn


def find_free_port(preferred: int = 8001) -> int:
    """Return preferred port if free, otherwise the next available one."""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    return preferred


def open_browser(url: str, delay: float = 2.0):
    """Open the browser after the server has had time to start."""
    time.sleep(delay)
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[!] Could not open browser automatically: {e}")
        print(f"[i] Please open manually: {url}")


def main():
    port = find_free_port(8001)
    url = f"http://localhost:{port}/"

    print("=" * 60)
    print("  عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون - Dr. Wesen Abdulaziz Eye Clinic")
    print("=" * 60)
    print(f"[i] Server starting on port {port}...")
    print(f"[i] Open in browser: {url}")
    print(f"[i] Network access: http://<YOUR-IP>:{port}/")
    print("[i] Press Ctrl+C to stop the server.")
    print("=" * 60)

    # Open browser in a background thread
    threading.Thread(
        target=open_browser, args=(url,), daemon=True
    ).start()

    # Import server AFTER environment is ready
    from server import app

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="warning",  # Quieter for end-users
        access_log=False,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[i] Server stopped by user.")
        sys.exit(0)
    except Exception as e:
        print(f"[!] Fatal error: {e}")
        input("Press Enter to exit...")
        sys.exit(1)
