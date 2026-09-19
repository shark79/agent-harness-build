# Submission preparation: Agent Control Tower

**Job:** research a topic and deliver a sourced briefing after human approval.

**Runtime:** TrueForge 0.2.0, connected through its official Python SDK. A custom dashboard exposes remote execution history and approval arguments. The separate offline demo is not the qualifying challenge run.

## Implemented integration

- Named-agent sessions and non-streaming remote turns.
- Persistent session/turn linkage and paginated event replay.
- TrueForge approval responses, including multiple pending calls.
- Native session handoff for questions, OAuth, and artifacts.
- Resource-validation and agent-registration commands.
- Optional sandbox, skills, subagents, deferred tool loading, and context management in the agent recipe.

## Required evidence before submitting

- [ ] Follow [TRUEFORGE_SETUP.md](../TRUEFORGE_SETUP.md) from a fresh clone.
- [ ] Configure actual model/search/delivery resources.
- [ ] Demonstrate real tool results and successful delivery to a test recipient.
- [ ] Demonstrate the TrueForge approval pause and a denial that prevents delivery.
- [ ] If claiming sandbox/skills/subagents, show their native events and outputs.
- [ ] Verify repository public accessibility and replace any remaining placeholder links.
- [ ] Inspect tracked files, Git history, screenshots, and video for secrets/personal data.
- [ ] Record approximately three minutes showing the completed job.

Passing mock-backed integration tests does not prove live delivery or establish production readiness. No public deployment or final video is claimed by this file.
