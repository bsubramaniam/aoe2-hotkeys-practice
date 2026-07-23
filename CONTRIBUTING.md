# Contributing

Thank you for helping improve AoE II Hotkey Practice.

## Development

1. Fork and clone the repository.
2. Install the locked dependency set with `npm ci`.
3. Create a focused branch for the change.
4. Run `npm test` before opening a pull request.

Pull requests should explain the user-visible outcome and include focused tests
for changed behavior. Keep changes small enough to review independently.

## Project constraints

- Hotkey and custom-drill files must remain local to the browser.
- Do not add analytics or logging that exposes file contents or practice data.
- Do not commit personal hotkey files, secrets, generated builds, or local tool
  state.
- Do not add proprietary Age of Empires artwork, audio, video, or other game
  assets.
- Preserve the unofficial fan-project disclaimer and third-party notices.

By contributing, you agree that your contribution is licensed under the
project's MIT License.
