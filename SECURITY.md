# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/storyboard-vn/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers The Glass Meridian browser runtime, including the zero-dependency Ren'Py subset parser in `engine.js`, the deterministic story runtime, the script and story-graph inspector, the state-space and reachability lab in `narrative-lab.js`, the SHA-256 proof digest exporter, the `#gm=` share-link bookmarks, the in-page self-test runner, local persistence and browser rendering.

In scope:

- A cross-site scripting or HTML injection path through script text, the live editor, share links, imported text or report output.
- A parser or expression-evaluation flaw in the Ren'Py subset runtime that escapes the sandboxed script model or executes attacker-controlled code outside the documented mutation statements.
- A share-link decoder or serialization flaw that bypasses validation, corrupts story state, or executes attacker-controlled code.
- A report export or spreadsheet escaping flaw that makes generated output execute a formula or script when opened.
- A digest or tamper-verification flaw that misrepresents the integrity of an export.

Out of scope:

- Browser vulnerabilities, operating system compromise or physical access to the machine.
- Damage caused by modified copies of the static application that do not come from this repository.
- The narrative content of the visual novel itself, unless a report shows a specific validation or output integrity failure.
- The desktop Ren'Py launcher and engine, which are upstream projects.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
