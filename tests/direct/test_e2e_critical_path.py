"""
Mandatory pre-submission deliverable: full happy-path critical journey with
assertions at every step, on a single contract instance -- not isolated unit
checks. Mirrors the exact sequence a real user + keeper would perform:

  Create policy (pay premium) -> Submit claim -> Judge claim (approved) ->
  pool accounting settles -> policy reaches terminal "paid" status.

Also proves the parallel weather-policy path and a pool-funded-by-a-third-
party scenario in the same run, since those are real supported flows.
"""
import json

import pytest

from conftest import mock_two_stage_judgment

CONTRACT_PATH = "contracts/LumenInsurance.py"
GEN_WEI = 1_000_000_000_000_000_000


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy(CONTRACT_PATH, sdk_version="v0.2.16")


def test_full_flight_policy_lifecycle_to_paid(contract, direct_vm, direct_alice):
    # 1. Alice creates a flight policy, paying her premium into the pool.
    direct_vm.sender = direct_alice
    direct_vm.value = 600 * GEN_WEI
    try:
        policy_id = contract.create_flight_policy(
            flight_number="BA287",
            flight_date="2026-09-12",
            coverage_text="Pay me 500 GEN if flight BA287 is delayed more than 3 hours or cancelled.",
            coverage_amount_gen=500,
            premium_gen=600,
            expiry="2026-09-12",
        )
    finally:
        direct_vm.value = 0
    assert policy_id == "pol_1"

    policy = json.loads(contract.get_policy(policy_id=policy_id))
    assert policy["status"] == "active"
    assert policy["owner"] == str(direct_alice)

    pool_after_purchase = json.loads(contract.get_pool_status())
    assert pool_after_purchase["pool_balance_wei"] == str(600 * GEN_WEI)
    assert pool_after_purchase["reserved_liability_wei"] == str(500 * GEN_WEI)

    # 2. Alice's flight is cancelled; she submits a claim with evidence.
    claim_id = contract.submit_claim(
        policy_id=policy_id,
        description="Flight BA287 (LHR to JFK) was cancelled on Sept 12 due to a mechanical fault.",
        evidence_urls="https://flightaware.com/live/flight/BA287, https://britishairways.com/flight-status",
    )
    assert claim_id == "clm_1"

    claim = json.loads(contract.get_claim(claim_id=claim_id))
    assert claim["status"] == "pending"

    # 3. GenLayer validators judge the claim -- consensus mocked to AGREE it's valid.
    mock_two_stage_judgment(
        direct_vm,
        facts={"is_cancelled": True, "delay_minutes": 240},
        intent={
            "approved": True,
            "payout_amount": 500,
            "confidence": "0.97",
            "reasoning": "FlightAware and the airline's own status page both independently confirm BA287 was cancelled on Sept 12, satisfying the policy's cancellation condition.",
        },
    )
    status = contract.judge_claim(claim_id=claim_id)
    assert status == "approved"

    # 4. Terminal state: claim approved, policy paid, pool debited, transfer attempted.
    claim_after = json.loads(contract.get_claim(claim_id=claim_id))
    assert claim_after["status"] == "approved"
    assert "cancelled" in claim_after["reasoning"]

    policy_after = json.loads(contract.get_policy(policy_id=policy_id))
    assert policy_after["status"] == "paid"

    pool_after_payout = json.loads(contract.get_pool_status())
    assert pool_after_payout["pool_balance_wei"] == str(100 * GEN_WEI)  # 600 premium - 500 payout
    assert pool_after_payout["reserved_liability_wei"] == "0"
    assert pool_after_payout["total_payouts_paid_wei"] == str(500 * GEN_WEI)

    # 5. Terminal-state protection: no further claims or re-judgment possible.
    with pytest.raises(Exception):
        contract.submit_claim(policy_id=policy_id, description="Trying to double-dip." + "x" * 10, evidence_urls="https://example.com")
    with pytest.raises(Exception):
        contract.judge_claim(claim_id=claim_id)


def test_full_weather_policy_lifecycle_not_triggered_then_triggered(contract, direct_vm, direct_alice, direct_bob):
    """Weather policies settle only through check_weather_trigger -- there is
    no owner-submitted claim path (submit_claim rejects non-flight policies
    outright, see TestClaimFlowSeparation). Anyone, including a third party
    like direct_bob acting as a keeper, may call the trigger; it's a safe
    no-op when the condition isn't met and settles for real once it is."""
    direct_vm.sender = direct_alice
    direct_vm.value = 250 * GEN_WEI
    try:
        policy_id = contract.create_weather_policy(
            location="Nakuru County, Kenya",
            period="Mar 1 - May 31",
            coverage_text="Pay me 200 GEN if Nakuru receives less than 5mm of rain over any 15 consecutive days.",
            coverage_amount_gen=200,
            premium_gen=250,
            expiry="2026-05-31",
        )
    finally:
        direct_vm.value = 0

    # 1. A keeper (direct_bob, not the policy owner) polls the trigger while
    # rainfall is still well above threshold -- safe no-op, no state change.
    direct_vm.sender = direct_bob
    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r"extracting objective facts only",
        json.dumps({"record_matches_location": True, "is_within_window": True, "dry_days": 0, "rainfall_mm": 22}),
    )
    result = json.loads(contract.check_weather_trigger(policy_id=policy_id))
    assert result["triggered"] is False

    policy_after_noop = json.loads(contract.get_policy(policy_id=policy_id))
    assert policy_after_noop["status"] == "active"  # untouched
    pool_after_noop = json.loads(contract.get_pool_status())
    assert pool_after_noop["reserved_liability_wei"] == str(200 * GEN_WEI)  # still reserved
    assert json.loads(contract.list_claims_by_policy(policy_id=policy_id)) == []  # no claim spam from the no-op

    # 2. Later, the drought condition is genuinely met -- the same keeper's
    # poll now settles the policy automatically. check_weather_trigger's
    # intent-stage prompt uses its own wording ("automatic parametric
    # trigger condition"), distinct from judge_claim's ("adjudicating an
    # insurance claim's INTENT"), so it's mocked directly here rather than
    # via mock_two_stage_judgment (which targets judge_claim's marker).
    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r"extracting objective facts only",
        json.dumps({"record_matches_location": True, "is_within_window": True, "dry_days": 20, "rainfall_mm": 1}),
    )
    direct_vm.mock_llm(
        r"automatic parametric trigger condition",
        json.dumps({
            "approved": True,
            "payout_amount": 200,
            "confidence": "0.96",
            "reasoning": "Independent rainfall records confirm only 1mm fell over a 20-day dry streak, satisfying the policy's 5mm/15-day threshold.",
        }),
    )
    triggered = json.loads(contract.check_weather_trigger(policy_id=policy_id))
    assert triggered["triggered"] is True
    assert triggered["claim_id"] == "clm_1"

    policy_after_paid = json.loads(contract.get_policy(policy_id=policy_id))
    assert policy_after_paid["status"] == "paid"

    claim = json.loads(contract.get_claim(claim_id="clm_1"))
    assert claim["status"] == "approved"
    assert claim["source"] == "auto_trigger"

    pool_after_paid = json.loads(contract.get_pool_status())
    assert pool_after_paid["reserved_liability_wei"] == "0"
    assert pool_after_paid["total_payouts_paid_wei"] == str(200 * GEN_WEI)

    # 3. Terminal-state protection: re-polling an already-paid policy reverts.
    with pytest.raises(Exception):
        contract.check_weather_trigger(policy_id=policy_id)


def test_third_party_can_fund_the_pool_without_owning_any_policy(contract, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = 1000 * GEN_WEI
    try:
        contract.add_pool_funds()
    finally:
        direct_vm.value = 0

    pool = json.loads(contract.get_pool_status())
    assert pool["pool_balance_wei"] == str(1000 * GEN_WEI)
    assert pool["total_premiums_collected_wei"] == "0"  # donation, not a premium
