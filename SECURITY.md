# Security policy

## Supported versions

Security fixes go into the latest release only.

## Reporting a vulnerability

Please report vulnerabilities privately, **not** as a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/Ashishjain608/notes-goals-app/security/advisories/new)
(the repository's **Security** tab → **Report a vulnerability**) and include:

- the app version (Settings → About) and your macOS version
- steps to reproduce, and what an attacker gains

The maintainer aims to acknowledge reports within a week. Once a fix ships, the advisory is published
with credit to you unless you'd rather stay anonymous.

## Scope

Notes & Goals has no accounts or servers and makes no network requests of its own — your data stays
as plain files in the data folder you choose. The most relevant reports are about the app itself, for
example a crafted note, task, or attachment that runs script in the app's webview, or that makes the
app read or write files outside the data folder.
