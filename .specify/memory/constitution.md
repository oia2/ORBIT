<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Modified principles:
  - Template Principle 1 -> I. Explicit Product Decisions
  - Template Principle 2 -> II. Design Guidance and UX Consistency
  - Template Principle 3 -> III. Simplicity and Maintainability
  - Template Principle 4 -> IV. Quality Gates
  - Template Principle 5 -> V. Controlled Evolution
- Added sections:
  - Specification and Design Authority
  - Development Workflow and Review
- Removed sections: None
- Follow-up TODOs: None
-->
# ORBIT Constitution

## Core Principles

### I. Explicit Product Decisions

Product behavior that affects user flows, data semantics, business rules, or other
observable outcomes MUST be explicitly defined before implementation. An agent MUST
NOT silently resolve ambiguity in these areas; it MUST surface the ambiguity for
clarification and record the resulting decision in the relevant specification. Small
fixes that do not alter product requirements or observable behavior MAY proceed
without a complete specification-driven development (SDD) cycle.

Rationale: implementation details must not become accidental product policy.

### II. Design Guidance and UX Consistency

Approved ORBIT Open Design prototypes and `DESIGN.md` are the primary references for
visual direction, interaction patterns, responsive behavior, and motion language.
Implementation MUST remain consistent with these references unless an explicit change
is required. The references are guidance, not infallible or exhaustive requirements:
usability problems, missing states, accessibility concerns, implementation constraints,
or updated product requirements MAY require changes. Significant deviations from an
approved design MUST be identified, approved, and reflected in the relevant source
artifact rather than introduced silently.

Rationale: consistency protects the product experience while explicit exceptions allow
the design to improve safely.

### III. Simplicity and Maintainability

Implementation MUST use the simplest solution that satisfies the current requirements.
Abstractions, architectural layers, dependencies, infrastructure, and general-purpose
mechanisms MUST NOT be introduced without a concrete current need. Clear,
understandable, and maintainable code MUST take precedence over speculative flexibility.
Architecture MUST evolve in response to validated requirements rather than anticipated
complexity.

Rationale: unnecessary flexibility increases cost and risk without delivering current
product value.

### IV. Quality Gates

Implementation MUST pass every applicable quality check configured for the project
before it is considered complete. Important product behavior and meaningful changes
MUST have appropriate automated test coverage. The technical plan MUST select the
specific tools and testing strategy, including type checking, linting, formatting,
testing, and production build validation where applicable. Final verification MUST
compare the implementation with the approved specification. Any check considered not
applicable MUST be explicitly justified in the technical plan or implementation report.

Rationale: completion requires objective evidence of correctness, consistency, and
conformance to the agreed behavior.

### V. Controlled Evolution

Significant new functionality and meaningful changes to existing product behavior MUST
be represented in a new or updated specification before implementation. Implementation
MUST NOT silently contradict an existing specification. When implementation exposes a
flaw, missing requirement, or incorrect assumption in a specification or approved
design, the relevant source artifact MUST be corrected rather than bypassed only in
code. Small bug fixes, visual corrections, refactoring, and maintenance MAY proceed
without the complete SDD workflow only when they do not alter product requirements or
observable behavior.

Rationale: specifications and approved designs must remain trustworthy records of the
product as it evolves.

## Specification and Design Authority

- The approved feature specification governs user-visible behavior, data semantics,
  business rules, and acceptance criteria.
- Approved ORBIT Open Design prototypes and `DESIGN.md` govern visual and interaction
  direction, subject to explicit product, usability, accessibility, and technical
  decisions.
- The technical plan governs implementation choices and MUST explain quality tooling,
  testing strategy, constraints, and any justified complexity.
- `tasks.md` governs implementation sequencing but MUST remain consistent with the
  specification and plan.
- When authoritative artifacts conflict or leave a significant decision ambiguous, work
  on the affected behavior MUST pause until the conflict is resolved and the appropriate
  artifact is updated.

## Development Workflow and Review

1. Classify the change before implementation as either behavior-changing or a small
   non-behavioral correction.
2. For behavior-changing work, create or update the specification, resolve material
   ambiguities, prepare the technical plan and tasks, and only then implement.
3. For small non-behavioral corrections, document the limited scope and run all
   applicable quality checks without requiring the complete SDD sequence.
4. Review MUST verify specification conformance, consistency with approved ORBIT design
   references, explicit treatment of deviations, adequate tests, successful quality
   gates, and justification for any added complexity.
5. A change is complete only when required source artifacts and implementation agree.

## Governance

This constitution is the highest authority for ORBIT's product-development process.
When another project practice conflicts with it, this constitution governs.

Amendments MUST be documented in this file, include a Sync Impact Report, receive
explicit project-owner approval, and update the version and amendment date. Versioning
follows semantic versioning: MAJOR for incompatible governance changes or principle
removals and redefinitions, MINOR for new principles or materially expanded guidance,
and PATCH for clarifications and non-semantic refinements.

Compliance MUST be reviewed during specification, planning, task generation,
implementation, and code review as applicable. Any temporary exception MUST be explicit,
scoped, justified in the relevant artifact, and accompanied by a plan to restore
compliance. Reviews MUST reject silent product decisions, undocumented design
deviations, unjustified complexity, skipped applicable quality gates, and implementation
that contradicts approved specifications.

**Version**: 1.0.0 | **Ratified**: 2026-08-09 | **Last Amended**: 2026-08-09
