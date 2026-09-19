from app.agent.demo_agent import DemoAgentAdapter


async def test_email_task_plans_search_then_email_then_done():
    adapter = DemoAgentAdapter()
    step1 = await adapter.run("Research AI agent observability and email me a summary", {})
    assert step1.kind == "tool_call"
    assert step1.tool_name == "web_search"

    step2 = await adapter.resume("run-1", {"query": "x", "results": [{"title": "T", "url": "u", "snippet": "S"}]})
    assert step2.kind == "tool_call"
    assert step2.tool_name == "send_email"
    assert "S" in step2.tool_args["body"]  # summary built from search results

    step3 = await adapter.resume("run-1", {"status": "sent", "mode": "demo"})
    assert step3.kind == "done"


async def test_denied_email_finishes_gracefully_without_retrying():
    adapter = DemoAgentAdapter()
    await adapter.run("Research things and email me", {})
    await adapter.resume("run-1", {"query": "x", "results": []})
    step = await adapter.resume("run-1", {"error": "denied", "tool": "send_email"})
    assert step.kind == "done"
    assert "denied" in step.result_text.lower() or "not sent" in step.result_text.lower()


async def test_calculate_task_plans_calculator_then_done():
    adapter = DemoAgentAdapter()
    step1 = await adapter.run("calculate 12 * (3 + 4)", {})
    assert step1.kind == "tool_call"
    assert step1.tool_name == "calculator"

    step2 = await adapter.resume("run-2", {"expression": "12 * (3 + 4)", "result": 84})
    assert step2.kind == "done"
    assert "84" in step2.result_text


async def test_research_only_task_plans_single_search_then_done():
    adapter = DemoAgentAdapter()
    step1 = await adapter.run("research the latest LLM benchmarks", {})
    assert step1.kind == "tool_call"
    assert step1.tool_name == "web_search"

    step2 = await adapter.resume("run-3", {"query": "x", "results": []})
    assert step2.kind == "done"


async def test_generic_task_produces_canned_completion_with_no_tools():
    adapter = DemoAgentAdapter()
    step = await adapter.run("say hello", {})
    assert step.kind == "done"
    assert step.result_text


def test_usage_is_proportional_to_task_length():
    adapter = DemoAgentAdapter()
    import asyncio

    asyncio.run(adapter.run("short task", {}))
    short_usage = adapter.get_usage()

    adapter2 = DemoAgentAdapter()
    asyncio.run(adapter2.run("a much much much longer task description with many more words in it", {}))
    long_usage = adapter2.get_usage()

    assert long_usage.total_tokens > short_usage.total_tokens
    assert short_usage.total_tokens > 0
