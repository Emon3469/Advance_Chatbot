import io
import json
import logging
import re
import shutil
import threading
import time
from pathlib import Path

import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from rank_bm25 import BM25Plus

from .config import settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".csv", ".json"}
_TOKEN_RE = re.compile(r"[a-z0-9]+")


class DocumentError(ValueError):
    pass


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _extract_pages(filename: str, data: bytes) -> list[tuple[int, str]]:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise DocumentError(
            f"Unsupported file type '{suffix or filename}'. "
            f"Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    if suffix == ".pdf":
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
        except Exception as exc:
            raise DocumentError(f"Could not read PDF: {exc}") from exc
    else:
        pages = [(1, data.decode("utf-8", errors="ignore"))]

    pages = [(number, text.strip()) for number, text in pages if text and text.strip()]
    if not pages:
        raise DocumentError("No readable text was found in this file.")
    return pages


class _Embedder:
    def __init__(self):
        self._client = None
        if settings.openai_api_key:
            from langchain_openai import OpenAIEmbeddings

            self._client = OpenAIEmbeddings(
                model=settings.openai_embedding_model,
                api_key=settings.openai_api_key,
                timeout=30,
                max_retries=1,
            )

    @property
    def model(self) -> str | None:
        return settings.openai_embedding_model if self._client else None

    def embed_documents(self, texts: list[str]) -> np.ndarray | None:
        if not self._client:
            return None
        try:
            return self._normalize(np.array(self._client.embed_documents(texts), dtype=np.float32))
        except Exception as exc:
            logger.warning("Embedding documents failed, keyword search only: %s", exc)
            return None

    def embed_query(self, text: str) -> np.ndarray | None:
        if not self._client:
            return None
        try:
            return self._normalize(np.array([self._client.embed_query(text)], dtype=np.float32))[0]
        except Exception as exc:
            logger.warning("Embedding query failed, keyword search only: %s", exc)
            return None

    @staticmethod
    def _normalize(matrix: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return matrix / norms


class DocumentStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._embedder = _Embedder()
        self._splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[int, list[dict], BM25Plus, np.ndarray | None]] = {}

    def _dir(self, thread_id: str) -> Path:
        return self.root / thread_id

    def _read_meta(self, thread_id: str) -> dict:
        path = self._dir(thread_id) / "meta.json"
        if not path.exists():
            return {"files": [], "embedding_model": None}
        return json.loads(path.read_text(encoding="utf-8"))

    def _read_chunks(self, thread_id: str) -> list[dict]:
        path = self._dir(thread_id) / "chunks.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []

    def _read_vectors(self, thread_id: str) -> np.ndarray | None:
        path = self._dir(thread_id) / "vectors.npy"
        return np.load(path) if path.exists() else None

    def has_documents(self, thread_id: str) -> bool:
        return (self._dir(thread_id) / "chunks.json").exists()

    def list_files(self, thread_id: str) -> list[dict]:
        return self._read_meta(thread_id)["files"]

    def ingest(self, thread_id: str, filename: str, data: bytes) -> dict:
        pages = _extract_pages(filename, data)
        new_chunks = [
            {"text": chunk, "source": filename, "page": number}
            for number, text in pages
            for chunk in self._splitter.split_text(text)
        ]

        with self._lock:
            folder = self._dir(thread_id)
            folder.mkdir(parents=True, exist_ok=True)
            meta = self._read_meta(thread_id)
            existing = self._read_chunks(thread_id)
            keep = [i for i, c in enumerate(existing) if c["source"] != filename]
            chunks = [existing[i] for i in keep]
            meta["files"] = [f for f in meta["files"] if f["name"] != filename]

            vectors = None
            if self._embedder.model:
                old_vectors = self._read_vectors(thread_id)
                reusable = (
                    old_vectors is not None
                    and len(old_vectors) == len(existing)
                    and meta.get("embedding_model") == self._embedder.model
                )
                to_embed = new_chunks if reusable else chunks + new_chunks
                fresh = self._embedder.embed_documents([c["text"] for c in to_embed])
                if fresh is not None:
                    vectors = np.vstack([old_vectors[keep], fresh]) if reusable and keep else fresh

            chunks.extend(new_chunks)
            (folder / "chunks.json").write_text(json.dumps(chunks), encoding="utf-8")

            vector_path = folder / "vectors.npy"
            if vectors is not None and len(vectors) == len(chunks):
                np.save(vector_path, vectors)
                meta["embedding_model"] = self._embedder.model
            elif vector_path.exists():
                vector_path.unlink()
                meta["embedding_model"] = None

            record = {
                "name": filename,
                "pages": len(pages),
                "chunks": len(new_chunks),
                "size": len(data),
                "uploaded_at": int(time.time()),
            }
            meta["files"].append(record)
            (folder / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
            self._cache.pop(thread_id, None)

        return record

    def _load(self, thread_id: str):
        chunks = self._read_chunks(thread_id)
        cached = self._cache.get(thread_id)
        if cached and cached[0] == len(chunks):
            return cached
        bm25 = BM25Plus([_tokenize(c["text"]) or ["_"] for c in chunks]) if chunks else None
        vectors = self._read_vectors(thread_id)
        if vectors is not None and len(vectors) != len(chunks):
            vectors = None
        entry = (len(chunks), chunks, bm25, vectors)
        self._cache[thread_id] = entry
        return entry

    def search(self, thread_id: str, query: str, k: int = 4) -> list[dict]:
        _, chunks, bm25, vectors = self._load(thread_id)
        if not chunks:
            return []

        keyword = np.array(bm25.get_scores(_tokenize(query)), dtype=np.float32)
        if keyword.max() > 0:
            keyword = keyword / keyword.max()

        scores = keyword
        if vectors is not None:
            query_vector = self._embedder.embed_query(query)
            if query_vector is not None:
                semantic = vectors @ query_vector
                scores = 0.65 * semantic + 0.35 * keyword

        top = np.argsort(scores)[::-1][:k]
        return [{**chunks[i], "score": round(float(scores[i]), 4)} for i in top]

    def delete_thread(self, thread_id: str) -> None:
        with self._lock:
            self._cache.pop(thread_id, None)
            shutil.rmtree(self._dir(thread_id), ignore_errors=True)


documents = DocumentStore(settings.index_dir)
