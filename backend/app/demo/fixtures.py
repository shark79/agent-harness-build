"""Canned web_search results, keyed by substring match on the query.

No external search credentials exist in this environment, and web_search must
never fail because of that - so results are deterministic fixtures rather
than a live API call. Good enough for a hackathon demo; swap for a real
search API client behind the same `web_search(query=...)` signature later.
"""

_FIXTURES: dict[str, list[dict]] = {
    "openai": [
        {"title": "OpenAI - Research and products", "url": "https://openai.com", "snippet": "OpenAI develops GPT models, ChatGPT, and API tooling for building AI applications."},
        {"title": "OpenAI API platform docs", "url": "https://platform.openai.com/docs", "snippet": "Documentation for the OpenAI API including chat completions and function calling."},
    ],
    "anthropic": [
        {"title": "Anthropic - Claude", "url": "https://anthropic.com", "snippet": "Anthropic builds Claude, focused on AI safety research and reliable, steerable AI systems."},
        {"title": "Claude docs", "url": "https://docs.anthropic.com", "snippet": "Guides for the Claude API, prompting, and agentic tool use."},
    ],
    "gemini": [
        {"title": "Google Gemini", "url": "https://deepmind.google/technologies/gemini", "snippet": "Gemini is Google DeepMind's family of multimodal AI models."},
    ],
    "agent observability": [
        {"title": "Observability for AI agents", "url": "https://example.com/agent-observability", "snippet": "Agent observability covers tracing tool calls, model decisions, latency, and cost per run so operators can audit and debug agent behavior."},
        {"title": "Tracing and evals for LLM agents", "url": "https://example.com/agent-tracing", "snippet": "Structured trace events (started/completed per step) plus automated evaluation criteria are the two pillars of agent observability."},
    ],
}

_GENERIC_FALLBACK = [
    {"title": "Search result", "url": "https://example.com/search", "snippet": "General information related to the query. (Demo fixture - no live search credentials configured.)"},
]


def search(query: str) -> list[dict]:
    q = query.lower()
    for key, results in _FIXTURES.items():
        if key in q:
            return results
    return _GENERIC_FALLBACK
