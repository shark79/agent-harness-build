from app.demo.fixtures import search as _search


async def web_search(query: str) -> dict:
    """ALLOW / LOW risk. Deterministic fixture results - see app/demo/fixtures.py."""
    return {"query": query, "results": _search(query)}
