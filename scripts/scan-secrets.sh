#!/usr/bin/env bash
# Scan the current repository, including root commits and merged history.
set -euo pipefail
exec gitleaks git --log-opts=--all --redact --config .gitleaks.toml
