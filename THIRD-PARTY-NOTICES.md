# Third-party software and credits

Nodes for REA is a distinct application by Jeremy Opio / Gorgeous Systems. It
uses the following independent projects without claiming their authorship or
endorsement. Their licenses are not replaced by the Nodes AGPL license.

| Component | Pinned version | License | Source |
| --- | --- | --- | --- |
| REA (rea-agents) | 6.5.0 | MIT | https://github.com/morluto/rea |
| OpenAI Codex CLI | 0.149.0 | Apache-2.0 | https://github.com/openai/codex |
| Electron | 44.7.2 | MIT and included runtime notices | https://github.com/electron/electron |
| Cheerio | 1.2.0 | MIT | https://github.com/cheeriojs/cheerio |

These packages are installed by npm from their upstream distributions. Preserve
the license, copyright and notice files included with them. Electron's acquired
runtime carries additional Chromium and other third-party notices. Codex's native
platform packages and REA's providers have their own upstream notices as well.

The full locked npm dependency inventory is in DEPENDENCY-LICENSES.json. It
records the selected versions, license expressions and registry source archives;
it is an inventory, not a grant of rights or a replacement for license text.

Frida 17.23.2, installed through REA, declares LGPL-2.0 with the wxWindows 3.1
exception. That upstream exception permits binary object-code works based on
the library to be distributed under other terms. The upstream COPYING and the underlying GNU Library GPL version 2 text
(COPYING.LIB) are included under LICENSES/frida/. Source:
https://github.com/frida/frida/tree/17.23.2. Frida's own rights and obligations
remain intact; the exception does not relicense Frida as Nodes code.

The application directly carries unmodified helper libraries under lib/vendor/:
yauzl, fd-slicer, buffer-crc32 and pend. Each directory retains its original
license, copyright notice and source. They are excluded from the original-code
AGPL headers and remain under their existing permissive licenses.

Optional downloaded providers, models and voice engines are not relicensed by
Nodes. See their own licenses and the application's provider/voice notices when
installing them. Choosing an AI account does not transfer model access or credits.
