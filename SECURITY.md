# Security policy

## Supported versions

Only the latest release on `main` is supported. Older tagged images are not
patched retroactively.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public
issue for anything exploitable.

You should get an acknowledgement within 7 days. Fixes are best effort; there
is no bug bounty.

## Scope notes

A background photo upload is attacker-controlled input, decoded by Chromium's
own image parsers during PDF rendering. The Chromium sandbox, the upload size
cap (`MAX_UPLOAD_BYTES`) and the request body cap (`BODY_SIZE_LIMIT`) are the
security-relevant controls around that path — see `CLAUDE.md` for the full
environment-variable table.

If your deployment sets `CHROMIUM_NO_SANDBOX=true` (some container runtimes'
default seccomp profile blocks the sandbox from starting at all), you must
apply the compensating controls documented in `CLAUDE.md`'s container notes:
`--read-only`, `--cap-drop=ALL`, `--security-opt no-new-privileges`, and a
tmpfs `/tmp`. Running with the sandbox on remains the default and the
preferred configuration.
