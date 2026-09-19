# Judge questions

**Does the agent run on TrueForge?**

With `HARNESS_PROVIDER=trueforge`, the backend uses the official Python SDK to create a saved-agent session and submit turns. The UI shows its session ID. The offline provider is a separate demonstration and is not submission evidence.

**What is the finished job?**

Research a topic, create a sourced briefing, and deliver it through a configured real MCP tool after approval. Verify receipt and the provider's message identifier. Setup alone does not establish successful delivery.

**Where is approval enforced?**

In the saved TrueForge agent's `require_approval_for_tools` configuration. The custom UI collects a decision for each pending tool call and submits `user.tool_approval` responses to TrueForge. Prompt instructions complement, but do not replace, the gate.

**What survives a refresh or bridge restart?**

The bridge persists the TrueForge session ID, turn ID, and pending decisions. It replays the remote session history when the run is selected again. TrueForge owns execution; restart recovery of the TrueForge server itself should be demonstrated separately.

**Which harness features are used?**

MCP and approval gates are central. The recipe enables dynamic subagents, deferred loading, context compaction, and an iteration limit. Sandbox, skills, and large-response offloading are opt-in once configured. Show actual events before claiming any feature was exercised.

**Is this production ready?**

No. The bridge is a local/private single-worker integration without application authentication. Native questions/OAuth/artifacts are handled in TrueForge. A hosted system needs authenticated access, scoped identities, operational validation, and deployment hardening.

**How are runs evaluated?**

The offline evaluator validates selected simulated trace patterns. It is disabled for TrueForge runs; real-job evidence is the actual tool trace, approval ordering, sourced artifact, and verified delivery.
