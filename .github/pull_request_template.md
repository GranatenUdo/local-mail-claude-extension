# Pull request

## Change

Describe the problem and resulting behavior.

## Approved plan

Link the plan, separate-agent adversarial review, and explicit maintainer approval.
For automated dependency proposals, maintainers complete this review before merge.

## Validation

List commands run, results, and any checks that remain pending.

- [ ] Documentation, type checks, synthetic tests, dependency audit, and source scan pass.
- [ ] Packaging and bundle smoke checks pass when applicable.
- [ ] Tests and examples are synthetic; no mail, credentials, certificates, or local diagnostics are included.
- [ ] Every changed file was reviewed before publication; secret scanning is not the only check.
- [ ] No mailbox mutation or weakening of TLS/DPAPI boundaries.
- [ ] Validation claims and changelog reflect what was actually verified.
- [ ] No public binary is attached without completed Desktop installation acceptance.
