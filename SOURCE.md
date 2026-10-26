# Corresponding Source for this release

The npm archive contains the preferred, unminified application source: main.cjs,
preload.cjs, bin/, lib/, ui/ and assets/, together with the dependency manifest,
exact dependency lock, license and notices. There is no separate minified Nodes
application for which source must be requested. The optional native engines and
third-party runtime packages are separate dependencies with their own source
and licensing, identified in THIRD-PARTY-NOTICES.md and DEPENDENCY-LICENSES.json.

The official source repository is https://github.com/aiuci/nodes-for-rea.

The published release and the setup commands below currently support Windows
x64. For Linux/macOS contribution work, start with the
[platform guide](docs/PLATFORM-SUPPORT.md) and its linked issues; the unmodified
package's platform guards are intentional, and no working port is claimed yet.

For this release, check out tag v0.3.0-preview.20261025.6. Its application runtime
files match the published npm tarball byte for byte. Repository-only tests,
documentation and npm scripts do not change that runtime.

On supported Windows x64:

```sh
git clone https://github.com/aiuci/nodes-for-rea.git
cd nodes-for-rea
git checkout v0.3.0-preview.20261025.6
npm ci
npm test
npm start -- --data-dir "C:\My modified Nodes workspace"
```

The same setup and test commands run a source checkout on macOS arm64
(verified, see the macOS milestone in
[docs/PLATFORM-SUPPORT.md](docs/PLATFORM-SUPPORT.md)); Linux x64/arm64
installation and launch are enabled by the same platform guards, with a Linux
acceptance record still outstanding.

The public test suite excludes two internal regression suites whose fixtures
were retained investigation records. Those records are not distributed. The
remaining tests use synthetic fixtures; one example local path was generalized.
The 837-check release verification refers to the full internal suite, separately
from the public checkout's test count.

To inspect the published npm source without launching it:

```sh
npm pack nodes-for-rea
tar -xf nodes-for-rea-<version>.tgz
```

To modify and run a copy on supported Windows x64, enter its package/ directory,
install the locked dependencies with npm install, edit the JavaScript/HTML/CSS,
and run:

```sh
node bin/nodes-for-rea.cjs --data-dir "C:\My modified Nodes workspace"
```

The first launch acquires Electron when needed. The application does not require
a build step: the distributed JavaScript, HTML and CSS are the editable sources
used directly at runtime. package.json and npm-shrinkwrap.json control dependency
installation. npm-release.json records the original assembly commit for
provenance; that private development history is not needed. The public release
tag identifies this clean source checkout.

To package your modified source, update its package identity/version as needed,
retain the license and notices, follow TRADEMARKS.md to distinguish it from an
official release, and use npm pack --ignore-scripts from that directory. Include
all Corresponding Source, including any new source/build files your changes
require. Do not include research, profiles, credentials or node_modules.

The source/build-npm-package.mjs file records the official source-only assembly
script for provenance. It reads a clean committed Nodes source checkout; a local
modified copy can instead be repacked directly using its supplied package.json.
No access to a private Gorgeous Systems platform is required to modify or run
this released Nodes application.
