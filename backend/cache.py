"""
cache.py — Intelligent in-memory and disk caching for CodeDNA.
"""
import os
import shelve
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() == "true"
CACHE_TTL_HOURS = float(os.getenv("CACHE_TTL_HOURS", "24"))
CACHE_TTL_SECONDS = CACHE_TTL_HOURS * 3600

CACHE_FILE = os.path.join(os.path.dirname(__file__), "codedna_cache")

@dataclass
class CacheEntry:
    result_dict: dict[str, Any]
    reasoning_text: str
    model_used: str
    provider: str
    cached_at: float

class AnalysisCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._memory_cache: dict[str, CacheEntry] = {}
        
        # Pre-load from disk if enabled
        if CACHE_ENABLED:
            try:
                with shelve.open(CACHE_FILE, 'c') as db:
                    for key, val in db.items():
                        # Validate TTL
                        if time.time() - val.cached_at <= CACHE_TTL_SECONDS:
                            self._memory_cache[key] = val
            except Exception as e:
                print(f"Warning: Failed to load cache from disk: {e}")

    def get(self, key: str) -> Optional[CacheEntry]:
        if not CACHE_ENABLED:
            return None
            
        with self._lock:
            entry = self._memory_cache.get(key)
            if not entry:
                return None
                
            # Check TTL
            if time.time() - entry.cached_at > CACHE_TTL_SECONDS:
                del self._memory_cache[key]
                # Also remove from disk
                try:
                    with shelve.open(CACHE_FILE, 'c') as db:
                        if key in db:
                            del db[key]
                except Exception:
                    pass
                return None
                
            return entry

    def set(self, key: str, result_dict: dict[str, Any], reasoning_text: str, model_used: str, provider: str) -> None:
        if not CACHE_ENABLED:
            return
            
        entry = CacheEntry(
            result_dict=result_dict,
            reasoning_text=reasoning_text,
            model_used=model_used,
            provider=provider,
            cached_at=time.time()
        )
        
        with self._lock:
            self._memory_cache[key] = entry
            try:
                with shelve.open(CACHE_FILE, 'c') as db:
                    db[key] = entry
            except Exception as e:
                print(f"Warning: Failed to save cache to disk: {e}")

# Global singleton
cache = AnalysisCache()
