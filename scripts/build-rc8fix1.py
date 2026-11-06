#!/usr/bin/env python3
"""Compatibility entrypoint; the current public builder is build-0.8.3.py."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("build-0.8.3.py")), run_name="__main__")
