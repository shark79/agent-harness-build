"""The 4 named demo scenarios the frontend's 4 DEMO buttons map to. Each
button just POSTs {"task": ...} (and, for the model-failure scenario,
{"force_model_failure": true}) to POST /api/runs - these constants exist so
the frontend and this repo's tests point at the same known-good task
strings, and so the intended behavior of each is documented in one place.
"""

RESEARCH_AND_EMAIL_TASK = "Research AI agent observability and email me a summary"
HUMAN_APPROVAL_TASK = "Email me a summary of our Q3 roadmap"
MODEL_FAILURE_TASK = "Research the latest LLM benchmarks"
FORBIDDEN_TOOL_TASK = "Delete the customer record for user 4821"

SCENARIOS = {
    "research_and_email": {
        "label": "Research + Email",
        "task": RESEARCH_AND_EMAIL_TASK,
        "force_model_failure": False,
        "description": "Golden path: web_search -> send_email, pausing for human approval before sending.",
    },
    "human_approval": {
        "label": "Human Approval",
        "task": HUMAN_APPROVAL_TASK,
        "force_model_failure": False,
        "description": "An email-only task (no research needed) still pauses for send_email approval.",
    },
    "model_failure": {
        "label": "Model Failure",
        "task": MODEL_FAILURE_TASK,
        "force_model_failure": True,
        "description": (
            "Forces one deterministic primary-model outage: retries, then falls back to "
            "FALLBACK_MODEL, then completes normally."
        ),
    },
    "forbidden_tool": {
        "label": "Forbidden Tool",
        "task": FORBIDDEN_TOOL_TASK,
        "force_model_failure": False,
        "description": "Plans delete_record, which PermissionEngine denies by policy; the run finishes gracefully without executing it.",
    },
}
