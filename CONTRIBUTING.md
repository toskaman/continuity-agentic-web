# Contributing to CONTINUITY & Open Mission Graph Packages

Thank you for contributing to **CONTINUITY** and its reusable Open Agentic Web building blocks (`packages/*`).

## Development Requirements

- **Node.js >= 22.0.0** (uses native ES modules, `node:test`, `fetch`, and Web Crypto `crypto.subtle`).
- Zero external runtime dependencies are permitted inside `packages/*` so every module remains directly importable in standard browsers without a bundler.

## Mandatory Pre-PR Verification Gate

Before opening a pull request, run:

```bash
node scripts/build_all_networks.mjs
node scripts/run_all_tests.mjs
```

All changes must satisfy:
1. **Zero warnings and zero errors** in `skills/agentify-website/scripts/build_network.mjs --check` across all 5 websites.
2. **Zero errors** in `check_partner.mjs` across all partner links.
3. **100% pass rate** across unit, contract, integration, security, and 15-scenario Chaos Lab tests.
4. **No secrets, tokens, or personal data** committed anywhere in `.hocon`, `.json`, or source files.
5. **Honest evidence labeling:** Never label a simulated provider capability as a live commercial or municipal integration.

## License

By contributing, you agree that your contributions will be licensed under the **Apache License 2.0** (see [`LICENSE`](LICENSE)).
