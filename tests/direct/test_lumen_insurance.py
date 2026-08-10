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
