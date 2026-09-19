# Slide Deck Content

## Slide 1: Title

**Agent Control Tower**

*Observe. Govern. Evaluate. Recover.*

A minimal harness for safe, controllable AI agents.

---

## Slide 2: The Problem

**Why Agents Need Governance**

- Agents call tools without oversight
- No cost controls → unbounded spending
- No human approval → risky operations execute
- No error recovery → transient failures kill the run
- No visibility → can't debug what went wrong

*Result: AI agents are powerful but risky.*

---

## Slide 3: The Solution

**What Agent Control Tower Does**

| Capability | Benefit |
|---|---|
| **Permission Enforcement** | ALLOW / REQUIRE_APPROVAL / DENY per tool |
| **Human Approval** | Pause run, wait for decision, resume |
| **Live Tracing** | Every step recorded and streamed |
| **Auto Recovery** | Retry + fallback on transient failures |
| **Budget Control** | Token and cost limits per run |
| **Deterministic Eval** | Measure success: 6 rule-based criteria |

*Governance layer between agent and tools, no agent code changes.*

---

## Slide 4: Demo Highlights

**What You'll See**

1. **Golden Path**: web_search → send_email (pauses for approval)
2. **Retry + Fallback**: Primary model fails, switch to secondary, recover
3. **Policy Denial**: Forbidden tool blocked, run finishes gracefully

*All traced, evaluated, and measured.*

---

## Slide 5: Why It Matters

**Agent Control Tower Is**
- Minimal: Single orchestrator loop, modular components
- Real: 40 passing tests, production-ready architecture
- Safe: Policies enforced at call time, no bypasses
- Observable: Every step traced and available

**Vision**: Make autonomous agents safe by default—open-source, standards-friendly, enterprise-scale.

---

## Speaker Notes

**Slide 1**: Set the tone. Tagline: "Observe. Govern. Evaluate. Recover." — this is what the harness does.

**Slide 2**: Paint the problem. Agents are powerful but uncontrolled. No built-in guardrails. Lead into the solution.

**Slide 3**: Show the table. Each row is a harness capability and its benefit. Emphasize governance is orthogonal to reasoning (agent doesn't know it's being governed).

**Slide 4**: Preview the live demo. Three scenarios show all the key mechanics (approval, recovery, denial). Quick.

**Slide 5**: Conclude with vision and call to action. Agent Control Tower is not a toy—it's a real governance layer for real autonomous agents.

---

## Timing

| Slide | Time |
|-------|------|
| 1 (Title) | 10s |
| 2 (Problem) | 20s |
| 3 (Solution) | 30s |
| 4 (Demo Preview) | 10s |
| 5 (Vision) | 10s |
| **Total Slides** | **80 seconds** |
| **Live Demo** | **100 seconds** |
| **Q&A** | **40 seconds** |
| **Total** | **~3:20 minutes** |

(Adjust based on demo pacing.)

---

## Visual Assets

- **Slide 2**: Red warning icon or risk symbols
- **Slide 3**: Table or four colored boxes (one per capability)
- **Slide 4**: Three small screenshots or icons (search, chain link, deny sign)
- **Slide 5**: GitHub logo or "open-source" badge; vision statement
