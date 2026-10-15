import ast
import asyncio
import logging
import math
import operator
from typing import Any

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.types import interrupt

from .config import settings
from .rag import documents

logger = logging.getLogger(__name__)

_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=5.0),
            headers={"User-Agent": "Mozilla/5.0 (compatible; NexioBot/1.0)"},
            follow_redirects=True,
        )
    return _http


async def close_http() -> None:
    if _http is not None and not _http.is_closed:
        await _http.aclose()


_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_FUNCTIONS = {
    name: getattr(math, name)
    for name in (
        "sqrt", "log", "log10", "log2", "exp", "sin", "cos", "tan", "asin", "acos",
        "atan", "sinh", "cosh", "tanh", "floor", "ceil", "factorial", "radians",
        "degrees", "gcd", "lcm", "hypot",
    )
}
_FUNCTIONS.update({"abs": abs, "round": round, "min": min, "max": max})
_CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def _evaluate(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in _CONSTANTS:
        return _CONSTANTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left, right = _evaluate(node.left), _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 1000:
            raise ValueError("Exponent too large")
        return _BIN_OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_evaluate(node.operand))
    if isinstance(node, ast.Call):
        name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", None)
        if isinstance(node.func, ast.Attribute) and getattr(node.func.value, "id", None) != "math":
            raise ValueError("Unsupported function")
        if name in _FUNCTIONS:
            return _FUNCTIONS[name](*[_evaluate(arg) for arg in node.args])
    raise ValueError("Unsupported expression")


@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression, e.g. '(12.5 * 4) / 3', 'sqrt(144) + 2**8', 'log(100, 10)'."""
    try:
        cleaned = expression.replace("^", "**").replace("×", "*").replace("÷", "/")
        result = _evaluate(ast.parse(cleaned, mode="eval"))
        if isinstance(result, float) and result.is_integer():
            result = int(result)
        return f"{expression} = {result}"
    except ZeroDivisionError:
        return "Calculation error: division by zero"
    except Exception as exc:
        return f"Calculation error: {exc}"


async def _tavily_search(query: str, max_results: int) -> list[dict]:
    response = await http().post(
        "https://api.tavily.com/search",
        headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
        json={"query": query, "max_results": max_results, "search_depth": "basic"},
    )
    response.raise_for_status()
    return [
        {"title": r.get("title"), "url": r.get("url"), "content": r.get("content")}
        for r in response.json().get("results", [])
    ]


def _ddg_search(query: str, max_results: int) -> list[dict]:
    from ddgs import DDGS

    return [
        {"title": r.get("title"), "url": r.get("href"), "content": r.get("body")}
        for r in DDGS().text(query, max_results=max_results)
    ]


@tool
async def web_search(query: str) -> str:
    """Search the internet for current events, news, facts or anything that needs up-to-date information."""
    results: list[dict] = []
    if settings.tavily_api_key:
        try:
            results = await _tavily_search(query, 5)
        except Exception as exc:
            logger.warning("Tavily search failed: %s", exc)
    if not results:
        try:
            results = await asyncio.wait_for(asyncio.to_thread(_ddg_search, query, 5), timeout=15)
        except Exception as exc:
            logger.warning("DuckDuckGo search failed: %s", exc)
    if not results:
        return "Web search is temporarily unavailable. Answer from your own knowledge and say so."
    return "\n\n".join(
        f"[{i}] {r['title']}\nURL: {r['url']}\n{(r['content'] or '')[:700]}"
        for i, r in enumerate(results, start=1)
    )


async def _alphavantage_quote(symbol: str) -> dict | None:
    if not settings.alphavantage_api_key:
        return None
    response = await http().get(
        "https://www.alphavantage.co/query",
        params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": settings.alphavantage_api_key},
    )
    response.raise_for_status()
    quote = response.json().get("Global Quote") or {}
    if not quote.get("05. price"):
        return None
    return {
        "symbol": quote.get("01. symbol", symbol),
        "price": float(quote["05. price"]),
        "change": quote.get("09. change"),
        "change_percent": quote.get("10. change percent"),
        "open": quote.get("02. open"),
        "high": quote.get("03. high"),
        "low": quote.get("04. low"),
        "volume": quote.get("06. volume"),
        "latest_trading_day": quote.get("07. latest trading day"),
        "source": "Alpha Vantage",
    }


async def _yahoo_quote(symbol: str) -> dict | None:
    response = await http().get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"interval": "1d", "range": "5d"},
    )
    response.raise_for_status()
    result = (response.json().get("chart", {}).get("result") or [None])[0]
    if not result:
        return None
    meta = result.get("meta", {})
    price = meta.get("regularMarketPrice")
    previous = meta.get("chartPreviousClose") or meta.get("previousClose")
    if price is None:
        return None
    change = round(price - previous, 4) if previous else None
    return {
        "symbol": meta.get("symbol", symbol),
        "price": price,
        "currency": meta.get("currency"),
        "change": change,
        "change_percent": f"{round(change / previous * 100, 2)}%" if change is not None else None,
        "day_high": meta.get("regularMarketDayHigh"),
        "day_low": meta.get("regularMarketDayLow"),
        "exchange": meta.get("exchangeName"),
        "source": "Yahoo Finance",
    }


@tool
async def get_stock_price(symbol: str) -> dict:
    """Get the latest stock quote for a ticker symbol such as AAPL, MSFT or TSLA."""
    symbol = symbol.strip().upper()
    for fetch in (_alphavantage_quote, _yahoo_quote):
        try:
            quote = await fetch(symbol)
            if quote:
                return quote
        except Exception as exc:
            logger.warning("%s failed for %s: %s", fetch.__name__, symbol, exc)
    return {"error": f"Could not fetch a quote for '{symbol}'. Check the ticker symbol."}


@tool
async def purchase_stock(symbol: str, quantity: int) -> dict:
    """Place a simulated purchase order for a stock. The user must approve before it executes."""
    symbol = symbol.strip().upper()
    decision = interrupt(f"Approve buying {quantity} share(s) of {symbol}?")
    approved = str(decision).strip().lower() in {"yes", "y", "approve", "approved", "true"}
    if approved:
        return {
            "status": "success",
            "message": f"Simulated purchase order placed for {quantity} share(s) of {symbol}.",
            "symbol": symbol,
            "quantity": quantity,
        }
    return {
        "status": "cancelled",
        "message": f"Purchase of {quantity} share(s) of {symbol} was cancelled by the user.",
        "symbol": symbol,
        "quantity": quantity,
    }


_WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog",
    48: "Depositing rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers",
    81: "Showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
}


async def _openweather(location: str) -> str | None:
    if not settings.openweather_api_key:
        return None
    client = http()
    geo = await client.get(
        "https://api.openweathermap.org/geo/1.0/direct",
        params={"q": location, "limit": 1, "appid": settings.openweather_api_key},
    )
    geo.raise_for_status()
    places = geo.json()
    if not places:
        return None
    place = places[0]
    weather = await client.get(
        "https://api.openweathermap.org/data/2.5/weather",
        params={"lat": place["lat"], "lon": place["lon"], "appid": settings.openweather_api_key, "units": "metric"},
    )
    weather.raise_for_status()
    data = weather.json()
    name = ", ".join(p for p in (place.get("name"), place.get("state"), place.get("country")) if p)
    visibility = data.get("visibility")
    return (
        f"Current weather in {name}:\n"
        f"- Condition: {data['weather'][0]['description'].title()}\n"
        f"- Temperature: {data['main']['temp']}°C (feels like {data['main']['feels_like']}°C)\n"
        f"- Humidity: {data['main']['humidity']}%\n"
        f"- Pressure: {data['main']['pressure']} hPa\n"
        f"- Wind speed: {data.get('wind', {}).get('speed', 'N/A')} m/s\n"
        f"- Visibility: {round(visibility / 1000, 1) if visibility is not None else 'N/A'} km"
    )


async def _open_meteo(location: str) -> str | None:
    client = http()
    geo = await client.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": location.split(",")[0].strip(), "count": 1},
    )
    geo.raise_for_status()
    places = geo.json().get("results") or []
    if not places:
        return None
    place = places[0]
    weather = await client.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
            "weather_code,wind_speed_10m,surface_pressure",
            "wind_speed_unit": "ms",
        },
    )
    weather.raise_for_status()
    now = weather.json()["current"]
    name = ", ".join(p for p in (place.get("name"), place.get("admin1"), place.get("country")) if p)
    return (
        f"Current weather in {name}:\n"
        f"- Condition: {_WEATHER_CODES.get(now.get('weather_code'), 'Unknown')}\n"
        f"- Temperature: {now['temperature_2m']}°C (feels like {now['apparent_temperature']}°C)\n"
        f"- Humidity: {now['relative_humidity_2m']}%\n"
        f"- Pressure: {now['surface_pressure']} hPa\n"
        f"- Wind speed: {now['wind_speed_10m']} m/s"
    )


@tool
async def get_current_weather(location: str) -> str:
    """Get the current weather for a city or place, e.g. 'Dhaka', 'London, UK'."""
    for fetch in (_openweather, _open_meteo):
        try:
            report = await fetch(location)
            if report:
                return report
        except Exception as exc:
            logger.warning("%s failed for %s: %s", fetch.__name__, location, exc)
    return f"Could not find weather for '{location}'."


@tool
async def search_documents(query: str, config: RunnableConfig) -> str:
    """Search the documents the user uploaded in this conversation and return the most relevant passages."""
    thread_id = config.get("configurable", {}).get("thread_id")
    if not thread_id or not documents.has_documents(thread_id):
        return "No documents have been uploaded in this conversation. Ask the user to upload one."
    hits = await asyncio.to_thread(documents.search, thread_id, query, 4)
    if not hits:
        return "No relevant passages were found in the uploaded documents."
    return "\n\n".join(
        f"[{i}] {hit['source']} (page {hit['page']})\n{hit['text']}"
        for i, hit in enumerate(hits, start=1)
    )


TOOLS = [web_search, calculator, get_stock_price, purchase_stock, get_current_weather, search_documents]

TOOL_LABELS: dict[str, Any] = {
    "web_search": "Searching the web",
    "calculator": "Calculating",
    "get_stock_price": "Fetching stock price",
    "purchase_stock": "Preparing order",
    "get_current_weather": "Checking weather",
    "search_documents": "Reading your documents",
}
