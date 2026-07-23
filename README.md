# AoE II Hotkey Practice

A static Vite + TypeScript hotkey trainer for Age of Empires II.

**Status: Beta.** The trainer is usable, but hotkey mappings and behavior may
still contain errors. Feedback and bug reports are welcome.

**Hosted prototype:** [aoe2hotkey.vejak-app.workers.dev](https://aoe2hotkey.vejak-app.workers.dev/)

## Features

- Practice built-in or browser-local custom drills.
- Use the default mapping or load `.hki` and `.hkp` hotkey files.
- Create, edit, import, and export custom drill JSON.
- Run entirely in the browser without uploading hotkey or drill files.

## Requirements

- Node.js 22.12 or newer, excluding Node.js 23
- npm

## Local development

```powershell
npm ci
npm run dev
```

## Test and build

```powershell
npm test
npm run build
```

The production website is emitted as distinct static multi-page HTML files in `dist/`. Upload the contents of `dist/` to Cloudflare. Vite is build tooling only and is not part of the deployed runtime. The build fails if the generated pages are copied shells, contain unresolved assets, or violate the deploy security checks.

## Maintaining the built-in default mapping

Reset an AoE II profile to the intended default, copy its `Base.hkp` and
`Hotkeys.hkp` files into the repository root, and run:

```powershell
npm run generate:default-profile
```

The input files are ignored by Git. The generator uses the production parser
and writes only command IDs, keys, and modifier flags to
`src/default-profile.ts`; it does not embed either binary file. Review the
generated diff and run `npm test` before committing it.

## Privacy and security

Selected hotkey and custom-drill files are processed locally in the browser. See
[Privacy & Beta Terms](https://aoe2hotkey.vejak-app.workers.dev/privacy) for the hosted prototype's data practices and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Fan-project disclaimer

This is an unofficial fan-made tool and is not endorsed by or affiliated with
Microsoft, World's Edge, Forgotten Empires, or the Age of Empires team. Age of
Empires II and related names are trademarks of their respective owners.

## License

Licensed under the [MIT License](LICENSE).

Third-party components and their licenses are listed in
[THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt).
