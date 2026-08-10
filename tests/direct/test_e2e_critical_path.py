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


def test_full_weather_policy_lifecycle_with_rejection(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 250 * GEN_WEI
    try:
        policy_id = contract.create_weather_policy(
            location="Nakuru County, Kenya",
            period="Mar 1 - May 31",
            coverage_text="Pay me 200 GEN if Nakuru receives less than 5mm of rain over any 15 consecutive days.",
            coverage_amount_gen=200,
            premium_gen=250,
        )
    finally:
        direct_vm.value = 0

    claim_id = contract.submit_claim(
        policy_id=policy_id,
        description="Believe drought conditions have been met this season.",
        evidence_urls="https://example.com/rainfall-data",
    )

    mock_two_stage_judgment(
        direct_vm,
        facts={"dry_days": 0, "rainfall_mm": 22},
        intent={
            "approved": False,
            "payout_amount": 0,
            "confidence": "0.93",
            "reasoning": "Public rainfall records show 22mm fell during the claimed window, well above the 5mm threshold.",
        },
    )
    status = contract.judge_claim(claim_id=claim_id)
    assert status == "rejected"

    policy_after = json.loads(contract.get_policy(policy_id=policy_id))
    assert policy_after["status"] == "active"  # rejection doesn't terminate the policy

    pool_after = json.loads(contract.get_pool_status())
    assert pool_after["reserved_liability_wei"] == str(200 * GEN_WEI)  # still reserved for a future claim


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
