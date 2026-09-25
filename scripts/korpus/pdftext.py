#!/usr/bin/env python3
"""Text eines PDFs, Seite fuer Seite, als JSON auf die Standardausgabe.

Genutzt vom Korpus-Werkzeug (scripts/korpus/quellen/koeche-nord.mjs).
pypdf liest Bindestriche, die als weiches Trennzeichen gesetzt sind, als
U+00AD; PDF-Leser in JavaScript machen daraus ein Leerzeichen, und aus
"Ei-Ersatz" wuerde "Ei Ersatz" — fuer die Allergenerkennung ein Ei.

    pip install pypdf
    python3 scripts/korpus/pdftext.py buch.pdf
"""

import json
import sys

from pypdf import PdfReader

def seitentext(seite):
    text = seite.extract_text() or ''
    zeilen = [z for z in text.split('\n') if z.strip()]
    # Manche Buecher setzen jedes Wort einzeln; dann steht jedes Wort auf
    # einer eigenen Zeile. Die Layout-Auslese ordnet sie wieder zu Zeilen.
    if len(zeilen) > 30 and sum(len(z.split()) for z in zeilen) / len(zeilen) < 1.5:
        text = seite.extract_text(extraction_mode='layout') or text
    return text


leser = PdfReader(sys.argv[1])
meta = {str(k).lstrip('/'): str(v) for k, v in (leser.metadata or {}).items()}
seiten = [seitentext(seite) for seite in leser.pages]
json.dump({'meta': meta, 'seiten': seiten}, sys.stdout, ensure_ascii=False)
