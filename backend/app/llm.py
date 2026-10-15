import logging
import time
from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool

from .config import settings

logger = logging.getLogger(__name__)

PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "groq": "Groq",
    "groq_backup": "Groq Lite",
}


_HARD_FAILURES = ("401", "403", "404", "credit", "billing", "invalid_api_key", "not_found", "permission", "quota")
HARD_COOLDOWN_SECONDS = 300
RATE_LIMIT_COOLDOWN_SECONDS = 60
SOFT_COOLDOWN_SECONDS = 20


class NoProviderConfigured(RuntimeError):
    pass


def friendly_error(exc: BaseException) -> str:
    text = f"{type(exc).__name__} {exc}".lower()
    if "ratelimit" in text or "rate limit" in text or "429" in text:
        return "All AI models are busy right now (rate limit reached). Please try again in a few seconds."
    if "timeout" in text or "timed out" in text:
        return "The AI models took too long to respond. Please try again."
    if any(k in text for k in ("401", "403", "authentication", "invalid_api_key", "credit", "billing")):
        return "The AI providers rejected the request. Please check the API keys and account credits."
    if "connect" in text or "network" in text:
        return "Could not reach the AI providers. Please check the internet connection and try again."
    return "Something went wrong while generating the answer. Please try again."


def _build_openai() -> BaseChatModel | None:
    if not settings.openai_api_key:
        return None
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.request_timeout,
        max_retries=1,
        streaming=True,
    )


def _build_anthropic() -> BaseChatModel | None:
    if not settings.anthropic_api_key:
        return None
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=settings.anthropic_model,
        api_key=settings.anthropic_api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        default_request_timeout=settings.request_timeout,
        max_retries=1,
        streaming=True,
    )


def _build_groq(model: str | None = None) -> BaseChatModel | None:
    if not settings.groq_api_key or not (model or settings.groq_model):
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=model or settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.request_timeout,
        max_retries=1,
        streaming=True,
    )


_BUILDERS = {
    "openai": (_build_openai, lambda: settings.openai_model),
    "anthropic": (_build_anthropic, lambda: settings.anthropic_model),
    "groq": (_build_groq, lambda: settings.groq_model),
    "groq_backup": (lambda: _build_groq(settings.groq_backup_model), lambda: settings.groq_backup_model),
}


class ModelRouter:
    def __init__(self, tools: Sequence[BaseTool]):
        order = [name for name in settings.provider_order if name in _BUILDERS]
        order += [name for name in _BUILDERS if name not in order]
        self._order = order
        self._bound: dict[str, Runnable] = {}
        self._cooldown_until: dict[str, float] = {}

        for name in order:
            builder, _ = _BUILDERS[name]
            try:
                model = builder()
            except Exception as exc:
                logger.warning("Could not initialise %s: %s", name, exc)
                continue
            if model is None:
                continue
            self._bound[name] = (
                model.bind_tools(list(tools))
                .with_config(metadata={"provider": name}, run_name=f"{name}_chat")
                .with_listeners(on_error=self._error_listener(name))
            )

        if self._bound:
            logger.info("LLM providers ready: %s", ", ".join(self._bound))
        else:
            logger.warning("No LLM provider keys found; chat requests will fail")

    def _error_listener(self, name: str):
        def on_error(run) -> None:
            message = str(getattr(run, "error", "")).lower()
            if "ratelimit" in message or "rate limit" in message or "429" in message:
                pause = RATE_LIMIT_COOLDOWN_SECONDS
            elif any(marker in message for marker in _HARD_FAILURES):
                pause = HARD_COOLDOWN_SECONDS
            else:
                pause = SOFT_COOLDOWN_SECONDS
            self._cooldown_until[name] = time.monotonic() + pause
            logger.warning("%s failed, skipping it for %ss: %s", name, pause, message[:200])

        return on_error

    def _healthy(self, name: str) -> bool:
        return self._cooldown_until.get(name, 0) <= time.monotonic()

    @property
    def available(self) -> list[str]:
        return list(self._bound)

    def describe(self) -> list[dict]:
        return [
            {
                "id": name,
                "label": PROVIDER_LABELS[name],
                "model": _BUILDERS[name][1](),
                "available": name in self._bound,
                "healthy": name in self._bound and self._healthy(name),
            }
            for name in self._order
        ]

    def chain(self, preferred: str | None = None) -> Runnable:
        if not self._bound:
            raise NoProviderConfigured(
                "No language model is configured. Add at least one of "
                "OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY."
            )
        order = [name for name in self._bound if self._healthy(name)] or list(self._bound)
        if preferred in order:
            order.remove(preferred)
            order.insert(0, preferred)
        primary, *fallbacks = (self._bound[name] for name in order)
        return primary.with_fallbacks(fallbacks) if fallbacks else primary
