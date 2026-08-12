"""
Windows compatibility shim for gltest's direct-mode message injection.

gltest.direct.loader._inject_message_to_fd0 (genlayer-test==0.29.2) does:
    os.dup2(fd, 0)   # duplicate the temp file's fd onto stdin
    os.close(fd)     # close the original fd
    os.unlink(path)  # delete the temp file

On POSIX this works because unlinking an open file just removes the
directory entry while the still-open fd (now living at fd 0) keeps the
data alive. On Windows, os.unlink refuses to remove a file that any
handle still has open - fd 0 still points at it via dup2 - so this raises
PermissionError (WinError 32) on every direct-mode contract deploy.

This is an upstream bug in the library, not in the contract under test.
We patch os.unlink to swallow exactly that failure so test collection
can proceed; the OS will actually delete the temp file once fd 0 is
closed/reused at process exit.
"""
import os

_original_unlink = os.unlink


def _tolerant_unlink(path, *args, **kwargs):
    try:
        _original_unlink(path, *args, **kwargs)
    except PermissionError:
        pass


os.unlink = _tolerant_unlink


# ----------------------------------------------------------------------------
# gltest.direct.wasi_mock._handle_web_render (genlayer-test==0.29.2) hardcodes
# `{"ok": {"image": b""}}` for mode="screenshot" REGARDLESS of any registered
# vm.mock_web(...) response - it only ever honors the mock body for text/html
# mode. The real SDK (genlayer/gl/nondet/web.py) then does
# `PIL.Image.open(io.BytesIO(raw))` on that image, which always fails on
# empty bytes with PIL.UnidentifiedImageError. This makes it impossible to
# direct-mode test any contract using mode="screenshot" with the stock
# library, independent of contract correctness.
#
# Patch the mock handler (not the SDK) so mode="screenshot" honors the
# registered mock's body as raw image bytes, exactly like text/html mode
# already does. Tests then register a real, tiny, valid PNG as the mock
# body so the full pipeline - including the real PIL decode - is genuinely
# exercised end-to-end.
# ----------------------------------------------------------------------------
from gltest.direct import wasi_mock as _wasi_mock


def _patched_handle_web_render(vm, data):
    url = data.get("url", "")
    mode = data.get("mode", "text")

    mock_data = vm._match_web_mock(url, "GET")
    if mock_data:
        body = mock_data.get("body", "")
        if "response" in mock_data:
            body = mock_data["response"].get("body", "")
        if mode == "screenshot":
            if isinstance(body, str):
                body = body.encode("utf-8")
            return {"ok": {"image": body}}
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        return {"ok": {"text": body}}

    strict = getattr(vm, "_strict_mock_mode", False)
    if strict:
        registered = [f"GET {p.pattern}" for p, r in vm._web_mocks]
        raise _wasi_mock.MockNotFoundError(
            f"[strict] No web mock for WebRender {url}\n"
            f"  Registered: {registered or '(none)'}"
        )

    live_handler = getattr(vm, "_live_web_handler", None)
    if live_handler is not None:
        resp = live_handler({"url": url, "method": "GET", "headers": {}, "body": None})
        resp_data = resp.get("ok", {}).get("response", {})
        body = resp_data.get("body", b"")
        if mode == "screenshot":
            if isinstance(body, str):
                body = body.encode("utf-8")
            return {"ok": {"image": body}}
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        return {"ok": {"text": body}}

    registered = [f"GET {p.pattern}" for p, r in vm._web_mocks]
    raise _wasi_mock.MockNotFoundError(
        f"No web mock for WebRender {url}\n"
        f"  Registered: {registered or '(none)'}"
    )


_wasi_mock._handle_web_render = _patched_handle_web_render


# ----------------------------------------------------------------------------
# gltest.direct.wasi_mock._handle_gl_call (genlayer-test==0.29.2) dispatches
# "ExecPrompt" requests (plain gl.nondet.exec_prompt calls) to mock_llm, but
# has NO case at all for "ExecPromptTemplate" - the request type the real SDK
# uses internally for gl.eq_principle.prompt_non_comparative/prompt_comparative
# (see genlayer/gl/eq_principle.py: leader_fn wraps our input through a
# second ExecPromptTemplate call with template="EqNonComparativeLeader").
# Unmocked, that falls through to "Unknown gl_call request type", the fd
# comes back invalid, and prompt_non_comparative silently resolves to None -
# meaning the Equivalence Principle itself, GenLayer's core consensus
# mechanism, cannot currently be exercised via gltest direct mode at all
# without this patch. This is a gap in the test harness, not in the SDK or
# in this contract.
#
# Fix: handle ExecPromptTemplate by faithfully echoing the leader's own
# "input" text back as the agreed answer - simulating an LLM that preserves
# a well-formed structured answer unchanged when asked to satisfy the given
# task/criteria against it (the realistic behavior for a well-formed input,
# which is what these tests are constructing). A test can still override
# this per-call by registering a normal vm.mock_llm(pattern, response) whose
# pattern matches the leader's "input" text, exactly as for a plain
# ExecPrompt call.
# ----------------------------------------------------------------------------
_original_handle_gl_call = _wasi_mock._handle_gl_call


def _patched_handle_gl_call(vm, request):
    if isinstance(request, dict) and "ExecPromptTemplate" in request:
        return _handle_exec_prompt_template(vm, request["ExecPromptTemplate"])
    return _original_handle_gl_call(vm, request)


def _handle_exec_prompt_template(vm, data):
    match_text = data.get("input") or data.get("validator_answer") or ""

    override = vm._match_llm_mock(match_text) if match_text else None
    if override is not None:
        if not isinstance(override, str):
            import json as _json
            override = _json.dumps(override)
        return {"ok": override}

    return {"ok": match_text}


_wasi_mock._handle_gl_call = _patched_handle_gl_call


# ----------------------------------------------------------------------------
# Shared helper for tests: LumenInsurance.judge_claim now runs TWO
# gl.nondet.exec_prompt calls (Stage A fact extraction, Stage B intent
# judgment), distinguished by fixed marker phrases in each prompt
# ("extracting objective facts only" vs "adjudicating an insurance claim's
# INTENT"). Registering both mocks by matching on those markers keeps every
# test's judgment outcome fully controllable without needing to know the
# exact wording of the rest of either prompt.
# ----------------------------------------------------------------------------
import json as _json


def mock_two_stage_judgment(direct_vm, facts: dict, intent: dict):
    """facts: the Stage A extraction result, e.g. {"is_cancelled": True,
    "delay_minutes": 240} or {"dry_days": 20, "rainfall_mm": 1}. Binding
    fields (record_matches_flight/record_matches_location, record_date/
    record_period_end, record_summary) default to "record matches, dated
    well before any realistic test policy's expiry" so existing callers
    that only care about the payout-relevant facts don't need to know about
    the binding gate -- pass them explicitly (e.g. record_matches_flight=
    False, or a record_date after the policy's expiry) to test
    binding-mismatch/expiry rejection. The expiry check itself is plain
    Python string comparison in the contract (_is_iso_date_on_or_before),
    not something this mock controls -- it only supplies the record's
    reported date.
    intent: the Stage B result, e.g. {"approved": True, "payout_amount": 500,
    "confidence": "0.95", "reasoning": "..."}."""
    facts = dict(facts)
    facts.setdefault("record_matches_flight", True)
    facts.setdefault("record_matches_location", True)
    facts.setdefault("record_date", "2020-01-01")
    facts.setdefault("record_period_end", "2020-01-01")
    facts.setdefault("record_summary", "Verified record matches the policy's stored details.")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"extracting objective facts only", _json.dumps(facts))
    direct_vm.mock_llm(r"adjudicating an insurance claim's INTENT", _json.dumps(intent))
