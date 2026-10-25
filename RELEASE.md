# 0.3.0-preview.20261025.6

Windows x64 preview. Install the current public npm release:

```sh
npm install -g nodes-for-rea
nodes-for-rea
```

Close Nodes before updating. Saved investigations, evidence and settings live
outside the installed package. Back them up separately. Read README.md for
supported Node.js versions, agent setup and preview limitations.

## Changes

- Optional first-run welcome and four-step tour, with Back, Finish later and
  resume from Settings → Help → Quick tour.
- Explicit AI Start/Stop and evidence/save steps. Opening the tour does not
  start a model request; using your selected agent may consume credits.
- Graph JSON export derives a safe filename from the investigation title.
- Complete editable application source, AGPL-3.0-only license, reserved-brand
  policy, contribution terms and third-party notices are available publicly.

## Distribution and verification

The attached `nodes-for-rea-0.3.0-preview.20261025.6.tgz` is the exact verified
npm package, not a standalone Windows installer. GitHub's generated source ZIP
and tar.gz archives contain the public source checkout. The earlier `.1`
standalone Windows ZIP remains available on its own older release.

Package SHA256:

```text
a29d0ed1594f6336da41f4a15aaa22bbb6701604bef7b0bbe2732c74f4379554
```

The public checkout's runtime files and dependency lock match that npm package.
Repository-only documentation, development test files and npm start/test scripts
do not change the application runtime. SOURCE.md explains the source layout.

The full release source suite passed 837 checks. Installed-app verification
passed 15 tour groups, 8 upgrade/REA/retention groups and 3 native Save As filename
cases; a fresh registry installation passed all 15 tour groups again. The public
checkout has 827 checks, excluding internal investigation-record fixtures.

Verification used Windows 10 x64 and Node 22.22.0. REA JavaScript inspection and
storage checks were real; automated AI replies were controlled fixtures. This
does not establish live model quality, beginner usability, Windows 11 support,
physical microphone operation or broad native-provider acceptance. Review the
underlying evidence, particularly when sources contradict one another. npm does
not supply Windows publisher signing.

## License and credits

Original Nodes code: AGPL-3.0-only, copyright (C) 2026 Jeremy Opio. Commercial use
and forks are permitted under the license. Gorgeous Systems and Nodes for REA
branding is covered separately by TRADEMARKS.md. Other Gorgeous Systems products
are outside this release. Contributors retain their copyright; CONTRIBUTING.md
does not imply assignment or proprietary relicensing permission.

REA is the upstream project at https://github.com/morluto/rea. Third-party code
retains its own licenses; see THIRD-PARTY-NOTICES.md and LICENSES/.

Built by Jeremy Opio / Gorgeous Systems.
