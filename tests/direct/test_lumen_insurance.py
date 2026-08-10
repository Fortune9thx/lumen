"""
Direct-mode tests for LumenInsurance (gltest's in-process WASI-mock VM, no
localnet/simulator needed). See tests/direct/conftest.py for the Windows +
gl.eq_principle mock-handler patches this suite relies on.

judge_claim's non-deterministic path is: gl.eq_principle.prompt_non_comparative(judge, ...)
where judge() itself calls gl.nondet.exec_prompt(prompt, response_format="json") and
returns json.dumps(result). That inner call is a plain "ExecPrompt" request, matched by
vm.mock_llm(pattern, response) same as any other contract. The outer equivalence-principle
call is an "ExecPromptTemplate" request; conftest.py's patched handler echoes judge()'s own
output back as the "agreed" answer by default, so mocking the inner ExecPrompt is sufficient
to control the outcome deterministically in tests.

Settlement is real fund custody: create_*_policy are payable (premium must be attached as
gl.message.value, in GEN wei), coverage is reserved against pool_balance at creation, and an
approved claim actually transfers coverage_amount_wei to the policy owner via
gl.evm.contract_interface (see contracts/LumenInsurance.py's _Recipient). direct_vm.value
sets the attached payable value for a call, same as direct_vm.sender sets the caller.
gltest's direct-mode WASI mock has no glsim contract-interface hook installed, so the actual
on-chain emit_transfer cannot be exercised here -- these tests verify the pool accounting
(balances, reservations, capacity checks) up to that point, which is the part fully under the
contract's own control and fully testable; the transfer itself needs live-network
verification (see SECURITY.md's "Fund safety / Checks-Effects-Interactions" section).
"""
import json
import pytest

from conftest import mock_two_stage_judgment

CONTRACT_PATH = "contracts/LumenInsurance.py"
GEN_WEI = 1_000_000_000_000_000_000


@pytest.fixture
def contract(direct_deploy):
    # Pinned to match the contract's own "Depends": "py-genlayer:..." header.
    return direct_deploy(CONTRACT_PATH, sdk_version="v0.2.16")


def _mock_approval(direct_vm, coverage_gen, reasoning="FlightAware and the airline's own status page both confirm BA287 was cancelled on Sept 12, satisfying the policy's cancellation condition."):
    mock_two_stage_judgment(
        direct_vm,
        facts={"is_cancelled": True, "delay_minutes": 240},
        intent={"approved": True, "payout_amount": coverage_gen, "confidence": "0.95", "reasoning": reasoning},
    )


def _mock_rejection(direct_vm, reasoning="Public tracking data shows BA287 landed only 40 minutes late on Sept 12, which does not meet the policy's 3-hour delay threshold."):
    mock_two_stage_judgment(
        direct_vm,
        facts={"is_cancelled": False, "delay_minutes": 40},
        intent={"approved": False, "payout_amount": 0, "confidence": "0.90", "reasoning": reasoning},
    )


def _create_flight_policy(contract, direct_vm, coverage_gen=100, premium_gen=150):
    # Note: on a cold/empty pool, premium_gen must be >= coverage_gen for the
    # capacity check to pass -- a single premium can't collateralize more than
    # itself until the pool has surplus from other policies or add_pool_funds.
    # Callers testing insufficient-capacity behavior pass their own amounts.
    direct_vm.value = premium_gen * GEN_WEI
    try:
        return contract.create_flight_policy(
            flight_number="BA287",
            flight_date="2026-09-12",
            coverage_text="Pay me $500 if flight BA287 is delayed more than 3 hours or cancelled.",
            coverage_amount_gen=coverage_gen,
            premium_gen=premium_gen,
            expiry="2026-09-12",
        )
    finally:
        direct_vm.value = 0


def _create_weather_policy(contract, direct_vm, coverage_gen=200, premium_gen=250):
    direct_vm.value = premium_gen * GEN_WEI
    try:
        return contract.create_weather_policy(
            location="Nakuru", period="Mar-May",
            coverage_text="Pay me $2000 if rainfall stays below 5mm for 15 consecutive days.",
            coverage_amount_gen=coverage_gen, premium_gen=premium_gen,
            expiry="2026-05-31",
        )
    finally:
        direct_vm.value = 0


class TestFlightPolicy:
    def test_create_flight_policy_stores_record_and_collects_premium(self, contract, direct_vm):
        policy_id = _create_flight_policy(contract, direct_vm)
        assert policy_id == "pol_1"

        record = json.loads(contract.get_policy(policy_id=policy_id))
        assert record["type"] == "flight"
        assert record["flight_number"] == "BA287"
        assert record["status"] == "active"
        assert record["coverage_amount"] == "100 GEN"
        assert record["coverage_amount_wei"] == str(100 * GEN_WEI)
        assert record["premium"] == "150 GEN"

        pool = json.loads(contract.get_pool_status())
        assert pool["pool_balance_wei"] == str(150 * GEN_WEI)
        assert pool["reserved_liability_wei"] == str(100 * GEN_WEI)
        assert pool["total_premiums_collected_wei"] == str(150 * GEN_WEI)

    def test_premium_payment_must_match_declared_premium(self, contract, direct_vm):
        direct_vm.value = 10 * GEN_WEI  # declared premium is 35 GEN, attaching only 10
        with pytest.raises(Exception):
            contract.create_flight_policy(
                flight_number="BA287", flight_date="2026-09-12",
                coverage_text="Pay $500 if cancelled.",
                coverage_amount_gen=500, premium_gen=35, expiry="2026-09-12",
            )
        direct_vm.value = 0

    def test_policy_rejected_when_pool_cannot_cover_coverage_after_credit(self, contract, direct_vm):
        # Pool starts empty; premium (1 GEN) can't possibly cover a 1,000,000 GEN payout.
        direct_vm.value = 1 * GEN_WEI
        with pytest.raises(Exception):
            contract.create_flight_policy(
                flight_number="BA287", flight_date="2026-09-12",
                coverage_text="Pay $1,000,000 if cancelled.",
                coverage_amount_gen=1_000_000, premium_gen=1, expiry="2026-09-12",
            )
        direct_vm.value = 0

    def test_policy_ids_increment_across_types(self, contract, direct_vm):
        first = _create_flight_policy(contract, direct_vm)
        second = _create_weather_policy(contract, direct_vm)
        assert first == "pol_1"
        assert second == "pol_2"

    def test_list_policies_by_owner_filters_correctly(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        first_record = json.loads(contract.get_policy(policy_id="pol_1"))
        owner = first_record["owner"]

        results = json.loads(contract.list_policies_by_owner(owner=owner))
        assert len(results) == 1
        assert results[0]["id"] == "pol_1"

        no_results = json.loads(contract.list_policies_by_owner(owner="0x000000000000000000000000000000000000dead"))
        assert no_results == []

    def test_get_policy_unknown_id_raises(self, contract):
        with pytest.raises(Exception):
            contract.get_policy(policy_id="pol_999")


class TestClaimLifecycle:
    def test_submit_claim_against_unknown_policy_raises(self, contract):
        with pytest.raises(Exception):
            contract.submit_claim(policy_id="pol_999", description="x" * 25, evidence_urls="https://flightaware.com/live/flight/BA287")

    def test_submit_claim_creates_pending_record(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        claim_id = contract.submit_claim(
            policy_id="pol_1",
            description="BA287 was cancelled on Sept 12.",
            evidence_urls="https://flightaware.com/live/flight/BA287",
        )
        assert claim_id == "clm_1"

        record = json.loads(contract.get_claim(claim_id=claim_id))
        assert record["policy_id"] == "pol_1"
        assert record["status"] == "pending"
        assert record["reasoning"] == ""

    def test_judge_claim_approves_pays_out_and_updates_pool(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm, coverage_gen=500, premium_gen=600)
        contract.submit_claim(
            policy_id="pol_1",
            description="BA287 was cancelled on Sept 12.",
            evidence_urls="https://flightaware.com/live/flight/BA287",
        )

        _mock_approval(direct_vm, coverage_gen=500)
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "approved"

        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert claim["status"] == "approved"
        assert "cancelled" in claim["reasoning"]

        policy = json.loads(contract.get_policy(policy_id="pol_1"))
        assert policy["status"] == "paid"

        pool = json.loads(contract.get_pool_status())
        assert pool["pool_balance_wei"] == str(100 * GEN_WEI)  # 600 premium - 500 payout
        assert pool["reserved_liability_wei"] == "0"
        assert pool["total_payouts_paid_wei"] == str(500 * GEN_WEI)

    def test_judge_claim_rejects_without_paying_out(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(
            policy_id="pol_1",
            description="BA287 landed 40 minutes late.",
            evidence_urls="https://flightaware.com/live/flight/BA287",
        )

        _mock_rejection(direct_vm)
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"

        policy = json.loads(contract.get_policy(policy_id="pol_1"))
        assert policy["status"] == "active"

        pool = json.loads(contract.get_pool_status())
        assert pool["reserved_liability_wei"] == str(100 * GEN_WEI)  # still reserved
        assert pool["total_payouts_paid_wei"] == "0"

    def test_judge_unknown_claim_raises(self, contract):
        with pytest.raises(Exception):
            contract.judge_claim(claim_id="clm_999")

    def test_list_claims_by_policy(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(policy_id="pol_1", description="first attempt" + "x" * 10, evidence_urls="https://flightaware.com/live/flight/BA287")
        _mock_rejection(direct_vm)
        contract.judge_claim(claim_id="clm_1")

        contract.submit_claim(policy_id="pol_1", description="second attempt" + "x" * 10, evidence_urls="https://flightaware.com/live/flight/BA287")

        claims = json.loads(contract.list_claims_by_policy(policy_id="pol_1"))
        assert len(claims) == 2
        assert claims[0]["status"] == "rejected"
        assert claims[1]["status"] == "pending"

    def test_get_claim_unknown_id_raises(self, contract):
        with pytest.raises(Exception):
            contract.get_claim(claim_id="clm_999")


class TestCancelPolicy:
    def test_owner_can_cancel_active_policy_and_release_reserve(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        contract.cancel_policy(policy_id="pol_1")

        policy = json.loads(contract.get_policy(policy_id="pol_1"))
        assert policy["status"] == "cancelled"

        pool = json.loads(contract.get_pool_status())
        assert pool["reserved_liability_wei"] == "0"

    def test_non_owner_cannot_cancel_policy(self, contract, direct_vm, direct_alice, direct_bob):
        direct_vm.sender = direct_alice
        _create_flight_policy(contract, direct_vm)

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.cancel_policy(policy_id="pol_1")

    def test_cannot_cancel_already_paid_policy(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm, coverage_gen=500, premium_gen=600)
        contract.submit_claim(policy_id="pol_1", description="x" * 25, evidence_urls="https://flightaware.com/live/flight/BA287")
        _mock_approval(direct_vm, coverage_gen=500)
        contract.judge_claim(claim_id="clm_1")

        with pytest.raises(Exception):
            contract.cancel_policy(policy_id="pol_1")


class TestPoolAdmin:
    def test_add_pool_funds_increases_balance(self, contract, direct_vm):
        direct_vm.value = 50 * GEN_WEI
        try:
            contract.add_pool_funds()
        finally:
            direct_vm.value = 0
        pool = json.loads(contract.get_pool_status())
        assert pool["pool_balance_wei"] == str(50 * GEN_WEI)

    def test_owner_can_withdraw_available_balance(self, contract, direct_vm):
        direct_vm.value = 50 * GEN_WEI
        try:
            contract.add_pool_funds()
        finally:
            direct_vm.value = 0
        contract.withdraw_from_pool(amount_gen=20)
        pool = json.loads(contract.get_pool_status())
        assert pool["pool_balance_wei"] == str(30 * GEN_WEI)

    def test_non_owner_cannot_withdraw(self, contract, direct_vm, direct_bob):
        direct_vm.value = 50 * GEN_WEI
        try:
            contract.add_pool_funds()
        finally:
            direct_vm.value = 0
        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.withdraw_from_pool(amount_gen=10)

    def test_cannot_withdraw_more_than_available_after_reservations(self, contract, direct_vm):
        # Seed the pool generously, then reserve almost all of it against a
        # policy -- only the small unreserved sliver should be withdrawable.
        direct_vm.value = 1000 * GEN_WEI
        try:
            contract.add_pool_funds()
        finally:
            direct_vm.value = 0
        _create_flight_policy(contract, direct_vm, coverage_gen=990, premium_gen=1)
        # pool=1001 GEN, reserved=990 GEN -> available_to_withdraw = 11 GEN
        with pytest.raises(Exception):
            contract.withdraw_from_pool(amount_gen=12)
        contract.withdraw_from_pool(amount_gen=11)  # exactly at the edge succeeds


class TestPauseCircuitBreaker:
    def test_owner_can_pause_and_unpause(self, contract):
        assert contract.is_paused() is False
        contract.pause_contract()
        assert contract.is_paused() is True
        contract.unpause_contract()
        assert contract.is_paused() is False

    def test_non_owner_cannot_pause(self, contract, direct_vm, direct_bob):
        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.pause_contract()

    def test_writes_blocked_while_paused(self, contract, direct_vm):
        contract.pause_contract()
        direct_vm.value = 35 * GEN_WEI
        try:
            with pytest.raises(Exception):
                contract.create_flight_policy(
                    flight_number="BA287", flight_date="2026-09-12",
                    coverage_text="Pay $500 if cancelled.",
                    coverage_amount_gen=500, premium_gen=35, expiry="2026-09-12",
                )
        finally:
            direct_vm.value = 0

    def test_cannot_double_pause(self, contract):
        contract.pause_contract()
        with pytest.raises(Exception):
            contract.pause_contract()


class TestBindingToPolicyDetails:
    """Steward review requirement: claim settlement must verify the actual
    flight/weather record and bind it to the policy's own stored identity
    fields, dates, and expiry -- Stage B's intent judgment must never even
    run if that binding check fails. Registering NO Stage-B mock in these
    tests is deliberate: if the binding gate regressed and the code fell
    through to Stage B anyway, gltest's wasi_mock would raise
    MockNotFoundError (test failure), not silently pass."""

    def test_record_not_matching_flight_number_or_date_rejects_before_stage_b(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled on Sept 12.", evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r"extracting objective facts only",
            json.dumps({
                "record_matches_flight": False, "is_within_window": True,
                "is_cancelled": False, "delay_minutes": 0,
                "record_summary": "Found a record for flight BA999, not BA287 -- no match.",
            }),
        )
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"

        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert "BA999" in claim["reasoning"] or "record_matches=False" in claim["reasoning"]
        assert claim["verified_facts"]["record_matches_flight"] is False

        pool = json.loads(contract.get_pool_status())
        assert pool["total_payouts_paid_wei"] == "0"

    def test_record_outside_expiry_window_rejects_before_stage_b(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled on Sept 12.", evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r"extracting objective facts only",
            json.dumps({
                "record_matches_flight": True, "is_within_window": False,
                "is_cancelled": True, "delay_minutes": 300,
                "record_summary": "Flight BA287 record found, but its date is after the policy's expiry.",
            }),
        )
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"

        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert claim["verified_facts"]["is_within_window"] is False
        pool = json.loads(contract.get_pool_status())
        assert pool["total_payouts_paid_wei"] == "0"

    def test_binding_fields_matching_and_within_window_reaches_and_can_pass_stage_b(self, contract, direct_vm):
        """Positive control: the binding gate isn't a permanent block --
        when the verified record genuinely matches, judgment proceeds
        normally and can still approve."""
        _create_flight_policy(contract, direct_vm, coverage_gen=500, premium_gen=600)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled on Sept 12.", evidence_urls="https://flightaware.com/live/flight/BA287")

        _mock_approval(direct_vm, coverage_gen=500)
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "approved"
        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert claim["verified_facts"]["record_matches_flight"] is True
        assert claim["verified_facts"]["is_within_window"] is True

    def test_missing_binding_fields_default_to_rejected_not_approved(self, contract, direct_vm):
        """A response that simply omits record_matches_flight/is_within_window
        entirely (as opposed to explicitly setting them False) must still
        fail closed -- strict boolean coercion treats a missing field the
        same as an untrue one, never defaulting to a pass."""
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled on Sept 12.", evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(r"extracting objective facts only", json.dumps({"is_cancelled": True, "delay_minutes": 300}))
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"


class TestStrictBooleanHandling:
    """Steward review requirement: `approved` (and any other critical boolean
    field) must be a real JSON boolean -- a string, number, null, or missing
    value must never be coerced into an approval-favoring True."""

    def test_approved_as_string_true_is_treated_as_malformed_and_rejected(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm, coverage_gen=500, premium_gen=600)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled.", evidence_urls="https://flightaware.com/live/flight/BA287")

        from conftest import mock_two_stage_judgment
        mock_two_stage_judgment(
            direct_vm,
            facts={"is_cancelled": True, "delay_minutes": 240},
            # "approved" is the STRING "true", not the JSON boolean true --
            # Python's bool("false") is also True, which is exactly the trap
            # strict coercion must avoid falling into.
            intent={"approved": "true", "payout_amount": 500, "confidence": "0.95", "reasoning": "hijacked string boolean"},
        )
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"

        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert "not a valid JSON boolean" in claim["reasoning"]
        pool = json.loads(contract.get_pool_status())
        assert pool["total_payouts_paid_wei"] == "0"

    def test_approved_as_number_one_is_treated_as_malformed_and_rejected(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm, coverage_gen=500, premium_gen=600)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled.", evidence_urls="https://flightaware.com/live/flight/BA287")

        from conftest import mock_two_stage_judgment
        mock_two_stage_judgment(
            direct_vm,
            facts={"is_cancelled": True, "delay_minutes": 240},
            intent={"approved": 1, "payout_amount": 500, "confidence": "0.95", "reasoning": "hijacked numeric boolean"},
        )
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"
        pool = json.loads(contract.get_pool_status())
        assert pool["total_payouts_paid_wei"] == "0"

    def test_is_cancelled_as_string_does_not_satisfy_backstop(self, contract, direct_vm):
        """A Stage-A extraction returning is_cancelled as the string "true"
        must coerce to False (safe default), so the deterministic backstop
        still correctly treats it as "no cancellation" rather than being
        tricked by Python's permissive bool() into treating it as True."""
        _create_flight_policy(contract, direct_vm)
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled.", evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r"extracting objective facts only",
            json.dumps({
                "record_matches_flight": True, "is_within_window": True,
                "is_cancelled": "true", "delay_minutes": 0,
            }),
        )
        # Even a Stage B claiming full approval must be overridden by the
        # deterministic backstop, since the strict-coerced facts show no
        # real cancellation and no delay.
        direct_vm.mock_llm(
            r"adjudicating an insurance claim's INTENT",
            json.dumps({"approved": True, "payout_amount": 100, "confidence": "0.99", "reasoning": "hijacked, contradicts verified facts"}),
        )
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"
        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert claim["verified_facts"]["is_cancelled"] is False


class TestClaimFlowSeparation:
    """Steward review requirement: no ambiguity between weather's
    "advertised automatic" trigger and the actual implementation -- weather
    policies must have exactly ONE settlement path (check_weather_trigger),
    not a parallel owner-submitted claim route that could also pay out the
    same policy."""

    def test_submit_claim_rejected_for_weather_policy(self, contract, direct_vm):
        _create_weather_policy(contract, direct_vm)
        with pytest.raises(Exception):
            contract.submit_claim(policy_id="pol_1", description="x" * 25, evidence_urls="https://example.com/rainfall")
        assert json.loads(contract.list_claims_by_policy(policy_id="pol_1")) == []

    def test_check_weather_trigger_rejected_for_flight_policy(self, contract, direct_vm):
        _create_flight_policy(contract, direct_vm)
        with pytest.raises(Exception):
            contract.check_weather_trigger(policy_id="pol_1")

    def test_check_weather_trigger_rejected_for_unknown_policy(self, contract):
        with pytest.raises(Exception):
            contract.check_weather_trigger(policy_id="pol_999")

    def test_check_weather_trigger_is_permissionless(self, contract, direct_vm, direct_bob):
        """Anyone, not just the policy owner, may call the trigger -- that's
        the point of a keeper-pollable automatic parametric path."""
        _create_weather_policy(contract, direct_vm)
        direct_vm.sender = direct_bob
        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r"extracting objective facts only",
            json.dumps({"record_matches_location": True, "is_within_window": True, "dry_days": 0, "rainfall_mm": 30}),
        )
        result = json.loads(contract.check_weather_trigger(policy_id="pol_1"))
        assert result["triggered"] is False  # no state change, but the call itself succeeds for a non-owner

    def test_check_weather_trigger_no_op_does_not_consume_a_claim_id(self, contract, direct_vm):
        _create_weather_policy(contract, direct_vm)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r"extracting objective facts only",
            json.dumps({"record_matches_location": False, "is_within_window": True, "dry_days": 0, "rainfall_mm": 0, "record_summary": "no matching record"}),
        )
        contract.check_weather_trigger(policy_id="pol_1")
        contract.check_weather_trigger(policy_id="pol_1")  # polled twice, still a no-op
        assert json.loads(contract.list_claims_by_policy(policy_id="pol_1")) == []
