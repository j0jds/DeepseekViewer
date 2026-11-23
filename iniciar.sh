#!/usr/bin/env bash
# Linux / macOS: ./iniciar.sh   (ou: bash iniciar.sh caminho/do/export.zip)
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then exec python3 server.py "$@"; fi
if command -v python  >/dev/null 2>&1; then exec python  server.py "$@"; fi
echo "Python 3 não encontrado. Instale em https://www.python.org/downloads/"
