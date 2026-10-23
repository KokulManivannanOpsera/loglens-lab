from __future__ import annotations

import re


def _extract_lines(log: str, patterns: list[re.Pattern[str]]) -> list[str]:
    lines = [l.strip() for l in log.splitlines() if l.strip()]
    hits = [line for line in lines if any(p.search(line) for p in patterns)]
    return (hits or lines[:3])[:5]


def mock_diagnose(log_text: str) -> dict:
    log = log_text.strip()
    if not log:
        return {
            "provider": "mock",
            "summary": "No log text provided.",
            "likelyCause": "Empty input",
            "evidence": [],
            "nextSteps": ["Paste a CI log or load a fixture."],
            "confidence": "low",
            "needsHumanReview": True,
        }

    if re.search(r"log artifact not found|404|Skipping log download", log, re.I):
        return {
            "provider": "mock",
            "summary": "CI run exists but log content is missing.",
            "likelyCause": "Log artifact unavailable (404 / download skipped)",
            "evidence": _extract_lines(
                log, [re.compile(p, re.I) for p in (r"404", r"not found", r"Skipping log")]
            ),
            "nextSteps": [
                "Re-fetch the workflow artifacts",
                "Do not invent a failing test name",
                "Escalate if artifacts stay missing",
            ],
            "confidence": "high",
            "needsHumanReview": True,
        }

    if re.search(r"flaky|ETIMEDOUT|Timeout of \d+ms exceeded", log, re.I):
        return {
            "provider": "mock",
            "summary": "Failure looks like a timeout / flake, not a clear logic bug.",
            "likelyCause": "Flaky or network-timeout test",
            "evidence": _extract_lines(
                log, [re.compile(p, re.I) for p in (r"flaky", r"ETIMEDOUT", r"Timeout")]
            ),
            "nextSteps": [
                "Check if the test is marked flaky in the KB",
                "Re-run once before deep debugging",
                "Capture whether production traffic shows the same timeout",
            ],
            "confidence": "medium",
            "needsHumanReview": True,
        }

    if re.search(r"AssertionError|expected .+ to equal|FAILING|\d+ failing", log, re.I):
        return {
            "provider": "mock",
            "summary": "Unit test assertion failed; related commit may explain the change.",
            "likelyCause": "Failing assertion in unit tests",
            "evidence": _extract_lines(
                log,
                [
                    re.compile(p, re.I)
                    for p in (r"AssertionError", r"expected", r"Related commit", r"failing")
                ],
            ),
            "nextSteps": [
                "Open the failing test file from the stack trace",
                "Diff the related commit against the assertion",
                "Draft a PR comment only after human approve",
            ],
            "confidence": "high",
            "needsHumanReview": False,
        }

    return {
        "provider": "mock",
        "summary": "No strong pattern matched; refuse to guess a root cause.",
        "likelyCause": "Unknown — insufficient signal",
        "evidence": [l for l in log.splitlines() if l.strip()][:3],
        "nextSteps": [
            "Add more log context",
            "Try a fixture with a clearer failure",
            "Check whether runbook retrieval returned useful chunks",
        ],
        "confidence": "low",
        "needsHumanReview": True,
    }
