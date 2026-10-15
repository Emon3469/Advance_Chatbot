import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


_PLACEHOLDERS = ("your_", "your-", "<", "changeme", "replace")


def _env(name: str, default: str = "") -> str:
    value = (os.getenv(name) or "").strip().strip('"').strip("'")
    if not value or value.lower().startswith(_PLACEHOLDERS):
        return default
    return value


def _env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in _env(name, default).split(",") if item.strip()]


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str = _env("APP_NAME", "Nexio AI")
    app_version: str = _env("APP_VERSION", "4.3.0")

    openai_api_key: str = _env("OPENAI_API_KEY")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4.1-mini")
    openai_embedding_model: str = _env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    anthropic_api_key: str = _env("ANTHROPIC_API_KEY")
    anthropic_model: str = _env("ANTHROPIC_MODEL", "claude-haiku-5-5")

    groq_api_key: str = _env("GROQ_API_KEY")
    groq_model: str = _env("GROQ_MODEL", "openai/gpt-oss-120b")
    groq_backup_model: str = _env("GROQ_BACKUP_MODEL", "openai/gpt-oss-20b")

    provider_order: list[str] = field(
        default_factory=lambda: _env_list("LLM_PROVIDER_ORDER", "openai,anthropic,groq,groq_backup")
    )
    temperature: float = _env_float("LLM_TEMPERATURE", 0.6)
    max_tokens: int = _env_int("LLM_MAX_TOKENS", 2048)
    request_timeout: float = _env_float("LLM_TIMEOUT_SECONDS", 45)
    history_window: int = _env_int("CHAT_HISTORY_WINDOW", 24)
    history_token_budget: int = _env_int("CHAT_HISTORY_TOKENS", 3000)

    tavily_api_key: str = _env("TAVILY_API_KEY")
    openweather_api_key: str = _env("OPENWEATHER_API_KEY") or _env("OPENWEATHERMAP_API_KEY")
    alphavantage_api_key: str = _env("ALPHAVANTAGE_API_KEY")

    data_dir: Path = Path(_env("DATA_DIR", str(BASE_DIR / "data")))
    max_upload_mb: int = _env_int("MAX_UPLOAD_MB", 15)

    cors_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        )
    )
    cors_origin_regex: str = _env("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "chatbot.db"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "indexes"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.index_dir.mkdir(parents=True, exist_ok=True)
