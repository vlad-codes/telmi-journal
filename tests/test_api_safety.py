import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import Request
from fastapi import HTTPException
from fastapi.responses import PlainTextResponse

import api


class DataDirectoryTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.original_paths = {
            "MEMORY_FILE": api.MEMORY_FILE,
            "NOTES_FILE": api.NOTES_FILE,
            "RECENT_BRIEF_FILE": api.RECENT_BRIEF_FILE,
            "CHARACTER_PROMPT_FILE": api.CHARACTER_PROMPT_FILE,
            "BACKUP_DIR": api.BACKUP_DIR,
        }
        api.MEMORY_FILE = str(self.root / "memory.json")
        api.NOTES_FILE = str(self.root / "notes.json")
        api.RECENT_BRIEF_FILE = str(self.root / "recent_brief.txt")
        api.CHARACTER_PROMPT_FILE = str(self.root / "character_prompt.txt")
        api.BACKUP_DIR = str(self.root / ".telmi-backups")

    def tearDown(self):
        for name, value in self.original_paths.items():
            setattr(api, name, value)
        self.temp_dir.cleanup()

    def test_atomic_write_keeps_previous_version_as_backup(self):
        first = [{"timestamp": "2026-08-09 10:00:00", "title": "One", "summary": "A"}]
        second = [{"timestamp": "2026-08-09 11:00:00", "title": "Two", "summary": "B"}]

        self.assertTrue(api.save_memory_json(first))
        self.assertTrue(api.save_memory_json(second))

        self.assertEqual(api.load_memory_json(), second)
        backup = Path(api.BACKUP_DIR) / "memory.json.bak"
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["entries"], first)

    def test_corrupt_journal_is_not_treated_as_empty(self):
        memory_path = Path(api.MEMORY_FILE)
        memory_path.write_text("{not valid json", encoding="utf-8")

        with self.assertRaisesRegex(RuntimeError, "Cannot read journal data safely"):
            api.load_memory_json()

        self.assertEqual(memory_path.read_text(encoding="utf-8"), "{not valid json")

    def test_archive_reads_json_when_search_index_is_unavailable(self):
        entry = {
            "timestamp": "2026-08-09 10:00:00",
            "title": "Durable",
            "summary": "Saved without an embedding",
            "history": [{"role": "user", "content": "hello"}],
        }
        self.assertTrue(api.save_memory_json([entry]))

        with patch.object(api, "get_collection", side_effect=RuntimeError("index unavailable")):
            result = api.get_all_entries()

        self.assertEqual(result[0]["title"], "Durable")
        self.assertTrue(result[0]["has_chat"])

    def test_delete_does_not_remove_canonical_entry_if_index_cleanup_fails(self):
        entry = {
            "timestamp": "2026-08-09 10:00:00",
            "title": "Keep me",
            "summary": "Deletion must be complete",
        }
        self.assertTrue(api.save_memory_json([entry]))

        with patch.object(api, "delete_entry_from_chroma", return_value=False):
            with self.assertRaises(HTTPException):
                api.delete_entry(entry["timestamp"])

        self.assertEqual(api.load_memory_json(), [entry])

    def test_successful_explicit_delete_purges_the_private_backup(self):
        entry = {
            "timestamp": "2026-08-09 10:00:00",
            "title": "Delete me",
            "summary": "Private",
        }
        self.assertTrue(api.save_memory_json([entry]))

        with patch.object(api, "delete_entry_from_chroma", return_value=True):
            api.delete_entry(entry["timestamp"])

        self.assertEqual(api.load_memory_json(), [])
        self.assertFalse((Path(api.BACKUP_DIR) / "memory.json.bak").exists())


class ApiBoundaryTestCase(unittest.TestCase):
    def test_ollama_client_uses_loopback_not_server_bind_environment(self):
        self.assertEqual(api.OLLAMA_API_HOST, "http://127.0.0.1:11434")

    def test_embedding_model_is_not_offered_for_chat(self):
        self.assertFalse(api.is_chat_model("nomic-embed-text:latest"))
        self.assertTrue(api.is_chat_model("llama3.2:3b"))

    def test_model_pull_is_post_only(self):
        route = next(route for route in api.app.routes if route.path == "/pull-model")
        self.assertEqual(route.methods, {"POST"})

    def test_save_reports_failure_when_canonical_journal_write_fails(self):
        request = api.SaveRequest(
            mode="day",
            selected_model="llama3.2:3b",
            history=[api.ChatMessage(role="user", content="A journal entry")],
        )
        summary_response = {"message": {"content": "TITLE: Test\nSUMMARY: You wrote a test."}}

        with (
            patch.object(api.ollama, "chat", return_value=summary_response),
            patch.object(api, "load_memory_json", return_value=[]),
            patch.object(api, "save_memory_json", return_value=False),
            patch.object(api, "save_entry_to_chroma") as index_write,
        ):
            with self.assertRaises(HTTPException) as raised:
                api.save_session(request)

        self.assertEqual(raised.exception.status_code, 500)
        index_write.assert_not_called()

    def test_untrusted_browser_origin_is_rejected_before_route(self):
        scope = {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "path": "/notes",
            "raw_path": b"/notes",
            "query_string": b"",
            "headers": [(b"origin", b"https://attacker.example")],
            "client": ("127.0.0.1", 12345),
            "server": ("127.0.0.1", 8000),
        }
        called = False

        async def call_next(_request):
            nonlocal called
            called = True
            return PlainTextResponse("route reached")

        response = asyncio.run(
            api.reject_untrusted_browser_origins(Request(scope), call_next)
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
