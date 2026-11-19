# Security policy

Inkwellio is a publishing platform in development. It holds writers' accounts and their unpublished and
published writing, so a security report is treated as urgent work rather than a backlog item.

## Reporting a vulnerability

Use **GitHub's private vulnerability reporting**: open the repository's **Security** tab and choose
**Report a vulnerability**. That channel is private, structured, and notifies the maintainer directly.

Please do not open a public issue for a vulnerability, and do not test against another writer's account
or content.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement that the report was received | within 72 hours |
| First triage verdict — accepted, needs more information, or out of scope | within 7 days |
| Fix for an accepted high-severity finding | as soon as is practical; the reporter is told the plan and the date |

There is **no bug bounty**. Reports are credited in the fix's commit message and in the release notes
unless the reporter prefers otherwise.

## In scope

- Authentication, session handling, and account recovery.
- Authorization: reading, editing, publishing, or deleting something that belongs to another account.
- Cross-site scripting through any field that reaches a page, feed, sitemap, or page metadata.
- Injection into the database or the mail path.
- Account takeover, including through the email token flows.
- Denial of service that is cheap for an attacker and expensive for the service.
- Exposure of secrets, environment variables, or other users' data.

## Out of scope

- Findings that require a compromised device, a compromised email account, or physical access.
- Missing headers or configuration on a preview deployment that are present in production.
- Automated scanner output with no demonstrated impact.
- Rate-limit thresholds, by themselves.
- Social engineering of the maintainer.

## Safe harbour

Good-faith research is welcome. If you stay inside the scope above, avoid privacy violations and
service disruption, and give a reasonable time to fix before disclosure, no legal action will be taken
over the research. If in doubt about a specific test, report first and ask.

## Supported versions

The project is pre-1.0 and deploys continuously from `main`. Only the current deployment is supported;
there are no maintained release branches.

## What is already known and written down

`docs/design-amendments.md` A10–A13 and `docs/FAILURE_MODES.md` record the accepted gaps, including the
CSP report-only state on cached public pages. Those are decisions, not undisclosed findings — a report
that restates one is still welcome if the reasoning is wrong.
