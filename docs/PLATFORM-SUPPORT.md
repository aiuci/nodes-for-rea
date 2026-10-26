# Platform support and contribution starting points

Nodes for REA is currently a **Windows x64 preview**. Linux and macOS help is
welcome; neither platform has a supported release or a completed first-run check.
This page describes contribution readiness, not a compatibility announcement.

| Platform | Published package | Existing validation | Contribution status |
| --- | --- | --- | --- |
| Windows x64 | npm preview `.6`; older `.1` ZIP is separate | Windows 10 x64 installation, real REA JavaScript inspection, storage and reopening checks | Supported preview; Windows 11 acceptance remains unverified |
| Linux | Installation and launcher restricted to x64/arm64 on contributor branches; published package remains Windows x64 | No Linux acceptance recorded | Guards relaxed for contributor testing; first Linux source launch still wanted |
| macOS | Installation and launcher allow `darwin` x64/arm64 on contributor branches; published package remains Windows x64 | macOS 27.0.1 arm64 source launch and investigation lifecycle verified on a contributor branch (see first macOS milestone below) | First macOS milestone established; packaging/signing remain open |

## Where to start

The platform issues linked from [CONTRIBUTING.md](../CONTRIBUTING.md) track each
port. Comment with your OS/version, CPU architecture and the slice you want to
take before starting a broad change. A small reproducible patch is welcome;
claiming an entire platform is unnecessary.

- [Linux contribution issue](https://github.com/aiuci/nodes-for-rea/issues/1)
- [macOS contribution issue](https://github.com/aiuci/nodes-for-rea/issues/2)

Work from the public `main` branch and record your commit. Its runtime matches
the published `.6` release; later private development screenshots or discussions
are not a specification for this port. See [SOURCE.md](../SOURCE.md) for source
layout and the currently supported Windows development workflow.

The unmodified package is not expected to install or launch on Linux/macOS:
`package.json` declares `os: ["win32"]` and `cpu: ["x64"]`, and the CLI enforces
those restrictions. Platform changes belong on a contributor branch. Bypassing
these checks alone does not establish support. No platform-wide installation
workaround is advertised here.

## Source map

| Concern | Starting files | What to establish |
| --- | --- | --- |
| Installation and launch | `package.json`, `npm-shrinkwrap.json`, `bin/nodes-for-rea.cjs` | Platform/architecture policy, matching Electron and pinned dependency installation, correct Node runtime |
| Saved work | `lib/distribution.cjs`, `lib/paths.mjs`, `lib/document-controller.mjs` | Existing macOS/XDG path branches are exercised; permissions, Unicode/spaces and update retention work |
| Agent discovery and sign-in | `lib/agent-discovery.mjs`, `lib/runtime.mjs`, `lib/connection.mjs` | Reuse existing non-Windows discovery; review Windows fallback paths and executable validation |
| REA startup and shutdown | `lib/rea-config.mjs`, `lib/rea-client.mjs`, `lib/runtime.mjs` | npm REA entry uses the correct Node process; Stop/close leave no owned workers running |
| Desktop behavior | `main.cjs`, `lib/windows-brand-shortcuts.cjs` | Guard Windows-only actions, verify save/open/close and platform lifecycle; assess macOS activation behavior |
| Optional dictation | `lib/whisper-runtime.mjs` | Currently Windows x64 only; typing must remain usable, voice can remain explicitly unavailable |

Several Windows branches are already guarded. Audit each call before changing
it; do not replace working shared behavior simply because it contains a Windows
implementation. The shortcut IPC action in `main.cjs`, for example, invokes
PowerShell and needs a platform-specific decision.

## First macOS development milestone (contributor branch, 2026-10-26)

Verified on macOS 27.0.1 (26A434), Apple Silicon (arm64), Node.js v26.12.1, npm 11.20.0,
from a checkout of public `main` plus the platform changes on the linked PR branch:

- `npm ci` installs the pinned Electron 44.7.2, `rea-agents` 6.5.0 and
  `@openai/codex` 0.149.0; the first launch acquires the desktop runtime.
- `node bin/nodes-for-rea.cjs --diagnostics` reports the
  `~/Library/Application Support/Nodes for REA` data, settings and profile roots;
  `--data-dir` keeps a run fully isolated.
- Source suite on macOS: 819 tests, 726 pass, 91 fail. The unmodified `main`
  checkout on the same machine fails the identical 91 tests (Windows-assuming
  fixtures); the branch introduces no new failures.
- Genuine REA static JavaScript inspection of an owned inert fixture through the
  bundled npm engine returned evidence record
  `ev_35f8ed42b2933cd1ba36b6b4d6299e21a8c286cb0ae59ac9b5eabf1343e8466c`
  (JavaScriptApplicationGraph, integrity contradictions: none). Fixture-based
  control checks, not AI model responses.
- Lifecycle: typed draft, normal window close, fresh reopen. The same
  investigation reopens in `ready` status with the draft restored; opening does
  not restart investigation and creates no duplicate. Owned REA worker and app
  processes exited with zero stragglers after normal close on every launch.
- Read-only agent discovery found a local Claude CLI (signed-out) without
  dispatching a model request. Live model sign-in and response checks were not
  part of this milestone.
- Windows-only behavior is guarded, not removed: the desktop shortcut action
  stays behind `win32` and is hidden in the macOS UI; titlebar, icon, App
  User Model and brand-shortcut paths remain Windows-gated.

Remaining macOS limitations: local dictation stays Windows x64 only (typed
goals work), installed-application lookup is Windows-only, plan/approve
execution needs a connected agent and was not exercised with a live model,
and dock/activation behavior follows the shared close-to-quit lifecycle.
Packaging, app identity and signing are later release decisions.

## First useful milestone

Aim for one **named OS/version and architecture**, not every distribution or Mac.
Record the exact source commit, Node version and pinned dependency versions.

1. Install the contributor branch and launch Electron using an isolated data
   folder. Record runtime/library prerequisites and any manual setup.
2. Verify that startup and the optional tour do not dispatch model requests.
3. Run a genuine REA static JavaScript inspection of an inert, owned fixture;
   retain a receipt and distinguish it from controlled AI responses.
4. Verify agent discovery/sign-in separately. A live model check is optional at
   this stage and must use the contributor's explicitly authorized account;
   local sign-in detection alone does not prove model access.
5. Exercise plan/approve/skip, Stop, save, normal close and fresh reopen. Report
   fixture-based control checks separately from live AI behavior. Retain evidence,
   draft and unfinished state; opening must not silently restart investigation.
6. Record process exit, missing-tool recovery and optional-feature limitations.
   Run relevant source checks on that platform and preserve Windows behavior.

Submit a focused PR with reproduction steps, sanitized logs, screenshots where
useful and a short list of remaining limitations. Review logs for account data,
local paths and private investigation content before posting. Do not include
tokens, browser profiles or private targets.

## Later release decisions

A working development launch is not automatically a published platform release.
Architecture coverage, Linux desktop integration, macOS app identity/signing and
distribution channels require separate evidence and maintainer review. Native
providers and optional voice support can be validated separately from the first
JavaScript milestone. Keep the current Windows preview working throughout.
